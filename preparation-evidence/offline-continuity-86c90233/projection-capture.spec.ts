import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test, expectApiFailure, activateFixtureOffline, hideTransientPwaNotices } from './fixtures';

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
    await expect(page.getByTestId('today-weight-card')).toContainText('87.9 kg');
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeInViewport({ ratio: 1 });
    await capture(page, 'local-weight');
    await page.getByRole('button', { name: 'Review saved changes', exact: true }).click();
    const pending = page.getByRole('dialog', { name: 'Saved on this device' });
    await expect(pending).toContainText('Weight: 87.9 kg');
    await pending.getByRole('button', { name: /close/i }).click();
    // A successful cold auth must not erase cached tracking while endpoints are unavailable.
    await page.unroute('**/auth/me', outage);
    expectApiFailure(page, { method: 'GET', pathname: '/api/v1/profile', status: 503 });
    expectApiFailure(page, { method: 'POST', pathname: '/api/v1/metrics', status: 503 });
    const profileOutage = async (route: import('@playwright/test').Route) => route.fulfill({ status: 503, json: { error: 'Unavailable', retryable: true } });
    const metricOutage = async (route: import('@playwright/test').Route) => route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { error: 'Unavailable', retryable: true } }) : route.fallback();
    await page.route('**/api/v1/profile', profileOutage);
    await page.route('**/api/v1/metrics', metricOutage);
    let verifiedColdStarts = 0;
    page.on('response', response => { if (new URL(response.url()).pathname === '/auth/me' && response.status() === 200) verifiedColdStarts += 1; });
    await page.reload();
    await expect.poll(() => verifiedColdStarts).toBeGreaterThan(0);
    await expect(page.getByTestId('today-weight-card')).toContainText('87.9 kg');
    await page.route('**/auth/me', outage);
    await page.reload();
    await expect(page.getByTestId('today-weight-card')).toContainText('87.9 kg');
    await expect(page.getByText('360 kcal', { exact: true }).first()).toBeVisible();
    await page.unroute('**/api/v1/profile', profileOutage);
    await page.unroute('**/api/v1/metrics', metricOutage);
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
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await activateFixtureOffline(page);
    await page.getByRole('button', { name: "Today's weight. Weigh in. Log weight", exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Weight entry' });
    await sheet.getByRole('textbox', { name: 'Weight in kilograms', exact: true }).fill('87.9');
    await sheet.getByRole('button', { name: 'Log weight', exact: true }).click();
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('1 pending changes');
    await page.route('**/auth/me', (route) => route.abort('internetdisconnected'));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('1 pending changes');
    await page.getByRole('button', { name: 'Review saved changes', exact: true }).click();
    const pending = page.getByRole('dialog', { name: 'Saved on this device' });
    await expect(pending).toContainText('Weight: 87.9 kg');
    await pending.getByRole('button', { name: /close/i }).click();
    await page.getByRole('button', { name: "Today's weight. 87.9 kg. Edit weight", exact: true }).click();
    await sheet.getByRole('textbox', { name: 'Weight in kilograms', exact: true }).fill('87.8');
    await sheet.getByRole('button', { name: 'Save weight', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('today-weight-card')).toContainText('87.8 kg');
    await page.getByRole('button', { name: "Today's weight. 87.8 kg. Edit weight", exact: true }).click();
    await sheet.getByRole('button', { name: 'Delete weigh-in', exact: true }).click();
    await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('today-weight-card')).toContainText('Weigh in');
    await expect(page.getByTestId('offline-workspace-status')).toContainText('3 pending changes');
});

