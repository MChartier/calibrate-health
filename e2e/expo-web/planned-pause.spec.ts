import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { expect, test, hideTransientPwaNotices, expectApiFailure, activateFixtureOffline, FROZEN_LOCAL_DATE, type UxHarness } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';
import { expectNoBlockingAccessibilityViolations } from './ux-a11y';
import { applyTwoHundredPercentText } from './text-scaling';

const before = process.env.CALIBRATE_PAUSE_BASELINE === '1';
const today = FROZEN_LOCAL_DATE;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function install(page: Page, ux: UxHarness, target: string | null = '2026-08-03', active = true) {
    await ux.install('populated', { foodEntries: [] });
    const state = { active, target, startsOn: '2026-07-20', resumedOn: null as string | null, failResume: false, queueResume: false, failUpdate: false, queueUpdate: false, failRead: false, resumeAttempts: 0, dayReads: 0, overrides: new Map<string, string>(), rangeRequests: [] as string[] };
    const pause = () => ({ active: state.active, id: 9, starts_on: state.startsOn, expected_resume_on: state.target, resumed_on: state.resumedOn, started_at: '2026-07-20T12:00:00Z', resumed_at: null, materialized_through: today, resume_confirmation_due: state.active && state.target !== null && state.target <= today });
    const day = (date: string) => {
        let status = state.overrides.get(date) ?? ((date >= state.startsOn && (state.active || (state.resumedOn !== null && date < state.resumedOn))) ? 'PAUSED' : 'OPEN');
        if (date >= '2026-07-16' && date <= '2026-07-19') status = 'COMPLETE';
        const consumed = { '2026-07-16': 1900, '2026-07-17': 2200, '2026-07-18': 2600 }[date];
        return { date, status, origin: status === 'PAUSED' ? 'PAUSE' : 'USER', source: status === 'PAUSED' ? 'ACTIVE_PAUSE' : 'STORED', is_complete: status === 'COMPLETE', is_representative: status === 'COMPLETE', completed_at: null, updated_at: null,
            ...(consumed ? { calorie_comparison: { consumed_kcal: consumed, target_kcal: 2000, maintenance_kcal: 2500, captured_at: '2026-07-21T12:00:00Z' } } : {}) };
    };
    await page.route('**/api/v1/food-days/pause', async route => {
        const method = route.request().method();
        if (method === 'GET' && state.failRead) return route.fulfill({ status: 503, json: { message: 'Synthetic pause read failure' } });
        if (method === 'POST' || method === 'PATCH') {
            if (state.queueUpdate) return route.fulfill({ status: 503, json: { message: 'Synthetic retryable pause write failure' } });
            if (state.failUpdate) return route.fulfill({ status: 400, json: { message: 'Synthetic pause update rejected' } });
            const payload = route.request().postDataJSON();
            state.target = payload.expected_resume_on;
            if (method === 'POST') { state.active = true; state.startsOn = payload.starts_on; state.resumedOn = null; }
        }
        return route.fulfill({ json: { pause: pause() } });
    });
    await page.route('**/api/v1/food-days/resume', async route => {
        state.resumeAttempts++;
        if (state.queueResume) return route.fulfill({ status: 503, json: { message: 'Synthetic retryable resume failure' } });
        if (state.failResume) return route.fulfill({ status: 400, json: { message: 'Synthetic resume rejected' } });
        state.active = false; state.resumedOn = route.request().postDataJSON().resumed_on;
        return route.fulfill({ json: { pause: pause(), day: day(today) } });
    });
    await page.route('**/api/v1/food-days?*', route => { state.dayReads++; return route.fulfill({ json: day(new URL(route.request().url()).searchParams.get('date')!) }); });
    await page.route('**/api/v1/food-days', async route => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        const payload = route.request().postDataJSON(); state.overrides.set(payload.date, payload.status);
        return route.fulfill({ json: day(payload.date) });
    });
    await page.route('**/api/v1/food-days/range?*', route => {
        const url = new URL(route.request().url()); const start = url.searchParams.get('start')!; const end = url.searchParams.get('end')!;
        expect(start <= end && end <= today).toBe(true); state.rangeRequests.push(`${start}/${end}`);
        const days = [];
        for (let date = start; date <= end; date = new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)) days.push(day(date));
        return route.fulfill({ json: { start_date: start, end_date: end, days } });
    });
    return state;
}

