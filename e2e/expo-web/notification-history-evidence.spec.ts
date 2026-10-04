import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, expectApiFailure, FROZEN_NOW, hideTransientPwaNotices, test } from './fixtures';
import { installNotificationApi } from './notification-reminders.fixture';

const captureSide = process.env.ISSUE412_CAPTURE_SIDE;
const source = process.env.ISSUE412_CAPTURE_SOURCE;
const checkout = process.env.ISSUE412_CAPTURE_CHECKOUT;
const output = path.resolve('docs/pr-screenshots/issue-412');
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const states = [
  { state: 'empty', width: 1440, height: 1000, theme: 'light' },
  { state: 'populated', width: 1440, height: 1000, theme: 'light' },
  { state: 'error', width: 1440, height: 1000, theme: 'light' },
  { state: 'recovered', width: 1440, height: 1000, theme: 'light' },
  { state: 'legacy', width: 1440, height: 1000, theme: 'light' },
  { state: 'preferences', width: 1440, height: 1000, theme: 'light' },
  { state: 'legal', width: 1440, height: 1000, theme: 'light' },
  { state: 'guard-cancelled', width: 1440, height: 1000, theme: 'light' },
  { state: 'empty', width: 390, height: 844, theme: 'dark' },
  { state: 'populated', width: 390, height: 844, theme: 'dark' },
] as const;

test.use({ serviceWorkers: 'block', deviceScaleFactor: 1 });

for (const { state, width, height, theme } of states) {
  test(`notification comparison ${state}-${width}-${theme}`, async ({ page, ux, browser }, testInfo) => {
    test.skip(!captureSide || testInfo.project.name !== 'desktop-chrome', 'Explicit paired capture command only.');
    if (!source || !checkout || !['before', 'after'].includes(captureSide!)) throw Error('Missing exact capture identity');
    expect(execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(source);
    execFileSync('git', ['-C', checkout, 'diff', '--exit-code', 'HEAD', '--', 'mobile', 'shared', 'packages']);
    const assets: Array<{ path: string; sha256: string }> = [];
    const pending: Array<Promise<void>> = [];
    page.on('response', (response) => {
      const pathname = new URL(response.url()).pathname;
      if (!/\.(js|css)$/.test(pathname)) return;
      pending.push((async () => {
        const bytes = await response.body();
        const artifact = await readFile(path.join(checkout, 'mobile/dist', decodeURIComponent(pathname)));
        expect(sha256(bytes), `served asset ${pathname}`).toBe(sha256(artifact));
        assets.push({ path: pathname, sha256: sha256(bytes) });
      })());
    });
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await ux.install('populated');
    const fixture = await installNotificationApi(page, state === 'empty');
    if (state === 'error' || state === 'recovered') {
      fixture.failFetchRequests = 10;
      expectApiFailure(page, { method: 'GET', pathname: '/api/v1/notifications/in-app', status: 503 });
    }
    const requestedRoute = state === 'legacy' ? '/notifications?cursor=old#history' : state === 'legal' ? '/privacy' : '/today';
    await page.goto(requestedRoute);
    await hideTransientPwaNotices(page);
    if (state === 'preferences' || state === 'guard-cancelled') {
      await page.getByRole('button', { name: 'Account & settings', exact: true }).click();
      await page.getByTestId('settings-open-profile').click();
      await page.getByTestId('settings-open-preferences').click();
      await expect(page.getByTestId('settings-delivery-permission')).toBeVisible();
      if (state === 'guard-cancelled') {
        await page.getByTestId('settings-food-reminder-time').fill('08:30');
        await page.getByRole('button', { name: 'Open notifications, 20 unread', exact: true }).click();
        const confirmation = page.waitForEvent('dialog');
        await page.getByTestId('notification-open-123').click();
        await (await confirmation).dismiss();
        const panel = page.getByTestId('notifications-drawer-panel');
        await expect(page).toHaveURL((url) => url.pathname === '/preferences');
        await expect(panel.getByTestId('notification-card-123')).toHaveCount(captureSide === 'before' ? 0 : 1);
        await expect(panel.getByText(captureSide === 'before' ? '19 unread' : '20 unread', { exact: true })).toBeVisible();
        expect(fixture.actionRequests).toBe(captureSide === 'before' ? 1 : 0);
      }
    } else if (state === 'legacy') {
      if (captureSide === 'before') await expect(page.getByTestId('notification-history-list')).toBeVisible();
      else {
        await expect(page).toHaveURL((url) => url.pathname === '/today' && !url.search && !url.hash);
        await expect(page.getByRole('heading', { name: 'Daily balance', exact: true })).toBeVisible();
      }
    } else if (state === 'legal') {
      await expect(page.getByTestId('legal-app-header')).toBeVisible();
    } else {
      await page.getByTestId('notifications-button').click();
      const panel = page.getByTestId('notifications-drawer-panel');
      if (state === 'error' || state === 'recovered') {
        await expect(panel.getByText("Can't load notifications", { exact: true })).toBeVisible();
        if (state === 'recovered') {
          fixture.failFetchRequests = 0;
          await panel.getByRole('button', { name: 'Retry', exact: true }).click();
          await expect(panel.getByTestId(/^notification-card-/)).toHaveCount(5);
        }
      } else if (state === 'empty') await expect(panel.getByText('All caught up')).toBeVisible();
      else await expect(panel.getByTestId(/^notification-card-/)).toHaveCount(5);
      await expect(panel.getByTestId('view-all-notifications')).toHaveCount(captureSide === 'before' ? 1 : 0);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await Promise.all(pending);
    expect(assets.length).toBeGreaterThan(0);
    const filename = `${state}-${width}-${theme}`;
    await mkdir(path.join(output, captureSide!), { recursive: true });
    const image = await page.screenshot({ path: path.join(output, captureSide!, `${filename}.png`), fullPage: false });
    await writeFile(path.join(output, captureSide!, `${filename}.json`), JSON.stringify({
      source, side: captureSide, state, requestedRoute, observedRoute: new URL(page.url()).pathname,
      capturedAtUtc: new Date().toISOString(), browser: browser.version(), platform: process.platform,
      viewport: { width, height }, scale: 1, theme, reducedMotion: 'reduce', frozenNow: FROZEN_NOW,
      fixture: 'notification-reminders.fixture.ts + fixtures.ts',
      normalization: 'Service workers blocked; shared transient PWA notice suppression; neutral pointer; unedited viewport pixels.',
      image: `${captureSide}/${filename}.png`, sha256: sha256(image), servedAssets: assets,
      listViews: fixture.listViews,
    }, null, 2) + '\n');
  });
}
