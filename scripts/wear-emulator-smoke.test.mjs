import assert from 'node:assert/strict';
import test from 'node:test';
import { findTextNode, parseBounds, resolveWearAdb } from './wear-emulator-smoke.mjs';

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

test('Wear smoke parser rejects malformed bounds and missing text', () => {
  assert.equal(findTextNode('<hierarchy />', 'Connection'), null);
  assert.throws(() => parseBounds('24,156,430,260'), /Invalid Android bounds/);
});