async function open(page: Page) {
    await page.goto('/today'); await hideTransientPwaNotices(page);
    await expect(page.getByRole('button', { name: 'Choose date', exact: true })).toBeVisible();
}
async function calendar(page: Page) { await page.getByRole('button', { name: 'Choose date', exact: true }).click(); }
async function capture(page: Page, info: TestInfo, name: string) {
    await page.evaluate(() => document.fonts.ready);
    const directory = process.env.CALIBRATE_PAUSE_EVIDENCE_DIR || info.outputPath('evidence');
    await mkdir(directory, { recursive: true });
    const stem = `${before ? 'before' : 'after'}-${info.project.name}-${name}`;
    const imagePath = path.join(directory, stem + '.png');
    await page.screenshot({ path: imagePath });
    const scripts = await page.locator('script[src]').evaluateAll(elements => elements.map(element => (element as HTMLScriptElement).src));
    const servedScripts = [];
    for (const url of scripts) {
        const response = await page.request.get(url); const bytes = await response.body();
        const relative = decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
        const built = await readFile(path.join(process.env.CALIBRATE_PAUSE_BUILD_DIR || 'mobile/dist', relative));
        expect(sha256(bytes)).toBe(sha256(built));
        servedScripts.push({ url, sha256: sha256(bytes) });
    }
    const harness = await Promise.all(['e2e/expo-web/planned-pause.spec.ts', 'e2e/expo-web/fixtures.ts', 'e2e/expo-web/text-scaling.ts', 'playwright.expo-web.config.ts'].map(async file => ({ path: file, sha256: sha256(await readFile(file)) })));
    const display = await page.evaluate(() => ({ scale: devicePixelRatio, dark: matchMedia('(prefers-color-scheme: dark)').matches, locale: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    await writeFile(path.join(directory, stem + '.json'), JSON.stringify({ capturedAtUtc: new Date().toISOString(), sourceCommit: process.env.CALIBRATE_PAUSE_SOURCE_SHA, baseline: before, harness, display,
        route: page.url(), viewport: page.viewportSize(), browser: page.context().browser()?.version(), project: info.project.name, fixture: 'planned-pause.spec.ts + fixtures.ts', frozenClock: '2026-07-21T19:00:00Z + deterministic 16ms steps', normalization: 'hideTransientPwaNotices suppresses unrelated PWA notices identically; no compared UI modified', image: path.basename(imagePath), imageSha256: sha256(await readFile(imagePath)), servedScripts }, null, 2) + '\n');
}

for (const theme of ['light', 'dark'] as const) {
    test(`dated plan and exact month boundary in ${theme}`, async ({ page, ux }, info) => {
        await page.emulateMedia({ colorScheme: theme });
        await install(page, ux); await open(page);
        await expect(page.getByText('Tracking paused', { exact: true })).toBeVisible();
        if (!before) await expect(page.getByText('Expected to resume Aug 3, 2026', { exact: true })).toBeVisible();
        await expect(page.getByText('Weigh in', { exact: true })).toBeInViewport({ ratio: 1 });
        await expect(page.getByText("Record today's weight", { exact: true })).toBeInViewport({ ratio: 1 });
        await capture(page, info, `dated-today-${theme}`);
        await calendar(page);
        await expect(page.getByTestId('calendar-day-2026-07-20')).toHaveAccessibleName(/tracking paused/);
        for (const [date, label] of [['16', 'at or below target'], ['17', 'at or below maintenance'], ['18', 'above maintenance'], ['19', 'comparison unavailable']]) await expect(page.getByTestId(`calendar-day-2026-07-${date}`)).toHaveAccessibleName(new RegExp(label));
        await expect(page.getByTestId('calendar-day-2026-07-22')).toBeDisabled();
        await page.getByTestId('calendar-day-2026-07-22').dispatchEvent('click');
        await page.getByTestId('calendar-day-2026-07-22').dispatchEvent('keydown', { key: 'Enter' });
        await expect(page.getByTestId('calendar-day-2026-07-21')).toHaveAccessibleName(/selected/);
        if (!before) await expect(page.getByTestId('calendar-day-2026-07-22')).toHaveAccessibleName(/planned tracking pause/);
        await capture(page, info, `calendar-${theme}`);
        if (before) { await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeDisabled(); return; }
        await page.getByRole('button', { name: 'Next month', exact: true }).click();
        await expect(page.getByTestId('calendar-day-2026-08-02')).toHaveAccessibleName(/planned tracking pause/);
        await expect(page.getByTestId('calendar-day-2026-08-03')).toHaveAccessibleName(/future date/);
        await expect(page.getByTestId('calendar-day-2026-08-02')).toBeDisabled();
        await capture(page, info, `target-month-${theme}`);
        await expectNoBlockingAccessibilityViolations(page, info, { kind: 'route', surfaceId: 'planned-pause-calendar' });
        await page.getByRole('button', { name: 'Previous month', exact: true }).click();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'Choose date', exact: true })).toBeFocused();
    });
}

