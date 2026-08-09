import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOSTED_WEAR_AVD,
  HOSTED_WEAR_SERIAL,
  HOSTED_WEAR_SYSTEM_IMAGE,
  assertHostedNativeRunner,
  createHostedWearCommandPlan,
  parseHostedNativeEmulatorCommand
} from './hosted-native-emulators.mjs';

const HOSTED_ENVIRONMENT = Object.freeze({
  ANDROID_HOME: '/opt/android-sdk',
  GITHUB_ACTIONS: 'true',
  RUNNER_OS: 'Linux',
  RUNNER_TEMP: '/runner-temp'
});

test('hosted Wear lifecycle is unavailable on operator and non-Linux hosts', () => {
  assert.throws(() => assertHostedNativeRunner({}), /restricted to GitHub Actions Linux runners/);
  assert.throws(
    () => assertHostedNativeRunner({ ...HOSTED_ENVIRONMENT, RUNNER_OS: 'Windows' }),
    /restricted to GitHub Actions Linux runners/
  );
});

test('hosted Wear plan owns one deterministic API 35 x86_64 emulator target', () => {
  const plan = createHostedWearCommandPlan(HOSTED_ENVIRONMENT, 'linux');
  assert.equal(plan.config.avdName, HOSTED_WEAR_AVD);
  assert.equal(plan.config.serial, HOSTED_WEAR_SERIAL);
  assert.equal(plan.config.systemImage, HOSTED_WEAR_SYSTEM_IMAGE);
  assert.equal(plan.config.serial, 'emulator-5556');
  assert.deepEqual(plan.prepare[0].args, [
    '--install', 'emulator', 'platform-tools',
    'system-images;android-35;android-wear;x86_64'
  ]);
  assert.deepEqual(plan.wait.args, ['-s', 'emulator-5556', 'wait-for-device']);
  assert.deepEqual(plan.stop.args, ['-s', 'emulator-5556', 'emu', 'kill']);
  assert.ok(plan.start.args.includes('-no-window'));
  assert.ok(plan.start.args.includes('-wipe-data'));
  assert.equal(plan.start.args.includes('-writable-system'), false);
});

test('hosted Wear CLI accepts only fixed lifecycle operations', () => {
  assert.equal(parseHostedNativeEmulatorCommand(['prepare-wear']), 'prepare-wear');
  assert.equal(parseHostedNativeEmulatorCommand(['stop-wear']), 'stop-wear');
  assert.throws(() => parseHostedNativeEmulatorCommand(['start', '--serial', 'device']), /Usage:/);
});
