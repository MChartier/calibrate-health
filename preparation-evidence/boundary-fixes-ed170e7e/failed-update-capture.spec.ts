import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, hideTransientPwaNotices } from './fixtures';
test('matched failed server food update recovery', async ({ page, ux }) => {
    const assets: Array<{ url: string; sha256: string }> = [];
    const reads: Promise<void>[] = [];
    page.on('response', (response) => {
        if (new URL(response.url()).pathname.endsWith('.js')) reads.push(response.body().then((body) => {
            assets.push({ url: response.url(), sha256: createHash('sha256').update(body).digest('hex') });
        }));
    });
    await ux.install('populated');
    await page.goto('/food-log');
    await expect(page.getByRole('button', { name: 'Edit Fixture breakfast', exact: true })).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('calibrate-offline');
        open.onsuccess = () => { const db = open.result; const tx = db.transaction('queued_mutations', 'readwrite'); const store = tx.objectStore('queued_mutations');
            for (const [id, calories, state] of [['failed-edit', 400, 'failed'], ['later-edit', 450, 'pending']] as const) store.add({ id, namespace: location.origin + '::user:17', operation: 'food.update', payloadJson: JSON.stringify({ id: 31, date: '2026-07-21', update: { calories } }), state, attemptCount: state === 'failed' ? 1 : 0, lastError: state === 'failed' ? 'Food day paused' : null, createdAt: 1, updatedAt: 1 });
            tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
        open.onerror = () => reject(open.error);
    }));
    await page.reload();
    await page.getByRole('button', { name: 'Edit Fixture breakfast', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit food', exact: true });
    if (process.env.CAPTURE_SIDE === 'before') await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    else {
        await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
        await edit.getByRole('button', { name: 'Discard queued changes', exact: true }).click();
        await expect(edit).toContainText('This does not delete or undo any server record');
    }
    await hideTransientPwaNotices(page);
    await page.evaluate(() => document.fonts.ready);
    const dir = process.env.CAPTURE_DIR!;
    await mkdir(dir, { recursive: true });
    const imagePath = path.join(dir, process.env.CAPTURE_SIDE + '.png');
    await page.screenshot({ path: imagePath, fullPage: true });
    await Promise.all(reads);
    await writeFile(path.join(dir, process.env.CAPTURE_SIDE + '-manifest.json'), JSON.stringify({
        source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
        capturedAt: new Date().toISOString(), browser: page.context().browser()?.version(),
        viewport: page.viewportSize(), deviceScale: await page.evaluate(() => devicePixelRatio),
        finalUrl: page.url(), assets,
        fixtureSha256: createHash('sha256').update(await readFile('e2e/expo-web/fixtures.ts')).digest('hex'),
        harnessSha256: createHash('sha256').update(await readFile('e2e/expo-web/failed-update-capture.spec.ts')).digest('hex'),
        imageSha256: createHash('sha256').update(await readFile(imagePath)).digest('hex')
    }, null, 2));
});
