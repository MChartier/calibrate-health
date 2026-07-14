import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildE2eRequestHeaders, crashBufferContainsCalibrateProcess } from './android-e2e.mjs';

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
