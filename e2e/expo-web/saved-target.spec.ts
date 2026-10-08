import { expect, test, hideTransientPwaNotices, type AuthenticatedApiOptions } from './fixtures';

test('Daily Balance retains a saved target through completion, refetch and reload', async ({ page, ux }) => {
  const date = '2026-07-21';
  const options: AuthenticatedApiOptions = { foodDayStatus: 'OPEN', foodEntriesByDate: {
    [date]: [{ id: 31, meal_period: 'BREAKFAST', name: 'Synthetic daily intake', calories: 1800 }]
  } };
  await ux.install('populated', options);
  await page.route('**/api/v1/food-days**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/v1/food-days') return route.fallback();
    if (route.request().method() === 'PATCH') options.foodDayStatus = route.request().postDataJSON().status;
    const complete = options.foodDayStatus === 'COMPLETE';
    await route.fulfill({ json: {
      date: url.searchParams.get('date') ?? date, status: options.foodDayStatus, source: 'STORED', origin: 'USER',
      is_complete: complete, is_representative: complete, completed_at: null, updated_at: null,
      calorie_comparison: complete ? { consumed_kcal: 1800, target_kcal: 2000, maintenance_kcal: 2500, captured_at: date + 'T19:00:00Z' } : null
    } });
  });
  await page.goto('/today');
  await hideTransientPwaNotices(page);
  // Today's current plan is 2100; completing the day must use its saved 2000 target instead.
  await expect(page.getByLabel(/Daily balance\. 300 kcal remaining/)).toBeVisible();
  await page.getByRole('button', { name: 'Complete day', exact: true }).click();
  await expect(page.getByLabel(/Daily balance\. 200 kcal remaining/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Daily balance\. 200 kcal remaining/)).toBeVisible();
});

for (const comparison of [undefined, null]) {
  test(`legacy completed day stays unavailable with ${comparison === null ? 'null' : 'omitted'} comparison`, async ({ page, ux }) => {
    await ux.install('populated', { foodDayStatus: 'COMPLETE' });
    await page.route('**/api/v1/food-days?*', async route => route.fulfill({ json: {
      date: new URL(route.request().url()).searchParams.get('date'), status: 'COMPLETE', source: 'STORED', origin: 'USER',
      is_complete: true, is_representative: true, completed_at: null, updated_at: null, calorie_comparison: comparison
    } }));
    await page.goto('/today?date=2026-07-20');
    await expect(page.getByLabel(/Daily balance\. Saved target unavailable/)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/Daily balance\. Saved target unavailable/)).toBeVisible();
  });
}
