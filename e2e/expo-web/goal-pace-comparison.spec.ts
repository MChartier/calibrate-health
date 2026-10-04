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
  await page.goto('/progress');
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
  await writeFile(path.join(dir, prefix + '.json'), JSON.stringify({
    stage, source: process.env.CALIBRATE_PACE_COMPARE_SOURCE,
    captured_at: new Date().toISOString(), browser: page.context().browser()?.version(),
    viewport: page.viewportSize(), colorScheme, creates, writes, goal, initialSnapshot, initialActions,
    normalization: 'Shared hideTransientPwaNotices suppresses unrelated transient notices only.'
  }, null, 2) + '\n');
});
