import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, expectApiFailure, hideTransientPwaNotices, type AuthenticatedApiOptions } from './fixtures';
import { calibrateDesignTokens } from '../../shared/designTokens';
import { applyTwoHundredPercentText } from './text-scaling';
import { expectNoBlockingAccessibilityViolations } from './ux-a11y';

const comparisons = [
  [0, 2000, 2500, 'target'], [1999, 2000, 2500, 'target'], [2000, 2000, 2500, 'target'],
  [2001, 2000, 2500, 'between'], [2499, 2000, 2500, 'between'], [2500, 2000, 2500, 'between'], [2501, 2000, 2500, 'beyond'],
  [2499, 3000, 2500, 'beyond'], [2500, 3000, 2500, 'between'], [2501, 3000, 2500, 'between'],
  [2999, 3000, 2500, 'between'], [3000, 3000, 2500, 'target'], [3001, 3000, 2500, 'target'],
  [2499, 2500, 2500, 'target'], [2500, 2500, 2500, 'target'], [2501, 2500, 2500, 'beyond']
] as const;
function date(number: number) { return `2026-07-${String(number).padStart(2, '0')}`; }
function row(number: number, status = 'COMPLETE', source = 'STORED') {
  return { date: date(number), status, source, origin: 'USER', is_complete: status === 'COMPLETE', is_representative: status === 'COMPLETE', completed_at: null, updated_at: null, calorie_comparison: null as null | { consumed_kcal: number; target_kcal: number; maintenance_kcal: number; captured_at: string } };
}
function history() {
  return [...comparisons.map(([consumed, target, maintenance], index) => ({ ...row(index + 1), calorie_comparison: {
    consumed_kcal: consumed, target_kcal: target, maintenance_kcal: maintenance, captured_at: date(index + 1) + 'T19:00:00Z'
  } })), row(17), row(18, 'INCOMPLETE'), row(19, 'INCOMPLETE', 'INFERRED_EMPTY'), row(20, 'PAUSED'), row(21, 'OPEN')];
}
function rgb(hex: string) { return `rgb(${[1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(', ')})`; }

