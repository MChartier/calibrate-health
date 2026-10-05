import { expect, test, expectApiFailure, hideTransientPwaNotices } from './resume-capture-fixtures';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
test('capture resume intent after two reloads', async ({ page, ux }) => {
    const side = process.env.CAPTURE_SIDE!; const dir = process.env.CAPTURE_DIR!;
    const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    const reads: Promise<void>[] = []; const assets = new Map<string, unknown>();
    page.on('response', response => {
        const name = new URL(response.url()).pathname.slice(1);
        if (name.endsWith('.js')) reads.push(response.body().then(async body => {
            const exported = await readFile(path.join('mobile/dist', name));
            expect(hash(body)).toBe(hash(exported));
            const file = path.join(dir, side + '-assets', name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, body);
            assets.set(name, { path: name, sha256: hash(body), bytes: body.length });
        }));
    });
    await ux.install('paused', { foodDayStatus: 'PAUSED' });
    const pause = { active: true, id: 9, starts_on: '2026-07-20', expected_resume_on: '2026-07-21', resumed_on: null, started_at: null, resumed_at: null, materialized_through: '2026-07-21', resume_confirmation_due: true };
    await page.route('**/api/v1/food-days/pause', route => route.fulfill({ json: { pause } }));
    expectApiFailure(page, { method: 'POST', pathname: '/api/v1/food-days/resume', status: 503 });
    const ids: string[] = [];
    await page.route('**/api/v1/food-days/resume', route => { ids.push(route.request().headers()['x-client-operation-id']); return route.fulfill({ status: 503, json: { error: 'Unavailable', retryable: true } }); });
    await page.goto('/today');
    const prompt = page.getByRole('dialog', { name: 'Ready to resume tracking?' });
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Resume tracking', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    for (let restart = 0; restart < 2; restart++) {
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
        if (side === 'before') await expect(prompt).toBeVisible();
        else await expect(prompt).toHaveCount(0);
    }
    await hideTransientPwaNotices(page); await page.evaluate(() => document.fonts.ready);
    await mkdir(dir, { recursive: true }); const image = path.join(dir, side + '.png');
    await page.screenshot({ path: image, fullPage: true }); await Promise.all(reads);
    await writeFile(path.join(dir, side + '-manifest.json'), JSON.stringify({ source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(), capturedAt: new Date().toISOString(), browser: page.context().browser()?.version(), viewport: page.viewportSize(), scale: await page.evaluate(() => devicePixelRatio), route: page.url(), fixture: 'paused synthetic user17; fixed July21 2026; 16ms clock steps; light/en-US/America/Los_Angeles; two reloads; resume503 throughout; transient PWA notices suppressed equally', requestIds: ids, assets: [...assets.values()], fixtureSha256: hash(await readFile('e2e/expo-web/resume-capture-fixtures.ts')), harnessSha256: hash(await readFile('e2e/expo-web/resume-intent-capture.spec.ts')), imageSha256: hash(await readFile(image)) }, null, 2));
});
