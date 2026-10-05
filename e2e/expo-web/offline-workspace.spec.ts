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
    await expect(page.getByTestId('today-weight-card')).toContainText('87.9 kg');
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeInViewport({ ratio: 1 });
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
    await edit.getByRole('button', { name: 'Confirm discard failed entry', exact: true }).click();
    await expect(edit).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Failed oats', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('offline-workspace-status')).toContainText('0 pending changes');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit Failed oats', exact: true })).toHaveCount(0);
});

test('logout terminates the browser session while tracking awaits reconnection', async ({ page, ux }) => {
    await ux.install('populated');
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.includes('offline-workspace')))).toBe(true);
    let terminated = false;
    let logoutRequests = 0;
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 503 });
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 401 });
    await page.route('**/auth/me', route => route.fulfill({ status: terminated ? 401 : 503, json: terminated ? { error: 'Not authenticated', code: 'NOT_AUTHENTICATED' } : { error: 'Unavailable', retryable: true } }));
    await page.route('**/auth/logout', route => {
        logoutRequests += 1;
        terminated = true;
        return route.fulfill({ json: { message: 'Signed out' } });
    });
    await page.goto('/security');
    await expect(page.getByTestId('offline-workspace-status')).toContainText('Pending reconnection');
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/login');
    await expect.poll(() => logoutRequests).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByTestId('offline-workspace-status')).toHaveCount(0);
});

test('offline logout stays signed out through reload, revokes after reconnect and permits a different account', async ({ page, ux }) => {
    await ux.install('populated');
    await page.goto('/security');
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    const original = await page.evaluate(async () => (await (await fetch('/auth/me', { credentials: 'include' })).json()).user);
    let sessionUser = original;
    let disconnected = false;
    let revocations = 0;
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 401 });
    await page.route('**/auth/me', route => disconnected ? route.abort('internetdisconnected') : sessionUser
        ? route.fulfill({ json: { user: sessionUser } })
        : route.fulfill({ status: 401, json: { code: 'NOT_AUTHENTICATED', error: 'Not authenticated' } }));
    await page.route('**/auth/logout', route => {
        if (disconnected) return route.abort('internetdisconnected');
        revocations += 1; sessionUser = null;
        return route.fulfill({ json: { message: 'Signed out' } });
    });
    await page.route('**/api/v1/client-config', route => route.fulfill({ json: { api_version: 1, api_versions: { supported: ['v1'] }, server_version: '0.37.0', min_supported_mobile_version: '0.0.0', min_supported_wear_version: '0.0.0', capabilities: {} } }));
    await page.route('**/auth/login', route => {
        expect(revocations).toBe(1);
        sessionUser = { ...original, id: 18, email: 'other@example.invalid' };
        return route.fulfill({ json: { user: sessionUser } });
    });
    await page.evaluate(async () => { localStorage.setItem('unrelated-local-data', 'keep'); await navigator.serviceWorker.ready; });
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Daily balance', exact: true })).toBeVisible();
    await page.getByRole('button', { name: "Today's weight. Weigh in. Log weight", exact: true }).click();
    const weight = page.getByRole('dialog', { name: 'Weight entry' });
    await expect(weight.getByRole('textbox', { name: 'Weight in kilograms', exact: true })).toBeVisible();
    disconnected = true;
    await activateFixtureOffline(page);
    await weight.getByRole('textbox', { name: 'Weight in kilograms', exact: true }).fill('87.9');
    await weight.getByRole('button', { name: /^(Log|Save) weight$/ }).click();
    await page.goto('/security');
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(revocations).toBe(0);
    disconnected = false;
    await page.context().setOffline(false);
    await expect.poll(() => revocations).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    // The exported app deliberately rejects HTTP sign-in. HTTPS preview exercises replacement-account login.
    if (new URL(page.url()).protocol === 'https:') {
        await page.getByRole('textbox', { name: 'Email', exact: true }).fill('other@example.invalid');
        await page.getByRole('textbox', { name: 'Password', exact: true }).fill('synthetic-password');
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    }
    expect(revocations).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('unrelated-local-data'))).toBe('keep');
    const queued = await page.evaluate(() => new Promise<Array<{ namespace: string; operation: string }>>((resolve, reject) => {
        const open = indexedDB.open('calibrate-offline');
        open.onsuccess = () => { const db = open.result; const tx = db.transaction('queued_mutations'); const rows = tx.objectStore('queued_mutations').getAll(); rows.onsuccess = () => { resolve(rows.result); db.close(); }; rows.onerror = () => reject(rows.error); };
        open.onerror = () => reject(open.error);
    }));
    expect(queued).toEqual([expect.objectContaining({ namespace: expect.stringContaining('::user:17'), operation: 'metric.add' })]);
});


