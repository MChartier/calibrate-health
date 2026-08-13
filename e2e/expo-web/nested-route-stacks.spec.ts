import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, expectApiFailure, hideTransientPwaNotices, test } from './fixtures';

const EVIDENCE_DIR = path.resolve('docs/screenshots/launch-07');

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

async function expectFocusedRouteTitle(page: Page, title: string, documentTitle: string) {
  const heading = page.locator('#route-focus-title');
  await expect(heading).toHaveText(title);
  await expect(heading).toBeFocused();
  await expect(page).toHaveTitle(documentTitle);
}

async function expectDirectEntryTitle(page: Page, title: string, documentTitle: string) {
  const heading = page.locator('#route-focus-title');
  await expect(heading).toHaveText(title);
  await expect(heading).not.toBeFocused();
  await expect(page).toHaveTitle(documentTitle);
}

async function capture(page: Page, filename: string) {
  if (process.env.CALIBRATE_CAPTURE_EVIDENCE !== '1') return;

  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, filename),
    fullPage: false,
  });
}

test('Trend keeps the app shell and browser Back returns through real Progress history', async ({ page, ux }) => {
  await page.setViewportSize({ width: 1_024, height: 1_000 });
  await ux.install('populated');
  await page.goto('/progress');
  await page.getByRole('button', { name: 'Open full weight trend', exact: true }).click();

  await expect(page).toHaveURL((url) => url.pathname === '/weight-trend');
  await expectFocusedRouteTitle(page, 'Trend', 'Trend - Calibrate');
  await expect(page.getByRole('button', { name: 'Go back', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open notifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account & settings', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'trend-desktop-1024x1000.png');

  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/progress');
  await expectFocusedRouteTitle(page, 'Progress', 'Progress - Calibrate');
});

test('Activity direct entry falls back to its registered Settings parent', async ({ page, ux }) => {
  await page.setViewportSize({ width: 1_024, height: 1_000 });
  await ux.install('populated');
  await page.goto('/activity');

  await expectDirectEntryTitle(page, 'Activity', 'Activity - Calibrate');
  await expect(page.getByRole('button', { name: 'Back to Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open notifications' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'activity-desktop-1024x1000.png');

  await page.getByRole('button', { name: 'Back to Settings', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/settings');
  await expectFocusedRouteTitle(page, 'Settings', 'Settings - Calibrate');
});

test('Food Log uses real Today history on a compact phone viewport', async ({ page, ux }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ux.install('populated');
  await page.goto('/today');
  await page.getByRole('button', { name: /Food log\..*View full log/ }).click();

  await expect(page).toHaveURL((url) => url.pathname === '/food-log');
  await expectFocusedRouteTitle(page, 'Food log', 'Food log - Calibrate');
  await expect(page.getByRole('button', { name: 'Go back', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'food-log-phone-320x568.png');

  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/today');
});

test('Saved Foods is discoverable from Settings and returns through real history', async ({ page, ux }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ux.install('populated');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Saved foods', exact: true }).click();

  await expect(page).toHaveURL((url) => url.pathname === '/my-foods');
  await expectFocusedRouteTitle(page, 'Saved foods', 'Saved foods - Calibrate');
  await expect(page.getByRole('button', { name: 'Go back', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'saved-foods-phone-320x568.png');

  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/settings');
});

test('signed-in not-found recovery returns to Today', async ({ page, ux }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ux.install('populated');
  expectApiFailure(page, { method: 'GET', pathname: '/missing-signed-in-page', status: 404 });
  await page.goto('/missing-signed-in-page');

  await expectDirectEntryTitle(page, 'Page not found', 'Page not found - Calibrate');
  await hideTransientPwaNotices(page);
  await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/today');
});

test('signed-out not-found recovery returns to the hosted home', async ({ page, ux }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ux.install('signed-out');
  expectApiFailure(page, { method: 'GET', pathname: '/missing-signed-out-page', status: 404 });
  expectApiFailure(page, { method: 'POST', pathname: '/auth/login', status: 401 });
  await page.route('**/auth/login', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({
      message: 'Not authenticated',
      code: 'NOT_AUTHENTICATED',
      retryable: false,
      request_id: 'fixture-signed-out',
    }),
  }));
  await page.goto('/missing-signed-out-page');

  await expectDirectEntryTitle(page, 'Page not found', 'Page not found - Calibrate');
  await page.getByRole('button', { name: 'Go to Calibrate home', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
});
