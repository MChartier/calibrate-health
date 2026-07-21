import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  classifyReleaseDevice,
  deduplicateReleaseDevices,
  parseAdbDeviceRows,
  parseApkBadging,
  parseNativeReleaseDeviceArgs,
  parseSignerFingerprint,
  releaseDeviceCandidates,
  nativeReleaseToolEnvironment,
  resolveNativeReleaseDeviceTooling
} from './native-release-devices.mjs';

test('release device CLI supports repeat installs and explicit non-interactive targets', () => {
  assert.deepEqual(parseNativeReleaseDeviceArgs([
    '--skip-build',
    '--phone-serial', 'phone-1',
    '--watch-serial', 'watch-1',
    '--server-url', 'https://health.example',
    '--keystore', 'signing/calibrate.p12',
    '--key-alias', 'calibrate',
    '--eas-project-id', '01234567-89ab-4def-8123-456789abcdef',
    '--updates-channel', 'internal',
    '--replace-incompatible',
    '--no-launch'
  ]), {
    skipBuild: true,
    phoneSerial: 'phone-1',
    watchSerial: 'watch-1',
    serverUrl: 'https://health.example',
    keystore: 'signing/calibrate.p12',
    keyAlias: 'calibrate',
    easProjectId: '01234567-89ab-4def-8123-456789abcdef',
    updatesChannel: 'internal',
    replaceIncompatible: true,
    launch: false,
    help: false
  });
  assert.throws(() => parseNativeReleaseDeviceArgs(['--unknown']), /Unknown native release device option/);
});

test('ADB parsing preserves Windows mDNS serials containing a duplicate suffix', () => {
  const rows = parseAdbDeviceRows(`List of devices attached
R5Cphone device product:phone model:Galaxy transport_id:1
adb-watch (2)._adb-tls-connect._tcp device product:watch model:Ultra transport_id:2
offline-one offline transport_id:3
`);
  assert.deepEqual(rows.map(({ serial, state }) => ({ serial, state })), [
    { serial: 'R5Cphone', state: 'device' },
    { serial: 'adb-watch (2)._adb-tls-connect._tcp', state: 'device' },
    { serial: 'offline-one', state: 'offline' }
  ]);
});

test('duplicate watch routes collapse to the stable mDNS serial', () => {
  const base = {
    hardwareSerial: 'RFAXB16LVCJ',
    model: 'SM-L705U',
    characteristics: 'watch',
    role: 'watch',
    isEmulator: false
  };
  const devices = deduplicateReleaseDevices([
    { ...base, serial: 'adb-watch (2)._adb-tls-connect._tcp' },
    { ...base, serial: 'adb-watch._adb-tls-connect._tcp' }
  ]);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].serial, 'adb-watch._adb-tls-connect._tcp');
  assert.equal(classifyReleaseDevice('nosdcard,watch'), 'watch');
  assert.equal(classifyReleaseDevice('phone'), 'phone');
});

test('physical devices are preferred over emulators for release installation', () => {
  const candidates = releaseDeviceCandidates('phone', [
    { role: 'phone', serial: 'emulator-5554', isEmulator: true },
    { role: 'watch', serial: 'watch-1', isEmulator: false },
    { role: 'phone', serial: 'R5Cphone', isEmulator: false }
  ]);
  assert.deepEqual(candidates.map(({ serial }) => serial), ['R5Cphone']);
});

test('APK parsers retain release identity and normalize certificate fingerprints', () => {
  assert.deepEqual(
    parseApkBadging("package: name='app.calibratehealth.mobile' versionCode='2' versionName='0.2.0' platformBuildVersionName='16'"),
    { applicationId: 'app.calibratehealth.mobile', versionCode: 2, versionName: '0.2.0' }
  );
  assert.equal(
    parseSignerFingerprint('V2 Signer: certificate SHA-256 digest: B3:6E:57:03'),
    'b36e5703'
  );
});

test('tool resolution uses standard Windows Android Studio paths and newest build tools', () => {
  const root = path.join('C:', 'Android');
  const result = resolveNativeReleaseDeviceTooling({
    ANDROID_HOME: root,
    JAVA_HOME: path.join('C:', 'Java')
  }, {
    platform: 'win32',
    buildToolVersions: ['36.0.0', '37.0.0'],
    fileExists: () => true
  });
  assert.equal(result.sdkRoot, root);
  assert.match(result.apksignerJar, /37\.0\.0/);
  assert.deepEqual(nativeReleaseToolEnvironment({}, result), {
    JAVA_HOME: result.javaHome,
    ANDROID_HOME: result.sdkRoot,
    ANDROID_SDK_ROOT: result.sdkRoot
  });
});
