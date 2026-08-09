import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';

const SCREENSHOT_OPTIONS = {
  animations: 'disabled',
  caret: 'hide',
  fullPage: false,
  maxDiffPixelRatio: 0.002,
  scale: 'css',
  stylePath: path.resolve('e2e/expo-web/launch-22-visual-screenshot.css'),
} as const;

const TRANSIENT_PWA_TITLES = new Set([
  'Back online',
  'Update ready',
  'Update failed',
  'Updating Calibrate',
]);

function runOn(testInfo: TestInfo, projects: readonly string[]) {
  test.skip(
    !projects.includes(testInfo.project.name),
    `This cross-cut is covered by ${projects.join(', ')}.`,
  );
}

async function settleVisualPage(page: Page) {
  await page.evaluate(async (transientTitles) => {
    await document.fonts.ready;
    const styleId = 'launch-22-visual-transient-notices';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = '[data-testid="pwa-back-online"], [data-testid="pwa-update-ready"], [data-testid="pwa-update-error"] { display: none !important; }';
    for (const notice of document.querySelectorAll<HTMLElement>('[role="status"], [role="alert"], [aria-live]')) {
      const noticeText = notice.textContent ?? '';
      if (transientTitles.some((title) => noticeText.includes(title))) notice.style.display = 'none';
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, [...TRANSIENT_PWA_TITLES]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

async function expectViewportScreenshot(page: Page, filename: string) {
  await settleVisualPage(page);
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot(filename, SCREENSHOT_OPTIONS);
}

async function applyTwoHundredPercentText(page: Page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const hasDirectText = Array.from(element.childNodes).some((node) => (
        node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())
      ));
      if (!hasDirectText) continue;

      const computed = getComputedStyle(element);
      const fontSize = Number.parseFloat(computed.fontSize);
      const lineHeight = Number.parseFloat(computed.lineHeight);
      if (Number.isFinite(fontSize)) element.style.fontSize = `${fontSize * 2}px`;
      if (Number.isFinite(lineHeight)) element.style.lineHeight = `${lineHeight * 2}px`;
    }
  });
}

test('populated Today remains stable in light mode at every release viewport', async ({ page, ux }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await ux.install('populated');
  await page.goto('/today');

  await expect(page.getByText('Fixture breakfast', { exact: true })).toBeVisible();
  await expectViewportScreenshot(page, 'today-populated-light.png');
});

test('empty Today remains legible in dark mode on phone and desktop', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-390', 'ux-desktop-1024']);
  await page.emulateMedia({ colorScheme: 'dark' });
  await ux.install('empty');
  await page.goto('/today');

  await expect(page.getByText('Nothing logged yet', { exact: true })).toBeVisible();
  await expectViewportScreenshot(page, 'today-empty-dark.png');
});

test('Today loading skeleton preserves compact-phone structure', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-390']);
  await page.emulateMedia({ colorScheme: 'light' });
  const controller = await ux.install('loading');

  try {
    await page.goto('/today');
    await expect(page.getByRole('button', { name: 'Previous day', exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Daily balance\./)).toHaveCount(0);
    await expectViewportScreenshot(page, 'today-loading-light.png');
  } finally {
    controller.releaseLoading();
  }
});

test('Today terminal error stays distinct from empty content on tablet', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-tablet-820']);
  await page.emulateMedia({ colorScheme: 'light' });
  await ux.install('failed-request');
  await page.goto('/today');

  await expect(page.getByText("Can't load today's log", { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing logged yet', { exact: true })).toHaveCount(0);
  await expectViewportScreenshot(page, 'today-error-light.png');
});

test('stale Food Log retains cached data and degraded labeling in dark mode', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-desktop-1440']);
  await page.emulateMedia({ colorScheme: 'dark' });
  await ux.install('stale');
  await page.goto('/today');
  await expect(page.getByText('Fixture breakfast', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Food log.*View full log/ }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/food-log');
  await expect(page.getByText("Couldn't refresh food log", { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Fixture breakfast', { exact: true })).toBeVisible();
  await expectViewportScreenshot(page, 'food-log-stale-dark.png');
});

test('offline Today keeps cached content and stale labeling on the smallest phone', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-320']);
  await page.emulateMedia({ colorScheme: 'light' });
  const controller = await ux.install('offline');
  await page.goto('/today');
  await expect(page.getByText('Fixture breakfast', { exact: true })).toBeVisible();

  await controller.activateOffline();
  await expect(page.getByText("You're offline", { exact: true })).toBeVisible();
  await expect(page.getByText('Offline - showing saved information', { exact: true })).toHaveCount(1);
  await expectViewportScreenshot(page, 'today-offline-light.png');
});

test('Progress uses the shell-owned cached-data notice while offline', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-desktop-1024']);
  const controller = await ux.install('offline');
  await page.route('**/api/v1/client-diagnostics', (route) => route.fulfill({ status: 204 }));
  await page.goto('/today');
  await expect(page.getByText('Fixture breakfast', { exact: true })).toBeVisible();
  await page.goto('/progress');
  await expect(page.getByText('Snapshot', { exact: true })).toBeVisible();

  await controller.activateOffline();
  await expect(page.getByText("You're offline", { exact: true })).toBeVisible();
  await expect(page.getByText('Offline - showing saved information', { exact: true })).toHaveCount(1);

  await expect(page).toHaveURL((url) => url.pathname === '/progress');
});

test('paused Today is explicit without implying a calorie target on tablet', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-tablet-820']);
  await page.emulateMedia({ colorScheme: 'dark' });
  await ux.install('paused');
  await page.goto('/today');

  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible();
  await expect(page.getByText('Tracking paused', { exact: true })).toBeVisible();
  await expectViewportScreenshot(page, 'today-paused-dark.png');
});

test('Settings remains understandable with forced colors', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-desktop-1024']);
  await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active' });
  await ux.install('populated');
  await page.route('**/auth/sessions', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sessions: [] }),
  }));
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expectViewportScreenshot(page, 'settings-forced-colors.png');
});

