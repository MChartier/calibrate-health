import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import createExpoConfig from '../mobile/app.config.js';

const config = JSON.parse(fs.readFileSync(new URL('../mobile/app.json', import.meta.url))).expo;
const ios = JSON.parse(fs.readFileSync(new URL('../shared/ios-release.json', import.meta.url)));
const environment = { EXPO_PUBLIC_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111', EXPO_UPDATES_CHANNEL: 'production' };
test('native iOS version and runtime are independent while Android retains its existing runtime policy', () => {
  const android = createExpoConfig({ config: structuredClone(config) }, environment);
  assert.equal(android.version, config.version); assert.deepEqual(android.runtimeVersion, { policy: 'appVersion' });
  const native = createExpoConfig({ config: structuredClone(config) }, { ...environment, EAS_BUILD_PLATFORM: 'ios' });
  assert.equal(native.version, ios.version); assert.equal(native.ios.buildNumber, ios.buildNumber);
  assert.equal(native.ios.runtimeVersion, `ios-${ios.version}-${ios.buildNumber}`);
});
test('verified OTA export can target an installed older runtime; a native build cannot inherit that override', () => {
  const ota = { ...environment, CALIBRATE_IOS_OTA_RUNTIME: 'ios-0.2.1-7', CALIBRATE_IOS_OTA_EXPORT: '1' };
  const exported = createExpoConfig({ config: structuredClone(config) }, ota);
  assert.equal(exported.version, '0.2.1'); assert.equal(exported.ios.runtimeVersion, ota.CALIBRATE_IOS_OTA_RUNTIME);
  assert.throws(() => createExpoConfig({ config }, { ...ota, EAS_BUILD: 'true' }), /never a native build/);
  assert.throws(() => createExpoConfig({ config }, { ...ota, CALIBRATE_IOS_OTA_EXPORT: '' }), /verified OTA export/);
  assert.throws(() => createExpoConfig({ config }, { ...ota, CALIBRATE_IOS_OTA_RUNTIME: 'arbitrary' }), /verified OTA export/);
});