for (const colorScheme of ['light', 'dark'] as const) {
  test(`completed calendar boundaries and selection in ${colorScheme}`, async ({ page, ux }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await ux.install('populated');
    await page.route('**/api/v1/food-days/range?*', route => route.fulfill({ json: { start_date: date(1), end_date: date(21), days: history() } }));
    await page.goto('/today');
    await hideTransientPwaNotices(page);
    await page.getByRole('button', { name: 'Choose date', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Calendar' })).toBeVisible();
    const colors = calibrateDesignTokens.schemes[colorScheme];
    for (const [index, [consumed, target, maintenance, band]] of comparisons.entries()) {
      const day = page.getByTestId(`calendar-day-${date(index + 1)}`);
      const gain = target > maintenance;
      let label = gain ? 'at or above target' : 'at or below target';
      if (band === 'between') label = gain ? 'below target, at or above maintenance' : 'above target, at or below maintenance';
      if (band === 'beyond') label = gain ? 'below maintenance' : 'above maintenance';
      await expect(day, `${consumed}/${target}/${maintenance}`).toHaveAccessibleName(new RegExp('completed, ' + label));
      const background = { target: colors.success, between: colors.calendarBetween, beyond: colors.calendarBeyond }[band];
      await expect(page.getByTestId(`calendar-date-badge-${date(index + 1)}`)).toHaveCSS('background-color', rgb(background));
      await expect(day).toContainText({ target: 'T', between: 'M', beyond: 'B' }[band]);
    }
    await expect(page.getByTestId('calendar-day-2026-07-17')).toHaveAccessibleName(/completed, comparison unavailable/);
    await expect(page.getByTestId('calendar-day-2026-07-18')).toHaveAccessibleName(/incomplete/);
    await expect(page.getByTestId('calendar-day-2026-07-19')).toHaveAccessibleName(/not started/);
    await expect(page.getByTestId('calendar-day-2026-07-20')).toHaveAccessibleName(/tracking paused/);
    await expect(page.getByTestId('calendar-day-2026-07-22')).toBeDisabled();
    await page.getByTestId('calendar-day-2026-07-09').click();
    await expect(page.getByRole('dialog', { name: 'Calendar' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose date', exact: true }).click();
    await expect(page.getByTestId('calendar-day-2026-07-09')).toHaveAccessibleName(/completed, below target, at or above maintenance, selected$/);
    await page.evaluate(() => document.fonts.ready);
    const evidenceDir = process.env.CALIBRATE_CALENDAR_EVIDENCE_DIR;
    const screenshot = evidenceDir ? path.resolve(evidenceDir, `${testInfo.project.name}-${colorScheme}.png`) : testInfo.outputPath(`calendar-${colorScheme}.png`);
    await mkdir(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot });
    await testInfo.attach('Completed calendar', { path: screenshot, contentType: 'image/png' });
    await expectNoBlockingAccessibilityViolations(page, testInfo, { kind: 'route', surfaceId: 'completed-calendar' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Calendar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Choose date', exact: true })).toBeFocused();
  });
}

test('calendar refresh, uncached month failure, retry, and completion reopening stay honest', async ({ page, ux }, testInfo) => {
  test.skip(test.info().project.name !== 'desktop-chrome');
  const options: AuthenticatedApiOptions = { foodDayStatus: 'COMPLETE', foodEntriesByDate: { '2026-07-21': [{ id: 31, meal_period: 'BREAKFAST', name: 'Synthetic daily intake', calories: 2000 }] } };
  await ux.install('populated', options);
  const days = history();
  days[20] = { ...row(21), calorie_comparison: { consumed_kcal: 2000, target_kcal: 2000, maintenance_kcal: 2500, captured_at: '2026-07-21T19:00:00Z' } };
  await page.route('**/api/v1/food/31', async route => {
    if (route.request().method() === 'PATCH') {
      expect(options.foodDayStatus).toBe('OPEN');
      days[20].calorie_comparison!.consumed_kcal = route.request().postDataJSON().calories;
    }
    await route.fallback();
  });
  let fail = false;
  await page.route('**/api/v1/food-days/range?*', async route => {
    if (fail) return route.fulfill({ status: 503, json: { message: 'Synthetic unavailable history' } });
    const url = new URL(route.request().url());
    const start = url.searchParams.get('start')!;
    return route.fulfill({ json: { start_date: start, end_date: url.searchParams.get('end'), days: start.startsWith('2026-07') ? days : [] } });
  });
  await page.route('**/api/v1/food-days', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const payload = route.request().postDataJSON();
    options.foodDayStatus = payload.status ?? (payload.is_complete ? 'COMPLETE' : 'OPEN');
    days[20].status = options.foodDayStatus!;
    days[20].is_complete = options.foodDayStatus === 'COMPLETE';
    await route.fulfill({ json: days[20] });
  });
  await page.goto('/today'); await hideTransientPwaNotices(page);
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  await expect(page.getByTestId('calendar-day-2026-07-21')).toHaveAccessibleName(/completed, at or below target/);
  await page.getByRole('button', { name: 'Close date picker' }).click();
  await page.getByRole('button', { name: 'Day completed', exact: true }).click();
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  await expect(page.getByTestId('calendar-day-2026-07-21')).toHaveAccessibleName(/in progress/);
  await page.getByRole('button', { name: 'Close date picker' }).click();
  await page.getByTestId('today-food-preview').click();
  await page.getByRole('button', { name: 'Edit Synthetic daily intake', exact: true }).click();
  await page.getByRole('textbox', { name: 'Calories', exact: true }).fill('2501');
  await page.screenshot({ path: testInfo.outputPath('calendar-food-edit.png') });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('1 food | 2,501 kcal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Food log', exact: true }).click();
  await page.getByRole('button', { name: 'Complete day', exact: true }).click();
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  await expect(page.getByTestId('calendar-day-2026-07-21')).toHaveAccessibleName(/completed, above maintenance/);
  await page.screenshot({ path: testInfo.outputPath('calendar-recompleted-after-edit.png') });
  expectApiFailure(page, { method: 'GET', pathname: '/api/v1/food-days/range', status: 503 });
  fail = true;
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.getByText("Can't load tracking history", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('calendar-day-2026-07-21')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('calendar-request-failure.png') });
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('calendar-day-2026-06-21')).toBeVisible();
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByTestId('calendar-day-2026-07-21')).toHaveAccessibleName(/completed, above maintenance/);
});

test('calendar remains usable with enlarged text on a small browser viewport', async ({ page, ux }, testInfo) => {
  test.skip(testInfo.project.name !== 'compact-phone-chrome');
  await ux.install('populated');
  await page.route('**/api/v1/food-days/range?*', route => route.fulfill({ json: { start_date: date(1), end_date: date(21), days: history() } }));
  await page.goto('/today'); await hideTransientPwaNotices(page);
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  await expect(page.getByTestId('calendar-day-2026-07-17')).toBeVisible();
  await applyTwoHundredPercentText(page);
  const legend = page.getByText('Complete: comparison unavailable', { exact: true });
  await legend.scrollIntoViewIfNeeded(); await expect(legend).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const dialog = page.getByRole('dialog', { name: 'Calendar' });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('calendar-large-text-legend.png') });
  await page.getByTestId('calendar-day-2026-07-12').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('calendar-large-text-days.png') });
  await page.getByTestId('calendar-day-2026-07-12').click();
  await expect(dialog).toHaveCount(0);
});
