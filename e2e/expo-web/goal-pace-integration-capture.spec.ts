import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, hideTransientPwaNotices } from './fixtures';
const stage = process.env.CALIBRATE_PACE_COMPARE_STAGE;
test('matched actual source goal pace comparison', async ({ page, ux }, testInfo) => {
  test.skip(!stage, 'Opt-in source comparison capture');
  const colorScheme = testInfo.project.name === 'desktop-chrome' ? 'light' : 'dark';
  await page.emulateMedia({ colorScheme });
  await ux.install('populated', { metrics: [{ id: 1, date: '2026-07-21', weight: 85 }] });
        let goal = { id: 7, start_weight: 90, target_weight: 75, target_date: '2027-02-01T00:00:00Z',
            created_at: '2026-01-01T12:00:00Z', daily_deficit: 500, plan_status: 'available', plan_reason_code: null,
            projection: { status: 'projected', projected_end_date: '2026-12-22', reason_code: null } };
        let writes = 0, creates = 0, loseResponse = false;
        const receipts = new Map<string, typeof goal>();
        const operations: string[] = [];
        await page.route('**/api/v1/goals', async (route) => {
            if (route.request().method() === 'POST') {
                creates++;
                const payload = route.request().postDataJSON();
                goal = { ...goal, ...payload, id: 8, created_at: '2026-07-21T19:00:00Z',
                    projection: { status: 'projected', projected_end_date: '2027-05-25', reason_code: null } };
            }
            return route.fulfill({ json: goal });
        });
        await page.route('**/api/v1/user/profile', async (route) => {
            await route.fulfill({ json: { profile: { timezone: 'America/Los_Angeles', date_of_birth: '1985-01-01', sex: 'MALE',
                        height_mm: 1800, activity_level: 'MODERATE', weight_unit: 'KG', height_unit: 'CM' }, latest_weight_grams: 85000,
                    goal_daily_deficit: goal.daily_deficit, calorieSummary: { dailyCalorieTarget: 2600 - goal.daily_deficit,
                        tdee: 2600, bmr: 2000, deficit: goal.daily_deficit, missing: [], planStatus: 'available', planReasonCode: null,
                        eligibility: { status: 'eligible', reasonCode: null, ageYears: 41, localDate: '2026-07-21' } } } });
        });
        await page.route('**/api/v1/goals/pace-options', route => route.fulfill({ json: {
                goal, expected_plan_version: String(writes).padStart(64, '0'), effective_local_date: '2026-07-21',
                eligibility: { status: 'eligible', reasonCode: null, ageYears: 41, localDate: '2026-07-21' }, bmr: 2000, tdee: 2600, minimumDailyCalorieTarget: 2000,
                planOptions: [250, 500, 750, 1000].map(dailyDeficit => ({ dailyDeficit, available: dailyDeficit <= 500,
                    dailyCalorieTarget: dailyDeficit <= 500 ? 2600 - dailyDeficit : null, reasonCode: dailyDeficit <= 500 ? null : 'TARGET_BELOW_MINIMUM' }))
            } }));
        await page.route('**/api/v1/goals/7/pace', async (route) => {
            const operation = route.request().headers()['x-client-operation-id'];
            operations.push(operation);
            if (!receipts.has(operation)) {
                writes++;
                goal = { ...goal, daily_deficit: route.request().postDataJSON().daily_deficit,
                    projection: { status: 'projected', projected_end_date: '2027-05-25', reason_code: null } };
                receipts.set(operation, goal);
            }
            if (loseResponse) {
                loseResponse = false;
                return route.fulfill({ status: 503, json: { message: 'Synthetic lost response after commit', retryable: true } });
            }
            return route.fulfill({ json: receipts.get(operation) });
        });

  const dir = path.resolve(process.env.CALIBRATE_PACE_COMPARE_DIR!);
  await mkdir(dir, { recursive: true });
  const prefix = stage + '-' + testInfo.project.name + '-' + colorScheme;
  const capture = async (state: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, prefix + '-' + state + '.png') });
  };
  await page.goto('/today');
  await hideTransientPwaNotices(page);
  const rail = page.getByTestId('web-navigation-rail');
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox())!.width).toBe(88);
  const progressTab = page.getByRole('tab', { name: 'Progress', exact: true });
  for (let count = 0; count < 60 && !await progressTab.evaluate(node => node === document.activeElement); count++) await page.keyboard.press('Tab');
  await expect(progressTab).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/progress$/);
  await expect(progressTab).toHaveAttribute('aria-selected', 'true');
  await hideTransientPwaNotices(page);
  await expect(page.getByText('33% complete')).toBeVisible();
  await expect(page.getByText('Current target: 2,100 kcal/day')).toBeVisible();
  const initialSnapshot = await page.getByTestId('progress-snapshot-card').boundingBox();
  const initialActions = await page.getByTestId('progress-snapshot-card').getByRole('button').allTextContents();
  await capture('initial');
  await page.getByRole('button', { name: 'Edit goal', exact: true }).click();
  await page.getByRole('combobox', { name: 'Select daily calorie change' }).click();
  await page.getByRole('option', { name: new RegExp('250 kcal/day deficit') }).click();
  await expect(page.getByRole('combobox', { name: 'Select daily calorie change' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('combobox', { name: 'Select daily calorie change' })).toContainText('250 kcal/day deficit');
  if (stage === 'after') await expect(page.getByText(/Started 2026-01-01/)).toBeVisible();
  await capture('editor');
  await page.getByRole('button', { name: stage === 'before' ? 'Save goal' : 'Save pace', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(stage === 'before' ? '0% complete' : '33% complete')).toBeVisible();
  await expect(page.getByText('Current target: 2,350 kcal/day')).toBeVisible();
  await capture('saved');
  expect(creates).toBe(stage === 'before' ? 1 : 0);
  expect(writes).toBe(stage === 'before' ? 0 : 1);
  expect(goal.start_weight).toBe(stage === 'before' ? 85 : 90);
  let integrationObservations = null;
  if (stage === 'after') {
    await page.getByRole('tab', { name: 'Today', exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
    await progressTab.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByText('33% complete')).toBeVisible();
    const edit = page.getByRole('button', { name: 'Edit goal', exact: true });
    await edit.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(edit).toBeFocused();
    await edit.click();
    await page.getByRole('button', { name: 'Set a new goal', exact: true }).click();
    const newGoal = page.getByRole('dialog', { name: 'Set a new goal', exact: true });
    await expect(newGoal).toBeVisible();
    await capture('intentional-new-goal');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(newGoal).toHaveCount(0);
    await expect(edit).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 1000 });
    await expect.poll(async () => (await rail.boundingBox())?.width).toBe(88);
    await edit.click();
    const currentEditor = page.getByRole('dialog', { name: 'Edit goal', exact: true });
    const controlBounds = {} as Record<string, unknown>;
    for (const label of ['Save pace', 'Cancel', 'Set a new goal']) {
      const button = currentEditor.getByRole('button', { name: label, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1024);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000);
      controlBounds[label] = bounds;
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await capture('editor-1024');
    await page.keyboard.press('Escape');
    await expect(currentEditor).toHaveCount(0);
    await expect(edit).toBeFocused();
    integrationObservations = { keyboardRailEntry: true, railReturn: true, editorEscapeRestoredFocus: true,
      cancelledNewGoalRestoredFocus: true, newGoalCreatesOnCancel: creates, viewport1024: { railWidth: 88, horizontalOverflow: 0, controlBounds } };
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await writeFile(path.join(dir, prefix + '.json'), JSON.stringify({
    integrationObservations,
    stage, source: process.env.CALIBRATE_PACE_COMPARE_SOURCE,
    captured_at: new Date().toISOString(), browser: page.context().browser()?.version(),
    viewport: page.viewportSize(), colorScheme, creates, writes, goal, initialSnapshot, initialActions,
    normalization: 'Shared hideTransientPwaNotices suppresses unrelated transient notices only.'
  }, null, 2) + '\n');
});
