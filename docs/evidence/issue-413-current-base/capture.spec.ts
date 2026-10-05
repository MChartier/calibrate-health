import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { test, expect, hideTransientPwaNotices, FROZEN_NOW } from '../../e2e/expo-web/fixtures';

const output = path.resolve('.codex-screenshots/issue413-replacement');
const source = process.env.CAPTURE_SOURCE!;
const label = process.env.CAPTURE_LABEL!;
const origin = process.env.CAPTURE_URL!;
const sha256 = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${label} ${viewport.width} ${colorScheme}`, async ({ page, ux, browser }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await ux.install('paused', { foodDayStatus: 'PAUSED', foodEntries: [] });
      const scripts: { url: string; sha256: string; sourceFile: string }[] = [];
      const pending: Promise<void>[] = [];
      page.on('response', response => {
        if (response.request().resourceType() !== 'script' || !response.url().startsWith(origin)) return;
        pending.push((async () => {
          const bytes = await response.body();
          const relative = decodeURIComponent(new URL(response.url()).pathname).replace(/^\//, '');
          const disk = fs.readFileSync(path.join(source, 'mobile/dist', relative));
          expect(sha256(bytes)).toBe(sha256(disk));
          scripts.push({ url: response.url(), sha256: sha256(bytes), sourceFile: relative });
        })());
      });
      await page.goto(`${origin}/today`);
      await hideTransientPwaNotices(page);
      await expect(page.getByRole('heading', { name: 'Tracking paused', exact: true })).toBeVisible();
      await expect(page.getByText('Weigh in', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Resume tracking', exact: true })).toBeInViewport();
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      const row = page.getByTestId('today-weight-card');
      const geometry = await row.evaluate(element => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const action = element.querySelector('[data-testid="today-weight-card-press-layer"]')!;
        const lower = getComputedStyle(action);
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
          topWidth: style.borderTopWidth, topColor: style.borderTopColor,
          bottomWidth: lower.borderBottomWidth, bottomColor: lower.borderBottomColor };
      });
      expect(geometry.topWidth).toBe(label === 'before' ? '0px' : geometry.bottomWidth);
      if (label === 'after') expect(geometry.topColor).toBe(geometry.bottomColor);
      const filename = `${label}-${viewport.width}-${colorScheme}.png`;
      await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
      await Promise.all(pending);
      expect(scripts.length).toBeGreaterThan(0);
      fs.writeFileSync(path.join(output, `${filename}.json`), JSON.stringify({
        sourceSha, source, label, route: '/today', viewport, deviceScaleFactor: 1,
        browser: browser.version(), platform: process.platform, capturedAtUtc: new Date().toISOString(),
        frozenClock: FROZEN_NOW, locale: 'en-US', timezoneId: 'America/Los_Angeles', colorScheme,
        fixture: 'ux.install(paused, {foodDayStatus: PAUSED, foodEntries: []})',
        normalization: 'Shared hideTransientPwaNotices suppresses unrelated PWA status/alert toasts; no compared UI hidden or altered. Mouse moved to (0,0). No image transformations.',
        geometry, scripts: scripts.sort((a,b) => a.url.localeCompare(b.url)),
        image: filename, imageSha256: sha256(fs.readFileSync(path.join(output, filename))),
      }, null, 2) + '\n');
    });
  }
}
