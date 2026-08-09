import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildAndroidE2eAdbArgs,
  buildE2eRequestHeaders,
  crashBufferContainsCalibrateProcess,
  resolveAndroidE2eAdb
} from './android-e2e.mjs';

const release = JSON.parse(readFileSync(new URL('../shared/release.json', import.meta.url), 'utf8'));

test('Android E2E API probes identify the current phone release', () => {
  const headers = buildE2eRequestHeaders({
    authorization: 'Bearer test-token',
    'x-calibrate-client-platform': 'wear_os',
    'x-calibrate-client-version': '0.0.0'
  });

  assert.equal(headers.get('authorization'), 'Bearer test-token');
  assert.equal(headers.get('x-calibrate-client-platform'), 'android_phone');
  assert.equal(headers.get('x-calibrate-client-version'), release.android.mobile.version_name);
});

test('Android E2E crash checks ignore uiautomator but catch the Calibrate process', () => {
  const uiautomatorCrash = `
E/AndroidRuntime( 4036): FATAL EXCEPTION: main
E/AndroidRuntime( 4036): PID: 4036
E/AndroidRuntime( 4036): java.lang.RuntimeException: Timeout while connecting UiAutomation`;
  const calibrateCrash = `
E/AndroidRuntime( 8123): FATAL EXCEPTION: main
E/AndroidRuntime( 8123): Process: app.calibratehealth.mobile, PID: 8123`;

  assert.equal(crashBufferContainsCalibrateProcess(uiautomatorCrash), false);
  assert.equal(crashBufferContainsCalibrateProcess(calibrateCrash), true);
});

test('hosted Android E2E scopes every adb request to its explicit emulator', () => {
  assert.deepEqual(buildAndroidE2eAdbArgs(['shell', 'getprop', 'ro.kernel.qemu'], ' emulator-5554 '), [
    '-s', 'emulator-5554', 'shell', 'getprop', 'ro.kernel.qemu'
  ]);
  assert.throws(
    () => buildAndroidE2eAdbArgs(['devices'], ''),
    /must explicitly name an emulator-<port>/
  );
  assert.throws(
    () => buildAndroidE2eAdbArgs(['devices'], 'R5CRphysical'),
    /must explicitly name an emulator-<port>/
  );
  assert.equal(
    resolveAndroidE2eAdb({ ANDROID_HOME: '/opt/android-sdk' }, 'linux'),
    '/opt/android-sdk/platform-tools/adb'
  );
  assert.equal(
    resolveAndroidE2eAdb({ ANDROID_SDK_ROOT: 'C:\\Android' }, 'win32'),
    'C:\\Android\\platform-tools\\adb.exe'
  );
});
