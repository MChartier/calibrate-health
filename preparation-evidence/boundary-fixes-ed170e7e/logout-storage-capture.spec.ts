import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, expectApiFailure, hideTransientPwaNotices } from './fixtures';
test('matched unavailable sign-out storage', async ({ page, ux }) => {
    const assets: Array<{ url: string; sha256: string }> = [];
    const reads: Promise<void>[] = [];
    page.on('response', (response) => {
        if (new URL(response.url()).pathname.endsWith('.js')) reads.push(response.body().then((body) => {
            assets.push({ url: response.url(), sha256: createHash('sha256').update(body).digest('hex') });
        }));
    });
    await ux.install('populated');
    await page.goto('/security');
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    expectApiFailure(page, { method: 'POST', pathname: '/auth/logout', status: 503 });
    await page.route('**/auth/logout', route => route.fulfill({ status: 503, json: { error: 'Unavailable', retryable: true } }));
    await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
            if (key.includes('calibrate.logout.')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
            return original.call(this, key, value);
        };
    });
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    if (process.env.CAPTURE_SIDE === 'after') await expect(page.getByText('Signed out in this app. Device storage is unavailable and server sign-out is pending. Reconnect before closing this app.', { exact: true })).toBeVisible();
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
        harnessSha256: createHash('sha256').update(await readFile('e2e/expo-web/logout-storage-capture.spec.ts')).digest('hex'),
        imageSha256: createHash('sha256').update(await readFile(imagePath)).digest('hex')
    }, null, 2));
});
