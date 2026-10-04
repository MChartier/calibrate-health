const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = process.env.PR417_SOURCE_ROOT;
const {test, expect, expectApiFailure, hideTransientPwaNotices} = require(path.join(root, 'e2e/expo-web/fixtures'));
const {installNotificationApi} = require(path.join(root, 'e2e/expo-web/notification-reminders.fixture'));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
test('actual failed reminder read after accepted discard', async ({page, ux, browser}) => {
  const side = process.env.PR417_CAPTURE_SIDE;
  if (!['before', 'after'].includes(side)) throw Error('Capture side required');
  const source = process.env.PR417_CAPTURE_SOURCE;
  const out = process.env.PR417_CAPTURE_OUTPUT;
  const exportRoot = process.env.PR417_EXPORT_ROOT;
  const harnessSource = cp.execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  if (cp.execFileSync('git', ['-C', root, 'status', '--porcelain'], {encoding:'utf8'}).trim()) throw Error('Source worktree must be clean');
  const pending = [];
  const servedAssets = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (!/\.(js|css)$/.test(url.pathname) || !response.ok()) return;
    pending.push((async () => {
      const bytes = await response.body();
      const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
      const disk = fs.readFileSync(path.join(exportRoot, relative));
      if (!bytes.equals(disk)) throw Error('Served asset differs from source export: ' + relative);
      servedAssets.push({path: relative, sha256: hash(bytes)});
    })());
  });
  await ux.install('populated');
  const fixture = await installNotificationApi(page);
  await page.goto('/preferences');
  await hideTransientPwaNotices(page);
  const time = page.getByTestId('settings-food-reminder-time');
  const originalValue = await time.inputValue();
  await time.fill('08:30');
  await page.getByTestId('notifications-button').click();
  const panel = page.getByTestId('notifications-drawer-panel');
  fixture.failActions = 1;
  fixture.holdActions = true;
  expectApiFailure(page, {method:'PATCH', pathname:'/api/v1/notifications/in-app/123/read', status:503});
  const confirmation = page.waitForEvent('dialog');
  const click = panel.getByTestId('notification-open-123').click();
  const prompt = await confirmation;
  expect(prompt.message()).toContain('Discard changes?');
  await prompt.accept();
  await click;
  await expect(panel.getByTestId('notification-open-123')).toBeDisabled();
  await expect.poll(() => fixture.releaseAction !== null).toBe(true);
  await expect.poll(() => panel.evaluate(element => Math.round(element.getBoundingClientRect().left))).toBe(1000);
  fs.mkdirSync(out, {recursive:true});
  const pendingImageName = side + '-pending-open-1440-light.png';
  const pendingImage = await page.screenshot({path:path.join(out,pendingImageName),animations:'disabled'});
  const pendingValue = await time.inputValue();
  fixture.releaseAction();
  await expect(panel.getByText('Unable to update that notification. Try again.')).toBeVisible();
  await expect(panel.getByTestId('notification-card-123')).toBeVisible();
  await expect(panel.getByText('20 unread', {exact:true})).toBeVisible();
  await panel.getByRole('button', {name:'Close notifications'}).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('notifications-button')).toBeFocused();
  await expect(page).toHaveURL(url => url.pathname === '/preferences');
  const expectedValue = side === 'before' ? originalValue : '08:30';
  await expect(time).toHaveValue(expectedValue);
  await expect(page.getByTestId('notifications-badge')).toHaveText('20');
  await Promise.all(pending);
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(out, {recursive:true});
  const imageName = side + '-failed-open-1440-light.png';
  const image = await page.screenshot({path:path.join(out,imageName), animations:'disabled'});
  const record = {
    scenario:'dirty Preferences 08:30; accept discard; read fails 503; close drawer', side, source, harnessSource,
    checkedAtUtc:new Date().toISOString(), browser:browser.version(), host:require('node:os').hostname(),
    viewport:{width:1440,height:1000}, colorScheme:'light', deviceScaleFactor:1, reducedMotion:'reduce',
    syntheticClock:'2026-07-21T19:00:00.000Z', timezone:'America/Los_Angeles', locale:'en-US',
    originalValue, editedValue:'08:30', observedValue:await time.inputValue(), expectedValue,
    requests:fixture.actionRequests, unreadCount:20, route:new URL(page.url()).pathname,
    image:imageName, imageSha256:hash(image), pendingImage:pendingImageName, pendingImageSha256:hash(pendingImage), pendingValue,
    servedAssets:servedAssets.sort((a,b)=>a.path.localeCompare(b.path)),
    captureHarnessSha256:hash(fs.readFileSync(__filename)), configSha256:hash(fs.readFileSync(path.join(__dirname,'pr417-guard-capture.config.cjs'))),
  };
  fs.writeFileSync(path.join(out,side+'-capture.json'), JSON.stringify(record,null,2)+'\n');
});
