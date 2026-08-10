import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findTextNode,
  parseBounds,
  prepareWearUi,
  resolveWearAdb,
  waitForScrollableWearUi,
  waitForWearUi
} from './wear-emulator-smoke.mjs';

test('Wear UI preparation wakes and unlocks the exact emulator before launch', () => {
  const commands = [];
  prepareWearUi((args) => commands.push(args));
  assert.deepEqual(commands, [
    ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'],
    ['shell', 'wm', 'dismiss-keyguard'],
    ['shell', 'input', 'keyevent', '82']
  ]);
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

test('Wear readiness fails closed after its bounded exact-selector attempts', () => {
  let reads = 0;
  let waits = 0;
  assert.throws(
    () => waitForWearUi(
      ['calibrate', 'Connection'],
      () => {
        reads += 1;
        return '<hierarchy><node text="calibrate" bounds="[1,1][2,2]" /></hierarchy>';
      },
      () => { waits += 1; },
      3
    ),
    /did not become ready with expected text: Connection/
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
