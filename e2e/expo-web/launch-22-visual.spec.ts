import { applyTwoHundredPercentText } from './text-scaling';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { installSavedFoodsFixture } from './saved-foods.fixture';
import { PLAN_CHECK_RECOMMENDATION_STATUS } from './plan-check.fixture';

const SCREENSHOT_OPTIONS = {
  animations: 'disabled',
  caret: 'hide',
  fullPage: false,
  maxDiffPixelRatio: 0.002,
  scale: 'css',
  stylePath: path.resolve('e2e/expo-web/launch-22-visual-screenshot.css'),
} as const;

// The editorial refresh is reviewed across form, list, overview, and analytical layouts in both themes.
const EDITORIAL_PROJECTS = ['ux-phone-320', 'ux-phone-390', 'ux-tablet-820', 'ux-desktop-1440'] as const;
const EDITORIAL_ROUTES = [
  { name: 'today', path: '/today', ready: 'Daily balance' },
  { name: 'food-log', path: '/food-log', ready: 'Meals' },
  { name: 'progress', path: '/progress', ready: 'Snapshot' },
  { name: 'settings', path: '/settings', ready: 'Browse settings' },
  { name: 'login', path: '/login', ready: 'Sign in' },
  { name: 'onboarding', path: '/onboarding', ready: 'Build your daily target' },
  { name: 'saved-foods', path: '/my-foods', ready: null },
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test(`plan check comparison and recommendation in ${scheme}`, async ({ page, ux }, testInfo) => {
    runOn(testInfo, EDITORIAL_PROJECTS);
    // Capture the complete section at each real device width, including content normally below the fold.
    await page.setViewportSize({ ...page.viewportSize()!, height: 1000 });
    await page.emulateMedia({ colorScheme: scheme });
    await ux.install('populated');
    await page.route('**/api/v1/calibration/status', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(PLAN_CHECK_RECOMMENDATION_STATUS),
    }));
    await page.goto('/progress');
    await page.getByTestId('plan-check-summary').click();
    await expect(page.getByTestId('expanded-plan')).toBeVisible();
    const section = page.getByTestId('plan-check-section');
    const review = section.getByRole('button', { name: 'Review suggested 1,750 calorie daily target' });
    await expect(review).toBeVisible();
    const metrics = await page.getByTestId('plan-check-metrics').evaluate(element =>
      Array.from(element.children).map(child => {
        const { x, y, width } = child.getBoundingClientRect();
        return { x, y, width };
      }));
    expect(metrics[0].y).toBe(metrics[1].y);
    expect(metrics[0].x + metrics[0].width).toBeLessThan(metrics[1].x);
    expect((await review.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(section).toHaveScreenshot(`plan-check-recommendation-${scheme}.png`, SCREENSHOT_OPTIONS);
    if (testInfo.project.name === 'ux-phone-320' && scheme === 'light') {
      await page.setViewportSize({ width: 320, height: 568 });
      await applyTwoHundredPercentText(page);
      const target = section.getByText('1,750', { exact: true });
      const targetSize = await target.evaluate(element => ({
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      }));
      expect(targetSize.height).toBeLessThanOrEqual(targetSize.lineHeight + 1);
      const overflow = await section.evaluate(element => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
    await review.click();
    await expect(page.getByRole('dialog', { name: 'Review calorie target', exact: true })).toBeVisible();
  });

  for (const surface of EDITORIAL_ROUTES) {
    test(`editorial ${surface.name} in ${scheme}`, async ({ page, ux }, testInfo) => {
      runOn(testInfo, EDITORIAL_PROJECTS);
      await page.emulateMedia({ colorScheme: scheme });
      await ux.install(surface.name === 'login' ? 'signed-out' : 'populated');
      if (surface.name === 'saved-foods') await installSavedFoodsFixture(page);
      await page.goto(surface.path);
      if (surface.ready) await expect(page.getByRole('heading', { name: surface.ready, exact: true })).toBeVisible();
      if (surface.name === 'saved-foods') await expect(page.getByText('Saved pantry 01', { exact: true })).toBeVisible();
      if (surface.name === 'today') {
        // Wait for measured layout to settle if loading selects a different scroll container.
        await expect(async () => {
          const hero = await page.getByTestId('calorie-balance-hero').evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const [gauge, copy] = Array.from(element.children).map((child) => child.getBoundingClientRect());
            return {
              gap: copy.left - gauge.right,
              leftOffset: gauge.left - bounds.left,
              rightOverflow: copy.right - bounds.right,
            };
          });
          const expectedHeroGap = page.viewportSize()!.width < 360 ? 12 : 20;
          expect(Math.abs(hero.gap - expectedHeroGap)).toBeLessThanOrEqual(1);
          expect(Math.abs(hero.leftOffset)).toBeLessThanOrEqual(1);
          expect(hero.rightOverflow).toBeLessThanOrEqual(1);
        }).toPass({ timeout: 10_000 });
      }
      if (surface.name === 'today' || surface.name === 'food-log') {
        const dateControl = page.getByRole('toolbar', { name: 'Food log date' });
        const geometry = await dateControl.getByRole('button').evaluateAll((elements) => elements.map((element) => ({
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
          border: Number.parseFloat(getComputedStyle(element).borderTopWidth),
        })));
        expect(geometry).toHaveLength(3);
        for (const control of geometry) {
          expect(control.width).toBeGreaterThanOrEqual(48);
          expect(control.height).toBeGreaterThanOrEqual(48);
          expect(control.border).toBe(0);
        }
        const toolbarBorder = await dateControl.evaluate(element => Number.parseFloat(getComputedStyle(element).borderTopWidth));
        expect(toolbarBorder).toBeGreaterThan(0);
      }
      await expectViewportScreenshot(page, `editorial-${surface.name}-${scheme}.png`);
    });
  }

  test(`editorial food search and amount confirmation in ${scheme}`, async ({ page, ux }, testInfo) => {
    runOn(testInfo, EDITORIAL_PROJECTS);
    await page.emulateMedia({ colorScheme: scheme });
    await ux.install('populated');
    await installSavedFoodsFixture(page);
    await page.route('**/api/v1/food/search**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], provider: 'usda' }),
    }));
    await page.goto('/today');
    await page.getByRole('button', { name: 'Add food', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Add food', exact: true });
    await sheet.getByRole('radio', { name: 'Search', exact: true }).click();
    await sheet.getByLabel('Search foods').fill('Saved pantry');
    await expect(sheet.getByRole('button', { name: 'Choose amount for Saved pantry 01', exact: true })).toBeVisible();
    await expectViewportScreenshot(page, `editorial-search-${scheme}.png`);
    await sheet.getByRole('button', { name: 'Choose amount for Saved pantry 01', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Add & close', exact: true })).toBeVisible();
    await expectViewportScreenshot(page, `editorial-amount-${scheme}.png`);
  });

  test(`editorial long recipe in ${scheme}`, async ({ page, ux }, testInfo) => {
    runOn(testInfo, EDITORIAL_PROJECTS);
    await page.emulateMedia({ colorScheme: scheme });
    await ux.install('populated');
    await installSavedFoodsFixture(page);
    await page.goto('/my-foods');
    await page.getByRole('button', { name: 'Create recipe', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Recipe builder', exact: true });
    await sheet.getByLabel('Recipe name').fill('Weekday breakfast bowl');
    for (let index = 1; index <= 6; index += 1) {
      await sheet.getByRole('button', { name: `Add Saved pantry ${String(index).padStart(2, '0')} to recipe`, exact: true }).click();
    }
    // Show the populated editing rows rather than the searchable source list above them.
    await sheet.getByRole('button', { name: 'Save recipe', exact: true }).scrollIntoViewIfNeeded();
    await expectViewportScreenshot(page, `editorial-recipe-${scheme}.png`);
  });
}

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
  await page.mouse.move(0, 0);
  await settleVisualPage(page);
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot(filename, SCREENSHOT_OPTIONS);
}

test('populated Today remains stable in light mode at every release viewport', async ({ page, ux }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await ux.install('populated');
  await page.goto('/today');

  await expect(page.getByTestId('today-food-preview').getByTestId('food-preview-meal-BREAKFAST').getByText('360 kcal', { exact: true })).toBeVisible();
  await expectViewportScreenshot(page, 'today-populated-light.png');
});

test('empty Today remains legible in dark mode on phone and desktop', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-390', 'ux-desktop-1024']);
  await page.emulateMedia({ colorScheme: 'dark' });
  await ux.install('empty');
  await page.goto('/today');

  await expect(page.getByText("No food logged yet", { exact: true })).toBeVisible();
  await expectViewportScreenshot(page, 'today-empty-dark.png');
});

test('Today loading skeleton preserves compact-phone structure', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-390']);
  await page.emulateMedia({ colorScheme: 'light' });
  const controller = await ux.install('loading');

  try {
    await page.goto('/today');
    await expect(page.getByRole('button', { name: 'Previous day', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Complete day', exact: true })).toBeDisabled();
    await expect(page.getByLabel(/^Daily balance\./)).toContainText('Loading day');
    await expect(page.getByText('Loading your food log', { exact: true })).toBeVisible();
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
  await expect(page.getByText("No food logged yet", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/^Daily balance\./)).toContainText('Day unavailable');
  await expect(page.getByText('Food log unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete day', exact: true })).toBeDisabled();
  await expectViewportScreenshot(page, 'today-error-light.png');
});

test('stale Food Log retains cached data and degraded labeling in dark mode', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-desktop-1440']);
  await page.emulateMedia({ colorScheme: 'dark' });
  await ux.install('stale');
  await page.goto('/today');
  await expect(page.getByTestId('today-food-preview').getByTestId('food-preview-meal-BREAKFAST').getByText('360 kcal', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Food log.*View full log/ }).click();
  await expect(page.getByTestId('expanded-food')).toBeVisible();
  await expect(page.getByText("Couldn't refresh food log", { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Fixture breakfast', { exact: true })).toBeVisible();
  await expectViewportScreenshot(page, 'food-log-stale-dark.png');
});

test('offline Today keeps cached content and stale labeling on the smallest phone', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-320']);
  await page.emulateMedia({ colorScheme: 'light' });
  const controller = await ux.install('offline');
  await page.goto('/today');
  await expect(page.getByTestId('today-food-preview').getByTestId('food-preview-meal-BREAKFAST').getByText('360 kcal', { exact: true })).toBeVisible();

  await controller.activateOffline();
  await expect(page.getByText("You're offline", { exact: true })).toBeVisible();
  await expect(page.getByText('Offline - showing saved information', { exact: true })).toHaveCount(1);
  // The offline banner reduces the shell below the fixed regions' minimum height.
  await expect(page.getByTestId('fixed-page-scroll')).toBeVisible();
  await expect(page.getByTestId('today-food-scroll')).toHaveCount(0);
  await expectViewportScreenshot(page, 'today-offline-light.png');
  const addFood = page.getByRole('button', { name: 'Add food', exact: true });
  await addFood.scrollIntoViewIfNeeded();
  await expect(addFood).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Complete day', exact: true })).toBeInViewport();
});

test('Progress uses the shell-owned cached-data notice while offline', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-desktop-1024']);
  const controller = await ux.install('offline');
  await page.route('**/api/v1/client-diagnostics', (route) => route.fulfill({ status: 204 }));
  await page.goto('/today');
  await expect(page.getByTestId('today-food-preview').getByTestId('food-preview-meal-BREAKFAST').getByText('360 kcal', { exact: true })).toBeVisible();
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

  await expect(page.getByRole('button', { name: 'Resume tracking', exact: true })).toBeVisible();
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

  await expect(page.getByRole('heading', { name: 'Settings', exact: true }).first()).toBeVisible();
  await expectViewportScreenshot(page, 'settings-forced-colors.png');
});

test('Today tolerates 200% text at the smallest release viewport', async ({ page, ux }, testInfo) => {
  runOn(testInfo, ['ux-phone-320']);
  await page.emulateMedia({ colorScheme: 'light' });
  await ux.install('populated');
  await page.goto('/today');
  await expect(page.getByTestId('today-food-preview').getByTestId('food-preview-meal-BREAKFAST').getByText('360 kcal', { exact: true })).toBeVisible();

  await applyTwoHundredPercentText(page);
  const metric = page.getByTestId('calorie-balance-value');
  const metricGeometry = await metric.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(metricGeometry.height).toBeLessThanOrEqual(metricGeometry.lineHeight + 1);
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
  await expect(page.getByRole('heading', { name: 'Settings', exact: true }).first()).toBeVisible();
  await page.getByTestId('settings-open-data').click();
  await expect(page).toHaveURL((url) => url.pathname === '/data');
  await page.getByTestId('settings-export').click();
  const exportSheet = page.getByTestId('settings-export-sheet');
  await expect(exportSheet).toBeVisible();

  try {
    await exportSheet.getByRole('button', { name: 'Export account data', exact: true }).click();

    const busyButton = exportSheet.getByRole('button', { name: 'Preparing export...', exact: true });
    await expect(busyButton).toBeDisabled();
    // The dialog is fixed-position; pin the inert page behind it so Windows font metrics
    // cannot leave a one-pixel scroll offset in the reviewed full-viewport baseline.
    await page.locator('main').evaluateAll((routes) => {
      for (const route of routes) route.scrollTop = 0;
    });
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
