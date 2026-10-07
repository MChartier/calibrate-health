import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect, hideTransientPwaNotices } from '../../self-hosting-438/e2e/expo-web/fixtures';
const variant = process.env.CAPTURE_VARIANT!;
test('matched settings and administration', async ({ page, ux, browser }) => {
  const assets: Array<{path:string;sha256:string}> = [];
  const responses: Promise<void>[] = [];
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith('.js')) responses.push(response.body().then(bytes => { assets.push({ path: pathname, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }); }));
  });
  await ux.install('populated');
  const users = [
    { id: 17, email: 'release@example.invalid', role: 'admin', email_verified: true, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 18, email: 'member@example.invalid', role: 'member', email_verified: true, created_at: '2026-01-01T00:00:00.000Z' }
  ];
  await page.route('**/api/v1/server-settings', route => route.fulfill({ json: { is_admin: true, features: { nutrition_label_scanning: false } } }));
  await page.route('**/api/v1/server-settings/users?*', route => route.fulfill({ json: { users, next_cursor: null } }));
  await page.goto('/settings');
  await expect(page.getByRole(variant === 'before' ? 'link' : 'button', { name: 'Server administration', exact: true })).toBeVisible();
  await hideTransientPwaNotices(page);
  await page.screenshot({ path: path.join(__dirname, variant + '-settings.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 2500 });
  await page.getByRole(variant === 'before' ? 'link' : 'button', { name: 'Server administration', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Nutrition label scanning', exact: true })).toBeVisible();
  if (variant === 'after') await expect(page.getByRole('button', { name: 'Make administrator: member@example.invalid', exact: true })).toBeVisible();
  await hideTransientPwaNotices(page);
  await page.screenshot({ path: path.join(__dirname, variant + '-administration.png'), fullPage: true });
  await Promise.all(responses);
  fs.writeFileSync(path.join(__dirname, variant + '-capture.json'), JSON.stringify({ variant, capturedAtUtc: new Date().toISOString(), browserVersion: browser.version(), assets, routes: ['/settings','/server-admin'], viewports: { settings:{width:1280,height:1500},administration:{width:1280,height:2500} }, scale:1, theme:'light', fixture:'populated', normalization:'Common fixture freezes time/randomness; unrelated transient PWA notices hidden using maintained helper. Compared UI unaltered.', screenshotTransformation:'none' }, null, 2));
});
