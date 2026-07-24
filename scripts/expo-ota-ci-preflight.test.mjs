import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseExpoOtaCiArgs,
  validateEasCiEnvironment
} from './expo-ota-ci-preflight.mjs';

test('OTA CI CLI requires explicit channel and environment inputs', () => {
  assert.deepEqual(parseExpoOtaCiArgs([
    '--channel', 'production',
    '--environment', 'production',
    '--environment-file', 'eas.env'
  ]), {
    channel: 'production',
    environment: 'production',
    environmentFile: 'eas.env',
    help: false
  });
  assert.throws(() => parseExpoOtaCiArgs(['--unknown']), /Unknown Expo OTA CI option/);
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
