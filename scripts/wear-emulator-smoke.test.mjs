import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWearScrollGesture,
  createRecoveringWearUiReader,
  findTextNode,
  listWearUiPackages,
  parseBounds,
  parseWmSize,
  prepareWearUi,
  resolveWearAdb,
  waitForScrollableWearUi,
  waitForWearUi
} from './wear-emulator-smoke.mjs';

test('Wear UI preparation provisions, verifies, wakes, and unlocks the emulator before launch', () => {
  const commands = [];
  prepareWearUi((args) => {
    commands.push(args);
    if (args[2] === 'get') return '1';
    return '';
  });
  assert.deepEqual(commands, [
    ['shell', 'settings', 'put', 'global', 'device_provisioned', '1'],
    ['shell', 'settings', 'put', 'secure', 'user_setup_complete', '1'],
    ['shell', 'settings', 'get', 'global', 'device_provisioned'],
    ['shell', 'settings', 'get', 'secure', 'user_setup_complete'],
    ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'],
    ['shell', 'wm', 'dismiss-keyguard'],
    ['shell', 'input', 'keyevent', '82']
  ]);

  assert.throws(
    () => prepareWearUi((args) => (
      args[2] === 'get' && args[4] === 'device_provisioned' ? '0' : '1'
    )),
    /did not persist global device_provisioned=1/
  );
});

test('Wear adb resolution trims an explicit executable override', () => {
  assert.equal(
    resolveWearAdb({ ADB: '  /opt/platform-tools/custom-adb  ' }, 'linux'),
    '/opt/platform-tools/custom-adb',
  );
});

test('Wear adb resolution uses Linux SDK roots and a PATH fallback', () => {
  assert.equal(
    resolveWearAdb({ ANDROID_HOME: '/opt/android-sdk' }, 'linux'),
    '/opt/android-sdk/platform-tools/adb',
  );
  assert.equal(resolveWearAdb({ ANDROID_SDK_ROOT: '/srv/android-sdk' }, 'linux'), '/srv/android-sdk/platform-tools/adb');
  assert.equal(resolveWearAdb({}, 'linux'), 'adb');
});

test('Wear adb resolution uses Windows SDK and local-app-data paths', () => {
  assert.equal(resolveWearAdb({ ANDROID_SDK_ROOT: 'C:\\Android' }, 'win32'), 'C:\\Android\\platform-tools\\adb.exe');
  assert.equal(
    resolveWearAdb({ LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' }, 'win32'),
    'C:\\Users\\tester\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe',
  );
  assert.equal(resolveWearAdb({}, 'win32'), 'adb.exe');
});
test('Wear smoke parser derives tap coordinates from the UI tree', () => {
  const xml = '<hierarchy><node text="Connection" bounds="[24,156][430,260]" /></hierarchy>';

  const node = findTextNode(xml, 'Connection');
  assert.deepEqual(node, { text: 'Connection', bounds: '[24,156][430,260]' });
  assert.deepEqual(parseBounds(node.bounds), { x: 227, y: 208 });
});

test('Wear scrolling stays within the discovered round display', () => {
  const screen = parseWmSize('Physical size: 454x454');
  assert.deepEqual(screen, { width: 454, height: 454 });
  assert.deepEqual(buildWearScrollGesture(screen), ['227', '354', '227', '100', '300']);
  assert.throws(() => parseWmSize('unknown'), /parse Wear screen size/);
  assert.throws(() => buildWearScrollGesture({ width: 454, height: 0 }), /positive integer/);
});

test('Wear readiness waits for one complete exact UI tree', () => {
  const expected = ['calibrate', 'Connection'];
  const trees = [
    '<hierarchy />',
    '<hierarchy><node text="calibrate" bounds="[1,1][2,2]" /></hierarchy>',
    '<hierarchy><node text="calibrate" bounds="[1,1][2,2]" />' +
      '<node text="Connection" bounds="[2,2][3,3]" /></hierarchy>'
  ];
  let reads = 0;
  let waits = 0;
  const ready = waitForWearUi(expected, () => trees[reads++], () => { waits += 1; }, 3);
  assert.equal(ready, trees[2]);
  assert.equal(reads, 3);
  assert.equal(waits, 2);
});

test('Wear readiness reasserts the app after first-boot System UI takes foreground', () => {
  const trees = [
    '<hierarchy><node package="com.google.android.wearable.sysui" /></hierarchy>',
    '<hierarchy><node package="app.calibratehealth.mobile" text="calibrate" /></hierarchy>'
  ];
  let reads = 0;
  let relaunches = 0;
  const readUi = createRecoveringWearUiReader(
    'app.calibratehealth.mobile',
    () => trees[reads++],
    () => { relaunches += 1; }
  );

  assert.equal(readUi(), trees[0]);
  assert.equal(relaunches, 1);
  assert.equal(readUi(), trees[1]);
  assert.equal(relaunches, 1);
  assert.throws(
    () => createRecoveringWearUiReader('bad package', () => '', () => {}),
    /exact package name/
  );
});

test('Wear readiness fails closed after its bounded exact-selector attempts', () => {
  const blockedTree = '<hierarchy><node text="calibrate" package="com.google.android.wearable.setupwizard" ' +
    'bounds="[1,1][2,2]" /></hierarchy>';
  assert.deepEqual(listWearUiPackages(blockedTree), ['com.google.android.wearable.setupwizard']);

  let reads = 0;
  let waits = 0;
  assert.throws(
    () => waitForWearUi(
      ['calibrate', 'Connection'],
      () => {
        reads += 1;
        return blockedTree;
      },
      () => { waits += 1; },
      3
    ),
    /did not become ready with expected text: Connection; visible packages: com.google.android.wearable.setupwizard/
  );
  assert.equal(reads, 3);
  assert.equal(waits, 2);
  assert.throws(() => waitForWearUi([], () => '', () => {}), /exact non-empty text selectors/);
  assert.throws(() => waitForWearUi(['calibrate'], () => '', () => {}, 0), /positive integer/);
});
test('Wear scrollable readiness verifies exact rows across one bounded surface', () => {
  const trees = [
    '<hierarchy><node text="Connection" bounds="[1,1][2,2]" /></hierarchy>',
    '<hierarchy><node text="release build" bounds="[1,1][2,2]" /></hierarchy>',
    '<hierarchy><node text="Pair on phone" bounds="[1,1][2,2]" /></hierarchy>'
  ];
  let reads = 0;
  let scrolls = 0;
  const ready = waitForScrollableWearUi(
    ['Connection', 'release build', 'Pair on phone'],
    () => trees[reads++],
    () => { scrolls += 1; },
    3
  );
  assert.equal(ready, trees[2]);
  assert.equal(reads, 3);
  assert.equal(scrolls, 2);

  assert.throws(
    () => waitForScrollableWearUi(['Connection', 'Pair on phone'], () => trees[0], () => {}, 2),
    /did not expose expected text: Pair on phone/
  );
});

test('Wear smoke parser rejects malformed bounds and missing text', () => {
  assert.equal(findTextNode('<hierarchy />', 'Connection'), null);
  assert.throws(() => parseBounds('24,156,430,260'), /Invalid Android bounds/);
});
