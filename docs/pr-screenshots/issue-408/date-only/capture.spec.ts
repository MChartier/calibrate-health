// Evidence harness: copy this file to e2e/expo-web/issue-408-comparison-capture.spec.ts in each source checkout.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, hideTransientPwaNotices } from './fixtures';

const stage = process.env.CALIBRATE_COMPARISON_STAGE;
if (stage !== 'before' && stage !== 'after') throw new Error('Choose before or after explicitly.');
const fixtureBytes = readFileSync(process.env.CALIBRATE_COMPARISON_FIXTURE!, 'utf8');
const output = process.env.CALIBRATE_COMPARISON_OUTPUT!;

test('capture matched completed-calendar comparison', async ({ page, ux, browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop-chrome';
  const colorScheme = desktop ? 'light' : 'dark';
  const suffix = desktop ? 'desktop-light' : 'phone-dark';
  await page.emulateMedia({ colorScheme });
  await ux.install('populated');
  await page.route('**/api/v1/food-days/range?*', route => route.fulfill({ contentType: 'application/json', body: fixtureBytes }));
  await page.goto('/today');
  await hideTransientPwaNotices(page);
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Calendar' })).toBeVisible();
  await page.getByTestId('calendar-day-2026-07-09').click();
  await expect(page.getByRole('dialog', { name: 'Calendar' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByTestId('calendar-day-2026-07-09')).toHaveAccessibleName(/completed, below target, at or above maintenance, selected$/);
  await expect(page.getByTestId('calendar-day-2026-07-17')).toHaveAccessibleName(/completed, comparison unavailable/);
  await expect(page.getByText('Complete: target met', { exact: true })).toBeVisible();
  if (stage === 'before') {
    await expect(page.getByTestId('calendar-date-badge-2026-07-09')).toContainText('M');
    await expect(page.getByTestId('calendar-date-badge-2026-07-17')).toContainText('?');
  } else {
    for (let n = 1; n <= 17; n++) {
      await expect(page.getByTestId('calendar-date-badge-2026-07-' + String(n).padStart(2, '0'))).toHaveText(String(n));
    }
  }
  await page.evaluate(() => document.fonts.ready);
  const badgeGeometry = await page.locator('[data-testid^="calendar-date-badge-"]').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect();
    return { id: element.getAttribute('data-testid'), text: element.textContent, x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  mkdirSync(output, { recursive: true });
  // Wait for two identical browser frames after fonts settle; never alter captured pixels.
  let stableCapture!: Buffer;
  await expect(async () => {
    const first = await page.screenshot();
    await page.waitForTimeout(200);
    const second = await page.screenshot();
    expect(second.equals(first)).toBe(true);
    stableCapture = second;
  }).toPass({ timeout: 10000 });
  writeFileSync(path.join(output, stage + '-' + suffix + '.png'), stableCapture);
  writeFileSync(path.join(output, stage + '-' + suffix + '.capture.json'), JSON.stringify({
    badge_geometry: badgeGeometry,
    stage, project: testInfo.project.name, viewport: page.viewportSize(), color_scheme: colorScheme,
    browser: 'Chrome browser (not emulator/device)', browser_version: browser.version(),
    source_revision: process.env.CALIBRATE_COMPARISON_SOURCE,
    selected_date: '2026-07-09', displayed_month: '2026-07', frozen_now: '2026-07-21T19:00:00.000Z',
    timezone: 'America/Los_Angeles', locale: 'en-US', reduced_motion: 'reduce', device_scale_factor: 1,
    captured_at_utc: new Date().toISOString()
  }, null, 2) + '\n');
});
