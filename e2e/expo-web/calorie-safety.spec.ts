import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

async function expectFullyWithinViewport(page: Page, locator: Locator) {
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
}

async function captureEvidence(
  page: Page,
  testInfo: TestInfo,
  names: Partial<Record<'desktop-chrome' | 'compact-phone-chrome', string>>,
  prepareDesktopCapture?: () => Promise<void>,
) {
  if (process.env.CALIBRATE_CAPTURE_EVIDENCE !== '1') return;
  const name = names[testInfo.project.name as keyof typeof names];
  if (!name) return;
  const evidenceDir = path.resolve('docs/screenshots/launch-04');
  await mkdir(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, name);
  if (testInfo.project.name === 'desktop-chrome') {
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Desktop evidence requires a configured viewport.');
    await page.setViewportSize({ width: 1_024, height: 1_000 });
    await prepareDesktopCapture?.();
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.setViewportSize(viewport);
    return;
  }
  await page.screenshot({ path: screenshotPath, fullPage: false });
}

async function advanceCompletedDraftToPace(page: Page) {
  await expect(page.getByText('Choose your weight goal', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Current', exact: true })).toHaveValue('88.2');
  await page.getByRole('textbox', { name: 'Target', exact: true }).fill('82');
  await page.getByRole('button', { name: 'Next: About you', exact: true }).click();
  await expect(page.getByText('Tell us the basics', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next: Calorie burn', exact: true }).click();
  await expect(page.getByText('Estimate calorie burn', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next: Pace', exact: true }).click();
  await expect(page.getByText('Set a sustainable pace', { exact: true })).toBeVisible();
}


test('server-unavailable options expose disabled semantics and safe reason copy', async ({ page, ux }, testInfo) => {
  await ux.install('populated', { caloriePlanFixture: 'selected-options-unavailable' });
  await page.goto('/onboarding');
  await advanceCompletedDraftToPace(page);

  const selector = page.getByRole('button', { name: 'Select daily calorie change', exact: true });
  await expect(selector).toContainText('Choose an available pace');
  await selector.click();

  const unsafeOption = page.getByRole('button').filter({
    has: page.getByText('500 kcal/day deficit', { exact: true }),
  });
  await expect(unsafeOption).toBeDisabled();
  await expect(unsafeOption).toContainText(
    'This choice would put the daily target below the server-calculated safety minimum.',
  );
  const menu = page.getByTestId('overlay-select-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(menu).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', { name: 'Next: Import', exact: true })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await captureEvidence(page, testInfo, {
    'desktop-chrome': 'plan-options-desktop.png',
  }, async () => {
    await page.getByRole('button', { name: 'Close options', exact: true }).evaluate((element: HTMLElement) => element.click());
    await expect(menu).toHaveCount(0);
    await selector.click();
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
});

test('reviewed plans keep history while suppressing target, projection, and calibration', async ({ page, ux }, testInfo) => {
  await ux.install('populated', { caloriePlanFixture: 'requires-review' });
  await page.goto('/today');

  await expect(page.getByText('Review calorie plan', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Plan needs review', { exact: true })).toBeVisible();
  await expect(page.getByText('360 kcal logged', { exact: true })).toBeVisible();
  await expect(page.getByText('kcal remaining', { exact: true })).toHaveCount(0);
  await expect(page.getByText('0%', { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await captureEvidence(page, testInfo, {
    'desktop-chrome': 'unsafe-plan-review-desktop.png',
    'compact-phone-chrome': 'unsafe-plan-review-compact-phone.png',
  }, async () => {
    await expectNoHorizontalOverflow(page);
    await expectFullyWithinViewport(page, page.getByTestId('food-log-summary-card'));
    await expectFullyWithinViewport(page, page.getByText('View', { exact: true }));
    await expectFullyWithinViewport(page, page.getByRole('button', { name: 'Add food', exact: true }));
  });

  await page.goto('/progress');
  await expect(page.getByText('88.2 kg', { exact: true })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Nov 20, 2026', { exact: true })).toHaveCount(0);
  await expect(page.getByText('See how your calorie plan is working', { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('safe server options keep maintenance goal editing functional', async ({ page, ux }) => {
  await ux.install('populated', { caloriePlanFixture: 'available' });
  await page.goto('/progress');

  await expect(page.getByText('Nov 20, 2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit goal', exact: true }).click();
  const editor = page.getByRole('dialog').filter({ hasText: 'Set a new goal' });
  await editor.getByRole('radio', { name: 'Maintain', exact: true }).click();
  await expect(editor.getByText('Maintenance goals use a steady calorie target with no daily deficit or surplus.')).toBeVisible();
  await expect(editor.getByText(/Server target: 2,600 kcal\/day/)).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Save goal', exact: true })).toBeEnabled();
  await expectNoHorizontalOverflow(page);
});