test('failed edits on a server row require explicit recovery before correction or deletion', async ({ page, ux }) => {
    await ux.install('populated');
    await page.goto('/food-log');
    await expect(page.getByRole('button', { name: 'Edit Fixture breakfast', exact: true })).toBeVisible();
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 503 });
    const outage = async (route: import('@playwright/test').Route) => route.fulfill({ status: 503, json: { error: 'Unavailable', retryable: true } });
    await page.route('**/auth/me', outage);
    await page.reload();
    const edit = page.getByRole('dialog', { name: 'Edit food', exact: true });
    for (const value of ['400', '450']) {
        await page.getByRole('button', { name: 'Edit Fixture breakfast', exact: true }).click();
        await edit.getByRole('textbox', { name: 'Calories', exact: true }).fill(value);
        await edit.getByRole('button', { name: 'Save', exact: true }).click();
    }
    await expect(page.getByTestId('offline-workspace-status')).toContainText('2 pending changes');
    const markFailed = () => page.evaluate(() => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('calibrate-offline');
        open.onsuccess = () => { const db = open.result; const tx = db.transaction('queued_mutations', 'readwrite'); const store = tx.objectStore('queued_mutations'); const read = store.getAll();
            read.onsuccess = () => { const first = read.result.find(row => row.operation === 'food.update'); store.put({ ...first, state: 'failed', lastError: 'Food day paused' }); };
            tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
        open.onerror = () => reject(open.error);
    }));
    await markFailed(); await page.reload();
    await page.getByRole('button', { name: 'Delete Fixture breakfast', exact: true }).click();
    await expect(edit).toContainText('Saving another correction cannot pass the failed write.');
    await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await edit.getByRole('button', { name: 'Retry original change', exact: true }).click();
    await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await markFailed(); await page.reload();
    await page.getByRole('button', { name: 'Edit Fixture breakfast', exact: true }).click();
    await edit.getByRole('button', { name: 'Discard queued changes', exact: true }).click();
    await expect(edit).toContainText('This does not delete or undo any server record');
    await edit.getByRole('button', { name: 'Confirm discard queued changes', exact: true }).click();
    await expect(edit).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('0 pending changes');
    await page.getByRole('button', { name: 'Edit Fixture breakfast', exact: true }).click();
    await expect(edit.getByRole('textbox', { name: 'Calories', exact: true })).toHaveValue('360');
    await edit.getByRole('textbox', { name: 'Calories', exact: true }).fill('500');
    await edit.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('1 pending changes');
    const writes: unknown[] = [];
    await page.route('**/api/v1/food/*', async route => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        writes.push(route.request().postDataJSON());
        return route.fulfill({ json: { id: 11, name: 'Fixture breakfast', date: '2026-07-21', meal_period: 'breakfast', calories: 500 } });
    });
    await page.unroute('**/auth/me', outage);
    await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
    await expect(page.getByTestId('offline-workspace-status')).toHaveCount(0);
    expect(writes).toEqual([expect.objectContaining({ calories: 500 })]);
});
