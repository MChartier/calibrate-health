import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, expectApiFailure, hideTransientPwaNotices, activateFixtureOffline } from './fixtures';
test('matched explicit offline logout capture', async ({ page, ux }) => {
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
    const original = await page.evaluate(async () => (await (await fetch('/auth/me', { credentials: 'include' })).json()).user);
    let sessionUser = original;
    let disconnected = true;
    let revocations = 0;
    expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 401 });
    await page.route('**/auth/me', route => sessionUser ? route.fulfill({ json: { user: sessionUser } }) : route.fulfill({ status: 401, json: { error: 'Not authenticated' } }));
    await page.route('**/auth/logout', route => {
        if (disconnected) return route.abort('internetdisconnected');
        revocations += 1; sessionUser = null;
        return route.fulfill({ json: { message: 'Signed out' } });
    });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await activateFixtureOffline(page);
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    disconnected = false;
    await page.context().setOffline(false);
    if (process.env.CAPTURE_SIDE === 'after') await expect.poll(() => revocations).toBe(1);
    await page.reload();
    if (process.env.CAPTURE_SIDE === 'before') await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
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
        finalUrl: page.url(), revocations, assets,
        fixtureSha256: createHash('sha256').update(await readFile('e2e/expo-web/fixtures.ts')).digest('hex'),
        harnessSha256: createHash('sha256').update(await readFile('e2e/expo-web/logout-capture.spec.ts')).digest('hex'),
        imageSha256: createHash('sha256').update(await readFile(imagePath)).digest('hex')
    }, null, 2));
});