test('real pause form, failed resume, recovery and preserved historical edit', async ({ page, ux }, info) => {
    test.skip(before);
    const state = await install(page, ux, null, false); await open(page); await calendar(page);
    await page.getByRole('button', { name: 'Pause tracking', exact: true }).click();
    await page.getByRole('button', { name: 'Choose expected resume date', exact: true }).click();
    await page.getByLabel('Expected resume date', { exact: true }).fill('2026-08-03');
    await page.getByRole('button', { name: 'Pause with this date', exact: true }).click();
    await expect(page.getByText('Expected to resume Aug 3, 2026')).toBeVisible();
    // Controlled earlier-start variant exercises the historical override independently of the form's today start.
    state.startsOn = '2026-07-20';
    await page.getByRole('button', { name: 'Previous day', exact: true }).click();
    await expect(page.getByText('Tracking was paused', { exact: true })).toBeVisible();
    await expect(page.getByText(/Expected to resume/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit day', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeEnabled();
    expect(state.active).toBe(true);
    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    state.failResume = true; expectApiFailure(page, { method: 'POST', pathname: '/api/v1/food-days/resume', status: 400 });
    await page.getByRole('button', { name: 'Resume tracking', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Expected to resume Aug 3, 2026')).toBeVisible();
    await capture(page, info, 'failed-resume');
    state.failResume = false;
    await page.getByRole('button', { name: 'Resume tracking', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeEnabled();
    await calendar(page);
    await expect(page.getByTestId('calendar-day-2026-07-22')).not.toHaveAccessibleName(/planned/);
    await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeDisabled();
    await capture(page, info, 'resumed-calendar');
});

test('due prompt failed update, until-resumed removal and explicit resume', async ({ page, ux }, info) => {
    test.skip(before);
    const state = await install(page, ux, today); await open(page);
    await page.getByRole('button', { name: 'Extend pause', exact: true }).click();
    state.failUpdate = true; expectApiFailure(page, { method: 'PATCH', pathname: '/api/v1/food-days/pause', status: 400 });
    await page.getByRole('button', { name: 'Until I resume', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible(); expect(state.target).toBe(today);
    await capture(page, info, 'failed-update');
    state.failUpdate = false; await page.getByRole('button', { name: 'Until I resume', exact: true }).click();
    await expect(page.getByText('Until you resume', { exact: true })).toBeVisible();
    await calendar(page);
    await expect(page.getByTestId('calendar-day-2026-07-31')).toHaveAccessibleName(/planned tracking pause, until resumed/);
    await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeDisabled();
    await capture(page, info, 'open-ended-calendar');
    state.target = today; await page.reload(); await hideTransientPwaNotices(page);
    await page.getByRole('dialog', { name: 'Ready to resume tracking?' }).getByRole('button', { name: 'Resume tracking', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeEnabled();
    await calendar(page); await expect(page.getByTestId('calendar-day-2026-07-22')).not.toHaveAccessibleName(/planned/);
    await expect(page.getByTestId('calendar-day-2026-07-20')).toHaveAccessibleName(/tracking paused/);
});

test('year target, shortened plan on reload and unavailable metadata recovery', async ({ page, ux }, info) => {
    test.skip(before);
    const state = await install(page, ux, '2027-01-02'); await open(page); await calendar(page);
    for (let month = 0; month < 6; month++) await page.getByRole('button', { name: 'Next month', exact: true }).click();
    await expect(page.getByTestId('calendar-day-2027-01-01')).toHaveAccessibleName(/planned tracking pause/);
    await expect(page.getByTestId('calendar-day-2027-01-02')).toHaveAccessibleName(/future date/);
    await capture(page, info, 'year-boundary');
    expect(state.rangeRequests.every(range => range.endsWith(today))).toBe(true);
    state.target = '2026-07-23'; await page.reload(); await hideTransientPwaNotices(page);
    await expect(page.getByText('Expected to resume Jul 23, 2026')).toBeVisible(); await calendar(page);
    await expect(page.getByTestId('calendar-day-2026-07-22')).toHaveAccessibleName(/planned/);
    await expect(page.getByTestId('calendar-day-2026-07-23')).not.toHaveAccessibleName(/planned/);
    state.failRead = true; expectApiFailure(page, { method: 'GET', pathname: '/api/v1/food-days/pause', status: 503 });
    await page.reload(); await hideTransientPwaNotices(page);
    await expect(page.getByText('Pause plan unavailable.', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Resume tracking', exact: true })).toBeEnabled();
    await capture(page, info, 'unavailable-metadata');
    state.failRead = false; await page.reload(); await hideTransientPwaNotices(page);
    await expect(page.getByText('Expected to resume Jul 23, 2026')).toBeVisible();
});

test('planned pause remains readable at enlarged text', async ({ page, ux }, info) => {
    test.skip(before || info.project.name !== 'compact-phone-chrome');
    await install(page, ux); await open(page); await applyTwoHundredPercentText(page);
    await page.getByText('Expected to resume Aug 3, 2026').scrollIntoViewIfNeeded();
    await expect(page.getByText('Expected to resume Aug 3, 2026')).toBeInViewport();
    await calendar(page); await page.getByText('Planned pause (future, view only)', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText('Planned pause (future, view only)', { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await capture(page, info, 'large-text');
});

test('reopening and month navigation refresh the plan and recover from a shortened horizon', async ({ page, ux }) => {
    test.skip(before);
    const state = await install(page, ux); await open(page); await calendar(page);
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    await expect(page.getByTestId('calendar-day-2026-08-02')).toHaveAccessibleName(/planned/);
    state.target = '2026-07-23';
    await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Close date picker', exact: true }).click();
    await expect(page.getByText('Expected to resume Jul 23, 2026')).toBeVisible();
    state.target = '2026-09-02'; await calendar(page);
    await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    state.target = null;
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    await expect(page.getByTestId('calendar-day-2026-07-31')).toHaveAccessibleName(/until resumed/);
    await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeDisabled();
});

test('matched failed resume and recovery retains the actual pause until success', async ({ page, ux }, info) => {
    const state = await install(page, ux); await open(page);
    state.failResume = true; expectApiFailure(page, { method: 'POST', pathname: '/api/v1/food-days/resume', status: 400 });
    await page.getByRole('button', { name: 'Resume tracking', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Tracking paused', { exact: true })).toBeVisible();
    await capture(page, info, 'matched-failed-resume');
    state.failResume = false; await page.getByRole('button', { name: 'Resume tracking', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeEnabled();
    await calendar(page);
    await expect(page.getByTestId('calendar-day-2026-07-20')).toHaveAccessibleName(/tracking paused/);
    await capture(page, info, 'matched-recovered-calendar');
});

test('due and overdue plans remain paused with no invented future interval', async ({ page, ux }, info) => {
    test.skip(before);
    const state = await install(page, ux, today); await open(page);
    await expect(page.getByRole('button', { name: 'Extend pause', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Ready to resume tracking?' })).toHaveCount(0);
    await expect(page.getByText('Expected to resume today (Jul 21, 2026). Tracking is still paused.')).toBeVisible();
    await calendar(page); await expect(page.getByTestId('calendar-day-2026-07-22')).not.toHaveAccessibleName(/planned/);
    await page.keyboard.press('Escape');
    state.target = '2026-07-20'; await page.reload(); await hideTransientPwaNotices(page);
    await expect(page.getByRole('button', { name: 'Extend pause', exact: true })).toBeVisible(); await page.keyboard.press('Escape');
    await expect(page.getByText('Expected resume date has passed (Jul 20, 2026). Tracking is still paused.')).toBeVisible();
    await capture(page, info, 'overdue-today');
    await calendar(page); await expect(page.getByTestId('calendar-day-2026-07-22')).not.toHaveAccessibleName(/planned/);
    await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeDisabled();
});

test('cached read failure keeps the saved plan visibly stale and reopening recovers it', async ({ page, ux }, info) => {
    test.skip(before);
    const state = await install(page, ux); await open(page);
    await expect(page.getByText('Expected to resume Aug 3, 2026')).toBeVisible();
    state.failRead = true; expectApiFailure(page, { method: 'GET', pathname: '/api/v1/food-days/pause', status: 503 });
    await calendar(page);
    await expect(page.getByRole('dialog', { name: 'Calendar' }).getByText('Could not refresh the saved pause plan.')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('calendar-day-2026-07-22')).toHaveAccessibleName(/planned/);
    await capture(page, info, 'stale-plan');
    state.failRead = false; state.target = '2026-07-23';
    await page.getByRole('button', { name: 'Close date picker', exact: true }).click(); await calendar(page);
    await expect(page.getByText('Could not refresh the saved pause plan.')).toHaveCount(0);
    await expect(page.getByTestId('calendar-day-2026-07-23')).not.toHaveAccessibleName(/planned/);
});

test('offline cached plan and accepted queued resume converge after real browser outbox replay', async ({ page, ux }, info) => {
    test.skip(before);
    const state = await install(page, ux); await open(page);
    await expect(page.getByText('Expected to resume Aug 3, 2026')).toBeVisible();
    state.queueResume = true; expectApiFailure(page, { method: 'POST', pathname: '/api/v1/food-days/resume', status: 503 });
    await activateFixtureOffline(page);
    await expect(page.getByText('Offline - showing saved pause plan.', { exact: true })).toBeVisible();
    await capture(page, info, 'offline-saved-plan');
    await page.context().setOffline(false);
    await expect(page.getByText('Offline - showing saved pause plan.', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Resume tracking', exact: true }).click();
    expect(state.active).toBe(true);
    await expect.poll(() => state.resumeAttempts).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('calibrate-offline');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const records = db.transaction('queued_mutations', 'readonly').objectStore('queued_mutations').getAll();
            records.onsuccess = () => { resolve(records.result.filter(record => record.operation === 'food-tracking-pause.resume').length); db.close(); };
            records.onerror = () => { reject(records.error); db.close(); };
        };
    }))).toBe(1);
    await activateFixtureOffline(page);
    state.queueResume = false;
    await page.context().setOffline(false);
    await expect.poll(() => state.active).toBe(false);
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeEnabled();
    await calendar(page);
    await expect(page.getByTestId('calendar-day-2026-07-22')).not.toHaveAccessibleName(/planned/);
    await expect(page.getByTestId('calendar-day-2026-07-20')).toHaveAccessibleName(/tracking paused/);
    await capture(page, info, 'replayed-resume');
});


test('matched accepted queued resume before replay', async ({ page, ux }, info) => {
    const state = await install(page, ux); await open(page);
    const initialReads = state.dayReads;
    state.queueResume = true;
    expectApiFailure(page, { method: 'POST', pathname: '/api/v1/food-days/resume', status: 503 });
    await page.getByRole('button', { name: 'Resume tracking', exact: true }).click();
    await expect.poll(() => page.evaluate(() => new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('calibrate-offline');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const records = db.transaction('queued_mutations', 'readonly').objectStore('queued_mutations').getAll();
            records.onsuccess = () => { resolve(records.result.filter(record => record.operation === 'food-tracking-pause.resume').length); db.close(); };
            records.onerror = () => { reject(records.error); db.close(); };
        };
    }))).toBe(1);
    expect(state.active).toBe(true);
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeVisible();
    await expect(page.getByText('Tracking paused', { exact: true })).toHaveCount(0);
    await page.reload(); await hideTransientPwaNotices(page);
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeVisible();
    await capture(page, info, 'queued-resume');
    await calendar(page);
    await expect(page.getByTestId('calendar-day-2026-07-21')).toHaveAccessibleName(before ? /tracking paused/ : /in progress/);
    await capture(page, info, 'queued-resume-calendar');
    await page.getByRole('button', { name: 'Close date picker', exact: true }).click();
    await activateFixtureOffline(page); state.queueResume = false; await page.context().setOffline(false);
    await expect.poll(() => state.active).toBe(false);
    await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeEnabled();
    await capture(page, info, 'queued-replayed');
});


test('matched queued pause metadata survives calendar reads', async ({ page, ux }, info) => {
    const state = await install(page, ux, null, false); await open(page); await calendar(page);
    state.queueUpdate = true;
    expectApiFailure(page, { method: 'POST', pathname: '/api/v1/food-days/pause', status: 503 });
    await page.getByRole('button', { name: 'Pause tracking', exact: true }).click();
    await page.getByRole('button', { name: 'Choose expected resume date', exact: true }).click();
    await page.getByLabel('Expected resume date', { exact: true }).fill('2026-08-03');
    await page.getByRole('button', { name: 'Pause with this date', exact: true }).click();
    await expect.poll(() => page.evaluate(() => new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('calibrate-offline');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const records = db.transaction('queued_mutations', 'readonly').objectStore('queued_mutations').getAll();
            records.onsuccess = () => { resolve(records.result.filter(record => record.operation === 'food-tracking-pause.start').length); db.close(); };
            records.onerror = () => { reject(records.error); db.close(); };
        };
    }))).toBe(1);

    expect(state.active).toBe(false);
    await page.reload(); await hideTransientPwaNotices(page);
    await expect(page.getByText('Tracking paused', { exact: true })).toBeVisible();
    if (!before) await expect(page.getByText('Expected to resume Aug 3, 2026')).toBeVisible();
    await capture(page, info, 'queued-start-today');
    await calendar(page);
    if (before) await expect(page.getByTestId('calendar-day-2026-07-22')).not.toHaveAccessibleName(/planned/);
    else await expect(page.getByTestId('calendar-day-2026-07-22')).toHaveAccessibleName(/planned/);
    await expect(page.getByTestId('calendar-day-2026-07-21')).toHaveAccessibleName(before ? /in progress/ : /tracking paused/);
    await capture(page, info, 'queued-start-calendar');
});