test('Today tolerates 200% text at the smallest release viewport', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-320']);
  await page.emulateMedia({ colorScheme: 'light' });
  await ux.install('populated');
  await page.goto('/today');
  await expect(page.getByText('Fixture breakfast', { exact: true })).toBeVisible();

  await applyTwoHundredPercentText(page);
  await expectViewportScreenshot(page, 'today-200-percent-text.png');
});

test('password reset exposes a visibly disabled submission state', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-390']);
  await page.emulateMedia({ colorScheme: 'light' });
  await ux.install('signed-out');
  await page.goto('/reset-password');

  await expect(page.getByRole('heading', { name: 'Choose a new password', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled();
  await expectViewportScreenshot(page, 'reset-password-disabled-light.png');
});

test('Settings export exposes a stable busy and disabled submission state', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-desktop-1024']);
  await page.emulateMedia({ colorScheme: 'dark' });
  await ux.install('populated');
  await page.route('**/auth/sessions', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sessions: [] }),
  }));

  let releaseExport = () => {};
  const exportReleased = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  await page.route('**/api/v1/user/account/export', async (route) => {
    await exportReleased;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        format: 'calibrate-account-export',
        version: 1,
        exported_at: '2026-07-21T19:00:00.000Z',
        account: {},
      }),
    });
  });

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByTestId('settings-export').click();
  const exportSheet = page.getByTestId('settings-export-sheet');
  await expect(exportSheet).toBeVisible();

  try {
    await exportSheet.getByRole('button', { name: 'Export account data', exact: true }).click();

    const busyButton = exportSheet.getByRole('button', { name: 'Preparing export...', exact: true });
    await expect(busyButton).toBeDisabled();
    await expectViewportScreenshot(page, 'settings-export-busy-dark.png');
  } finally {
    releaseExport();
  }
});

test('normal visual runs reject a missing baseline without recreating it', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-desktop-1024']);
  test.skip(testInfo.config.updateSnapshots !== 'none', 'The guarded updater intentionally writes baselines.');
  expect(testInfo.config.updateSnapshots).toBe('none');

  const probeName = 'normal-missing-baseline-contract.png';
  const probePath = testInfo.snapshotPath(probeName);
  expect(existsSync(probePath)).toBe(false);
  await ux.install('signed-out');
  await page.goto('/reset-password');
  await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled();

  let rejected = false;
  try {
    await expect(page).toHaveScreenshot(probeName, { ...SCREENSHOT_OPTIONS, timeout: 2_000 });
  } catch (error) {
    rejected = true;
    expect(String(error)).toMatch(/snapshot|screenshot|missing|exist/i);
  }
  expect(rejected).toBe(true);
  expect(existsSync(probePath)).toBe(false);
});

test('visual threshold contract rejects a 24px spacing shift above 0.2%', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-desktop-1024']);
  await page.emulateMedia({ colorScheme: 'light' });
  await ux.install('signed-out');
  await page.goto('/reset-password');
  await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled();

  const probeName = 'visual-diff-contract-probe.png';
  await expectViewportScreenshot(page, probeName);
  if (testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed') return;

  const resetPasswordMain = page.getByRole('main');
  await expect(resetPasswordMain).toBeVisible();
  const originalTransform = await resetPasswordMain.evaluate((element) => ({
    priority: element.style.getPropertyPriority('transform'),
    value: element.style.getPropertyValue('transform'),
  }));
  await resetPasswordMain.evaluate((element) => {
    element.style.setProperty('transform', 'translateX(24px)');
  });

  let rejected = false;
  try {
    await expect(page).toHaveScreenshot(probeName, {
      ...SCREENSHOT_OPTIONS,
      timeout: 2_000,
    });
  } catch (error) {
    rejected = true;
    expect(String(error)).toMatch(/different|diff|pixel|screenshot/i);
  } finally {
    await resetPasswordMain.evaluate((element, original) => {
      if (original.value) {
        element.style.setProperty('transform', original.value, original.priority);
        return;
      }
      element.style.removeProperty('transform');
    }, originalTransform);
  }
  expect(rejected).toBe(true);

  await expectViewportScreenshot(page, probeName);
});
