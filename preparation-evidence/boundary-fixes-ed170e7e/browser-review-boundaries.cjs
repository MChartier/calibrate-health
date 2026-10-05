const fs=require('fs');fs.appendFileSync('firebase-421/e2e/expo-web/offline-workspace.spec.ts',`

test('a stale second tab queues day completion after durable food intent', async ({ page, context, ux }) => {
    await ux.install('populated');
    await page.goto('/today');
    await expect(page.getByRole('button', { name: 'Complete day', exact: true })).toBeVisible();
    const other = await context.newPage(); await ux.installOnPage(other);
    await other.goto('/food-log');
    let held = true; const applied: string[] = [];
    for (const tab of [page, other]) {
        expectApiFailure(tab, { method: 'POST', pathname: '/api/v1/food', status: 503 });
        await tab.route('**/api/v1/food', route => {
            if (route.request().method() !== 'POST') return route.fallback();
            if (held) return route.fulfill({ status: 503, json: { error: 'Unavailable', retryable: true } });
            applied.push('food'); return route.fulfill({ json: { id: 950, ...route.request().postDataJSON() } });
        });
        await tab.route('**/api/food-days', route => {
            if (route.request().method() !== 'PATCH') return route.fallback();
            applied.push('complete'); return route.fulfill({ json: { day: { date: '2026-07-21', status: 'COMPLETE', is_complete: true, is_representative: true } } });
        });
    }
    await other.getByRole('button', { name: 'Add food', exact: true }).click();
    const add = other.getByRole('dialog', { name: 'Add food', exact: true });
    await add.getByRole('radio', { name: 'Quick', exact: true }).click();
    await add.getByRole('textbox', { name: 'Calories', exact: true }).fill('200');
    await add.getByRole('textbox', { name: 'Food name (optional)', exact: true }).fill('Other tab oats');
    await add.getByRole('button', { name: 'Add & close', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Edit Other tab oats', exact: true })).toBeVisible();
    // The first tab has not refreshed its provider snapshot since the other tab queued the food.
    await expect(page.getByTestId('offline-workspace-status')).toHaveCount(0);
    await page.getByRole('button', { name: 'Complete day', exact: true }).click();
    await expect(page.getByTestId('offline-workspace-status')).toContainText('pending changes');
    expect(applied).toEqual([]);
    const queued = await page.evaluate(() => new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('calibrate-offline'); open.onsuccess = () => { const db = open.result; const request = db.transaction('queued_mutations').objectStore('queued_mutations').getAll(); request.onsuccess = () => { resolve(request.result.map(row => row.operation)); db.close(); }; request.onerror = () => reject(request.error); }; open.onerror = () => reject(open.error);
    }));
    expect(queued).toEqual(['food.create', 'food-day.set-status']);
    held = false;
    await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
    await expect.poll(() => applied).toEqual(['food', 'complete']);
    await other.close();
});

test('logout still clears the UI and revokes the browser session when intent storage rejects writes', async ({ page, ux }) => {
    await ux.install('populated'); await page.goto('/security');
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    let revocations = 0;
    await page.route('**/auth/logout', route => { revocations += 1; return route.fulfill({ json: { message: 'Signed out' } }); });
    await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
            if (key.includes('calibrate.logout.')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
            return original.call(this, key, value);
        };
    });
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect.poll(() => revocations).toBe(1);
});
`);
