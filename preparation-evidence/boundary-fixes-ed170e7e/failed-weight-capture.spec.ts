import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, hideTransientPwaNotices } from './fixtures';
test('matched failed weight recovery', async ({ page, ux }) => {
    const assets: Array<{ url: string; sha256: string }> = [];
    const reads: Promise<void>[] = [];
    page.on('response', (response) => {
        if (new URL(response.url()).pathname.endsWith('.js')) reads.push(response.body().then((body) => {
            assets.push({ url: response.url(), sha256: createHash('sha256').update(body).digest('hex') });
        }));
    });
    await ux.install('populated');
    await page.goto('/weight');
    await expect(page.getByRole('textbox', { name: 'Weight in kilograms', exact: true })).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('calibrate-offline');
        open.onsuccess = () => { const db = open.result; const tx = db.transaction('queued_mutations', 'readwrite'); const store = tx.objectStore('queued_mutations');
            for (const [id, weight, state] of [['failed-weight', 87.9, 'failed'], ['later-weight', 88.5, 'pending']] as const) store.add({ id, namespace: location.origin + '::user:17', operation: 'metric.add', payloadJson: JSON.stringify({ date: '2026-07-21', weight }), state, attemptCount: state === 'failed' ? 1 : 0, lastError: state === 'failed' ? 'Rejected' : null, createdAt: 1, updatedAt: 1 });
            tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
        open.onerror = () => reject(open.error);
    }));
    await page.reload();
    const edit = page.getByRole('dialog', { name: 'Weight entry', exact: true });
    await edit.getByRole('textbox', { name: 'Weight in kilograms', exact: true }).fill('89');
    if (process.env.CAPTURE_SIDE === 'before') await expect(edit.getByRole('button', { name: /^(Log|Save) weight$/ })).toBeEnabled();
    else {
        await expect(edit.getByRole('button', { name: /^(Log|Save) weight$/ })).toBeDisabled();
        await edit.getByRole('button', { name: 'Discard related queued changes', exact: true }).click();
        await expect(edit).toContainText('This does not undo anything that reached the server');
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
        harnessSha256: createHash('sha256').update(await readFile('e2e/expo-web/failed-weight-capture.spec.ts')).digest('hex'),
        imageSha256: createHash('sha256').update(await readFile(imagePath)).digest('hex')
    }, null, 2));
});