test('offline food additions and repeated edits are visible after restart and replay once before deletion', async ({ page, ux }) => {
    await ux.install('populated');
    let food: Array<{ id: number; name: string; calories: number; meal_period: string }> = [];
    const receipts = new Map<string, unknown>();
    let creations = 0;
    let edits = 0;
    let deletions = 0;
    await page.route('**/api/v1/food**', async route => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        if (url.pathname === '/api/v1/food' && method === 'GET') return route.fulfill({ json: food });
        if (url.pathname === '/api/v1/food' && method === 'POST') {
            const key = route.request().headers()['x-client-operation-id'];
            if (!receipts.has(key)) {
                const payload = route.request().postDataJSON();
                const row = { id: 901, name: payload.name, calories: payload.calories, meal_period: payload.meal_period };
                food.push(row); receipts.set(key, row); creations += 1;
            }
            return route.fulfill({ json: receipts.get(key) });
        }
        if (url.pathname === '/api/v1/food/901' && method === 'PATCH') {
            food = food.map(row => ({ ...row, ...route.request().postDataJSON() })); edits += 1;
            return route.fulfill({ json: food[0] });
        }
        if (url.pathname === '/api/v1/food/901' && method === 'DELETE') {
            food = []; deletions += 1; return route.fulfill({ status: 204 });
        }
        return route.fallback();
    });
    await page.goto('/food-log');
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeVisible();
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 503 });
    const outage = async (route: import('@playwright/test').Route) => route.fulfill({ status: 503, json: { error: 'Unavailable', retryable: true } });
    await page.route('**/auth/me', outage);
    await page.reload();
    await page.getByRole('button', { name: 'Add food', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add food', exact: true });
    await add.getByRole('radio', { name: 'Quick', exact: true }).click();
    await add.getByRole('textbox', { name: 'Calories', exact: true }).fill('200');
    await add.getByRole('textbox', { name: 'Food name (optional)', exact: true }).fill('Offline oats');
    await add.getByRole('button', { name: 'Add & close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit Offline oats', exact: true })).toBeVisible();
    for (const calories of ['300', '350']) {
        await page.getByRole('button', { name: 'Edit Offline oats', exact: true }).click();
        const edit = page.getByRole('dialog', { name: 'Edit food', exact: true });
        await edit.getByRole('textbox', { name: 'Calories', exact: true }).fill(calories);
        await edit.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByText(calories + ' kcal', { exact: true }).first()).toBeVisible();
    }
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit Offline oats', exact: true })).toBeVisible();
    await expect(page.getByText('350 kcal', { exact: true }).first()).toBeVisible();
    await capture(page, 'local-food');
    await page.getByRole('button', { name: 'Delete Offline oats', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit Offline oats', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('offline-workspace-status')).toContainText('4 pending changes', { timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit Offline oats', exact: true })).toHaveCount(0);
    await page.unroute('**/auth/me', outage);
    await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
    await expect(page.getByTestId('offline-workspace-status')).toHaveCount(0);
    expect({ creations, edits, deletions }).toEqual({ creations: 1, edits: 2, deletions: 1 });
    expect(food).toEqual([]);
});

test('a failed local creation offers explicit discard instead of saving unreachable corrections', async ({ page, ux }) => {
    await ux.install('populated');
    await page.goto('/food-log');
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeVisible();
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 503 });
    await page.route('**/auth/me', route => route.fulfill({ status: 503, json: { error: 'Unavailable', retryable: true } }));
    await page.reload();
    await page.getByRole('button', { name: 'Add food', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add food', exact: true });
    await add.getByRole('radio', { name: 'Quick', exact: true }).click();
    await add.getByRole('textbox', { name: 'Calories', exact: true }).fill('200');
    await add.getByRole('textbox', { name: 'Food name (optional)', exact: true }).fill('Failed oats');
    await add.getByRole('button', { name: 'Add & close', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Failed oats', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit food', exact: true });
    await edit.getByRole('textbox', { name: 'Calories', exact: true }).fill('300');
    await edit.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('2 pending changes');
    // Simulate a persisted nonretryable creation result; exercise the real IndexedDB queue and recovery UI.
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('calibrate-offline');
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('queued_mutations', 'readwrite');
            const store = tx.objectStore('queued_mutations');
            const rows = store.getAll();
            rows.onsuccess = () => {
                const creation = rows.result.find(row => row.operation === 'food.create');
                store.put({ ...creation, state: 'failed', lastError: 'My food not found' });
            };
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
    }));
    await page.reload();
    await page.getByRole('button', { name: 'Delete Failed oats', exact: true }).click();
    await expect(edit).toContainText('A correction cannot pass the failed write.');
    await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await edit.getByRole('button', { name: 'Discard failed entry', exact: true }).click();
    await expect(edit).toContainText('Other queued changes are kept.');
    await capture(page, 'failed-food');
    await edit.getByRole('button', { name: 'Confirm discard failed entry', exact: true }).click();
    await expect(edit).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Failed oats', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('offline-workspace-status')).toContainText('0 pending changes');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit Failed oats', exact: true })).toHaveCount(0);
});

const responses = new WeakMap<Page, Array<Promise<{ url: string; sha256: string }>>>();
test.beforeEach(async ({ page }) => {
    const reads: Array<Promise<{ url: string; sha256: string }>> = [];
    responses.set(page, reads);
    page.on('response', response => { if (new URL(response.url()).pathname.endsWith('.js')) reads.push(response.body().then(bytes => ({ url: response.url(), sha256: createHash('sha256').update(bytes).digest('hex') }))); });
});
async function capture(page: Page, name: string) {
    const dir = process.env.CAPTURE_DIR!;
    await mkdir(dir, { recursive: true });
    await hideTransientPwaNotices(page);
    await page.evaluate(() => document.fonts.ready);
    const imagePath = path.join(dir, name + '.png');
    await page.screenshot({ path: imagePath, fullPage: true });
    const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(dir, name + '-manifest.json'), JSON.stringify({
        source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
        capturedAt: new Date().toISOString(), browser: page.context().browser()?.version(), viewport: page.viewportSize(), deviceScale: await page.evaluate(() => devicePixelRatio), finalUrl: page.url(),
        assets: await Promise.all(responses.get(page) ?? []),
        imageSha256: hash(await readFile(imagePath)), fixtureSha256: hash(await readFile('e2e/expo-web/fixtures.ts')),
        harnessSha256: hash(await readFile('e2e/expo-web/offline-projection-capture.spec.ts'))
    }, null, 2));
}
