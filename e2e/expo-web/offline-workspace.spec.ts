import { expect, test, expectApiFailure, activateFixtureOffline } from './fixtures';

test('auth outage retains a local weigh-in across reload and replays after reconnection', async ({ page, ux }) => {
    await ux.install('populated');
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.includes('offline-workspace')))).toBe(true);
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 503 });
    const outage = async (route: import('@playwright/test').Route) => route.fulfill({
        status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication service unavailable', retryable: true })
    });
    await page.route('**/auth/me', outage);
    await page.reload();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('Pending reconnection');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await page.goto('/weight');
    const sheet = page.getByRole('dialog', { name: 'Weight entry' });
    await sheet.getByRole('textbox', { name: 'Weight in kilograms', exact: true }).fill('87.9');
    await sheet.getByRole('button', { name: /^(Log|Save) weight$/ }).click();
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await page.goto('/today');
    await expect(page.getByTestId('offline-workspace-status')).toContainText('1 pending changes');
    await page.reload();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('1 pending changes');
    let writes = 0;
    await page.route('**/api/v1/metrics', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        writes += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 900, date: '2026-07-21', weight: 87.9 }) });
    });
    await page.unroute('**/auth/me', outage);
    await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
    await expect(page.getByTestId('offline-workspace-status')).toHaveCount(0);
    expect(writes).toBe(1);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});


test('network loss still persists a local weigh-in immediately', async ({ page, ux }) => {
    await ux.install('populated');
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Daily balance', exact: true })).toBeVisible();
    await activateFixtureOffline(page);
    await page.getByRole('button', { name: "Today's weight. Weigh in. Log weight", exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Weight entry' });
    await sheet.getByRole('textbox', { name: 'Weight in kilograms', exact: true }).fill('87.9');
    await sheet.getByRole('button', { name: 'Log weight', exact: true }).click();
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('1 pending changes');
});
