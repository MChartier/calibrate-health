import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, hideTransientPwaNotices, test, type UxHarness } from './fixtures';

const EVIDENCE_DIRECTORY = path.resolve('.codex-screenshots/self-hosting-web');
const SOURCE_COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const EXPECTED_COMMIT = process.env.CALIBRATE_SOURCE_COMMIT?.trim();

if (!/^[0-9a-f]{40}$/.test(SOURCE_COMMIT) || (EXPECTED_COMMIT && EXPECTED_COMMIT !== SOURCE_COMMIT)) {
  throw new Error('Web screenshot evidence must come from the exact checked-out candidate commit.');
}

// These are real web renders with intercepted synthetic responses, never a native UI substitute.
test.use({ colorScheme: 'light', serviceWorkers: 'block' });

async function restrictToLocalPreview(page: Page) {
  await page.route('**/*', async (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
      await route.abort('blockedbyclient');
      return;
    }
    await route.fallback();
  });
}

async function capture(page: Page, testInfo: TestInfo, surface: string) {
  await hideTransientPwaNotices(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.mouse.move(0, 0);
  const filename = `${testInfo.project.name}-${surface}`;
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const png = await page.screenshot({
    path: path.join(EVIDENCE_DIRECTORY, `${filename}.png`),
    animations: 'disabled', caret: 'hide', fullPage: false, scale: 'css',
  });
  await writeFile(path.join(EVIDENCE_DIRECTORY, `${filename}.json`), `${JSON.stringify({
    schema_version: 1,
    source_commit: SOURCE_COMMIT,
    workflow_commit: process.env.CALIBRATE_WORKFLOW_COMMIT?.trim() || null,
    pull_request_head_commit: process.env.CALIBRATE_PR_HEAD_COMMIT?.trim() || null,
    image: `${filename}.png`,
    image_sha256: createHash('sha256').update(png).digest('hex'),
    surface,
    route: new URL(page.url()).pathname,
    viewport: page.viewportSize(),
    project: testInfo.project.name,
    test_title: testInfo.title,
    test_retry: testInfo.retry,
    platform: 'web',
    browser: 'chromium',
    color_scheme: 'light',
    data: 'synthetic intercepted API fixtures; no live account or customer data',
    scope: 'Browser origin is the local self-hosted preview. Native server chooser is not covered.',
  }, null, 2)}\n`);
}

test('capture web sign-in evidence', async ({ page, ux }, testInfo) => {
  await ux.install('signed-out');
  await restrictToLocalPreview(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
  await capture(page, testInfo, 'sign-in');
});

async function installAdministrator(page: Page, ux: UxHarness) {
  await ux.install('populated');
  const member = {
    id: 18, email: 'member@example.invalid', role: 'member',
    email_verified: true, created_at: '2026-01-01T00:00:00.000Z',
  };
  let roleChangeRequests = 0;
  await page.route('**/api/v1/server-settings', (route) => route.fulfill({
    json: { is_admin: true, features: { nutrition_label_scanning: false } },
  }));
  await page.route('**/api/v1/server-settings/users?*', (route) => route.fulfill({
    json: { users: [member], next_cursor: null },
  }));
  await page.route('**/api/v1/server-settings/users/*/role', async (route) => {
    roleChangeRequests += 1;
    await route.fulfill({ status: 500, json: { message: 'Screenshot capture must not change roles.' } });
  });
  await restrictToLocalPreview(page);
  return { roleChangeRequests: () => roleChangeRequests };
}

test('capture service settings evidence', async ({ page, ux }, testInfo) => {
  await installAdministrator(page, ux);
  await page.goto('/settings');
  const serviceEntry = page.getByRole('button', { name: 'Service & hosting', exact: true });
  await expect(serviceEntry).toBeVisible();
  await serviceEntry.scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'settings-service-entry');

  await serviceEntry.click();
  await expect(page).toHaveURL((url) => url.pathname === '/service');
  await expect(page.getByRole('heading', { name: 'Your service', exact: true })).toBeVisible();
  await expect(page.getByText(/This browser stays connected to the website/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Server URL', exact: true })).toHaveCount(0);
  await capture(page, testInfo, 'service-hosting');
  await page.getByRole('heading', { name: 'Using another service', exact: true }).scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'service-browser-boundaries');
});

test('capture administrator overview evidence', async ({ page, ux }, testInfo) => {
  await installAdministrator(page, ux);
  await page.goto('/server-admin');
  await expect(page).toHaveURL((url) => url.pathname === '/server-admin');
  await expect(page.getByRole('heading', { name: 'Connected server', exact: true })).toBeVisible();
  await expect(page.getByText('Server responded', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'administrator-overview');
});

test('capture user roles and confirmation evidence', async ({ page, ux }, testInfo) => {
  const fixture = await installAdministrator(page, ux);
  await page.goto('/server-admin');
  const roles = page.getByRole('heading', { name: 'Users and roles', exact: true });
  const promote = page.getByRole('button', { name: 'Make administrator: member@example.invalid', exact: true });
  await expect(promote).toBeEnabled();
  await roles.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
  await capture(page, testInfo, 'users-and-roles');

  await promote.click();
  const dialog = page.getByRole('dialog', { name: 'Make this member an administrator?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm administrator access', exact: true })).toBeVisible();
  await capture(page, testInfo, 'administrator-confirmation');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.roleChangeRequests()).toBe(0);
});
