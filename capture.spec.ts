import { test, expect, hideTransientPwaNotices } from '../goal-446/e2e/expo-web/fixtures';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

for (const [label, port, expectedStart] of [['before', 18446, 90], ['after', 18447, 85]] as const) {
  test(label + ' same-day weight correction', async ({ page, ux, request }) => {
    await ux.install('populated', { metrics: [{ id: 12, date: '2026-07-21', weight: 90 }] });
    await page.route('**/api/v1/goals', async route => {
      const response = await request.get(`http://127.0.0.1:${port}/goals`);
      await route.fulfill({ json: await response.json() });
    });
    await page.route('**/api/v1/metrics', async route => {
      if (route.request().method() === 'POST') {
        const response = await request.post(`http://127.0.0.1:${port}/metrics`, {
          data: route.request().postDataJSON(), headers: { 'x-client-operation-id': route.request().headers()['x-client-operation-id'] || 'capture-operation-446' }
        });
        await route.fulfill({ status: response.status(), json: await response.json() });
      } else {
        const response = await request.get(`http://127.0.0.1:${port}/metrics`);
        await route.fulfill({ json: await response.json() });
      }
    });
    // Seed and correct through the actual API route with synthetic persistence.
    const seed = await request.post(`http://127.0.0.1:${port}/metrics`, { data: { date: '2026-07-21', weight: 90 } });
    expect(seed.status()).toBe(200);
    const origin = `http://127.0.0.1:${label === 'before' ? 18444 : 18445}`;
    await page.goto(origin + '/weight');
    await hideTransientPwaNotices(page);
    await page.screenshot({ path: path.resolve(__dirname, label + '-weight-screen.png') });
    // The correction uses the same real API route as the UI. Navigation/reload below
    // independently demonstrates that the stored baseline reaches the actual Progress UI.
    const corrected = await request.post(`http://127.0.0.1:${port}/metrics`, { data: { date: '2026-07-21', weight: 85 }, headers: { 'x-client-operation-id': randomUUID() } });
    expect(corrected.status()).toBe(200);
    await page.goto(origin + '/progress');
    await hideTransientPwaNotices(page);
    await expect(page.getByText(`Start ${expectedStart} kg`, { exact: true })).toBeVisible();
    await page.screenshot({ path: path.resolve(__dirname, label + '.png'), fullPage: true });
    fs.writeFileSync(path.resolve(__dirname, label + '-response.json'), JSON.stringify({ metric: await corrected.json(), goal: await (await request.get(`http://127.0.0.1:${port}/goals`)).json() }, null, 2));
  });
}
