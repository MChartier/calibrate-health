const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const root = path.resolve(process.argv[2]);
const label = process.argv[3];
const out = __dirname;
const { chromium } = require(path.join(root, 'node_modules', 'playwright'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const user = { id: 17, email: 'fixture@example.invalid', created_at: '2026-01-01T12:00:00Z', weight_unit: 'KG', height_unit: 'CM', timezone: 'UTC', language: 'en', date_of_birth: '1985-05-12', sex: 'MALE', height_mm: 1800, activity_level: 'LIGHT', profile_image_url: null, account_access: { state: 'full', email_verified: true, legal_current: true } };
const profile = { profile: user, latest_weight_grams: 88000, goal_daily_deficit: 500, calorieSummary: { dailyCalorieTarget: 2100, tdee: 2600, bmr: 2000, deficit: 500, missing: [], eligibility: { status: 'eligible', reasonCode: null, ageYears: 41, localDate: '2026-10-08' }, planStatus: 'available', planReasonCode: null } };

(async () => {
 const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
 const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
 if (status) throw new Error('Capture requires a clean source checkout: ' + status);
 const { createExpoWebStaticServer } = await import(pathToFileURL(path.join(root, 'scripts/expo-web-static-server.mjs')));
 const server = createExpoWebStaticServer({ distDir: path.join(root, 'mobile/dist') });
 await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4174, '127.0.0.1', resolve); });
 const browser = await chromium.launch({ headless: true });
 const receipt = { source, label, capturedAt: new Date().toISOString(), browser: browser.version(), viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1, theme: 'light', timezone: 'UTC', fixedClock: '2026-10-08T12:00:00Z', fixture: { user, profile }, screenshots: [], servedBundles: [], apiRequests: [], errors: [] };
 try {
  for (const state of ['advanced', 'login', 'recovery']) {
   const context = await browser.newContext({ viewport: receipt.viewport, deviceScaleFactor: 1, colorScheme: 'light', timezoneId: 'UTC', serviceWorkers: 'block' });
   const page = await context.newPage();
   await page.clock.setFixedTime(new Date(receipt.fixedClock));
   page.on('pageerror', error => receipt.errors.push({ state, message: error.message }));
   const responses = [];
   page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('.js')) responses.push((async () => {
     const bytes = await response.body(); const pathname = decodeURIComponent(new URL(response.url()).pathname);
     const local = fs.readFileSync(path.join(root, 'mobile/dist', pathname));
     if (hash(local) !== hash(bytes)) throw new Error('Running bundle differs from source build: ' + pathname);
     receipt.servedBundles.push({ state, pathname, sha256: hash(bytes) });
    })());
   });
   await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4174') throw new Error('Unexpected external request: ' + url.origin);
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) return route.continue();
    receipt.apiRequests.push({ state, method: route.request().method(), path: url.pathname, origin: url.origin });
    let body = {}; let code = 200;
    if (url.pathname.endsWith('/auth/me')) { body = state === 'advanced' ? { user } : { error: 'unauthorized' }; code = state === 'advanced' ? 200 : 401; }
    else if (url.pathname.includes('password') && route.request().method() === 'POST') { body = { error: 'Unavailable' }; code = 503; }
    else if (url.pathname.endsWith('/user/profile')) body = profile;
    else if (url.pathname.endsWith('/notifications/unread-count')) body = { unread_count: 0 };
    else if (url.pathname.endsWith('/notifications')) body = { notifications: [], unread_count: 0 };
    else if (url.pathname.endsWith('/server-settings')) body = { is_admin: false, features: { nutrition_label_scanning: false } };
    else if (url.pathname.endsWith('/user/connected-apps')) body = { connections: [] };
    else if (url.pathname.endsWith('/client-config')) body = { api_version: 1, api_versions: { supported: ['v1'] }, server_version: '0.38.0', min_supported_mobile_version: '0.1.0', min_supported_wear_version: '0.1.0' };
    else if (url.pathname.endsWith('/goal')) body = { goal: { id: 7, start_weight: 90, target_weight: 82, daily_deficit: 500 } };
    else if (url.pathname.endsWith('/notifications/stream')) { code = 204; body = null; }
    return route.fulfill({ status: code, contentType: 'application/json', body: body === null ? '' : JSON.stringify(body) });
   });
   const route = state === 'advanced' ? '/advanced' : state === 'login' ? '/login?serverUrl=https%3A%2F%2Fwrong.example' : '/forgot-password?serverUrl=https%3A%2F%2Fwrong.example';
   await page.goto('http://127.0.0.1:4174' + route);
   if (state === 'advanced') await page.getByTestId('advanced-settings-page').waitFor().catch(async error => { console.log(JSON.stringify({url:page.url(),text:await page.locator('body').innerText(),receipt})); await page.screenshot({path:path.join(out,label+'-diagnostic.png')}); throw error; });
   else if (state === 'login') await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
   else {
    await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid');
    const buttons = await page.getByRole('button').allTextContents();
    receipt.recoveryButtons = buttons;
    await page.getByRole('button', { name: /reset/i }).click();
    await page.getByRole('alert').first().waitFor();
   }
   await page.evaluate(() => document.fonts.ready);
   await page.screenshot({ path: path.join(out, label + '-' + state + '.png'), fullPage: true, animations: 'disabled' });
   receipt.screenshots.push({ state, route, file: label + '-' + state + '.png', sha256: hash(fs.readFileSync(path.join(out, label + '-' + state + '.png'))), text: await page.locator('body').innerText() });
   await Promise.all(responses);
   await context.close();
  }
  fs.writeFileSync(path.join(out, label + '-capture.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ source, label, images: receipt.screenshots.map(x => x.file), errors: receipt.errors }));
 } finally { await browser.close(); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
