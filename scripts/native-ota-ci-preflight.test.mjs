import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseNativeOtaCiArgs,
  validateEasCiEnvironment,
  validateNativeOtaCompatibility
} from './native-ota-ci-preflight.mjs';

test('OTA CI CLI requires explicit native-build targeting inputs', () => {
  assert.deepEqual(parseNativeOtaCiArgs([
    '--native-build-ref', 'v0.12.2',
    '--channel', 'production',
    '--environment', 'production',
    '--environment-file', 'eas.env'
  ]), {
    nativeBuildRef: 'v0.12.2',
    channel: 'production',
    environment: 'production',
    environmentFile: 'eas.env',
    help: false
  });
  assert.throws(() => parseNativeOtaCiArgs(['--unknown']), /Unknown native OTA CI option/);
});

test('OTA CI accepts only the exact compatible native runtime', () => {
  const installed = { runtimeVersion: '0.2.1', fingerprint: 'abc' };
  validateNativeOtaCompatibility(installed, { ...installed });
  assert.throws(
    () => validateNativeOtaCompatibility(installed, { ...installed, runtimeVersion: '0.2.2' }),
    /Native runtime version changed/
  );
  assert.throws(
    () => validateNativeOtaCompatibility(installed, { ...installed, fingerprint: 'def' }),
    /Native runtime inputs changed/
  );
});

test('OTA CI validates the selected EAS environment contract', () => {
  const projectId = '01234567-89ab-4def-8123-456789abcdef';
  const expected = { projectId, channel: 'production', environment: 'production' };
  assert.deepEqual(validateEasCiEnvironment({
    EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
    EXPO_UPDATES_CHANNEL: 'production',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://calibrate.example'
  }, expected), {
    projectId,
    channel: 'production',
    serverUrl: 'https://calibrate.example'
  });
  assert.throws(() => validateEasCiEnvironment({
    EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
    EXPO_UPDATES_CHANNEL: 'internal',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://calibrate.example'
  }, expected), /targets channel internal/);
  assert.throws(() => validateEasCiEnvironment({
    EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
    EXPO_UPDATES_CHANNEL: 'production',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'http:\/\/calibrate.example'
  }, expected), /must use an HTTPS/);
});
