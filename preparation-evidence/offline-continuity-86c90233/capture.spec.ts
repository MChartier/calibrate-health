import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, expectApiFailure, hideTransientPwaNotices } from './fixtures';
test('matched auth outage reload capture', async ({ page, ux }) => {
    const assets: Array<{ url: string; sha256: string }> = [];
    const reads: Promise<void>[] = [];
    page.on('response', (response) => {
        if (new URL(response.url()).pathname.endsWith('.js')) reads.push(response.body().then((body) => {
            assets.push({ url: response.url(), sha256: createHash('sha256').update(body).digest('hex') });
        }));
    });
    await ux.install('populated');
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Daily balance', exact: true })).toBeVisible();
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 503 });
    await page.route('**/auth/me', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication service unavailable', retryable: true }) }));
    await page.reload();
    if (process.env.CAPTURE_SIDE === 'before') await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    else await expect(page.getByTestId('offline-workspace-status')).toContainText('Pending reconnection');
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
        harnessSha256: createHash('sha256').update(await readFile('e2e/expo-web/offline-workspace-capture.spec.ts')).digest('hex'),
        imageSha256: createHash('sha256').update(await readFile(imagePath)).digest('hex')
    }, null, 2));
});
