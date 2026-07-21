import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nativeReleaseGradleCommands,
  nativeReleaseInvocation,
  nativeReleasePrebuildCommand,
  resolveNativeReleaseEnvironment
} from './native-release-build.mjs';

const signingEnvironment = {
  CALIBRATE_ANDROID_SIGNING_STORE_FILE: 'signing/calibrate.p12',
  CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD: 'store-password',
  CALIBRATE_ANDROID_SIGNING_KEY_ALIAS: 'calibrate',
  CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD: 'key-password'
};

test('native release environment enforces one complete signing identity and a production origin', () => {
  const resolved = resolveNativeReleaseEnvironment({
    ...signingEnvironment,
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://health.example'
  }, {
    repositoryRoot: 'C:/repo',
    fileExists: () => true
  });

  assert.equal(resolved.EXPO_PUBLIC_CALIBRATE_SERVER_URL, 'https://health.example');
  assert.equal(resolved.EXPO_NO_METRO_WORKSPACE_ROOT, '1');
  assert.equal(resolved.NODE_ENV, 'production');
  assert.equal(resolved.EXPO_UPDATES_CHANNEL, 'internal');
  assert.match(resolved.CALIBRATE_ANDROID_SIGNING_STORE_FILE, /signing[\\/]calibrate\.p12$/);
});

test('native release environment rejects incomplete signing and non-origin HTTP URLs', () => {
  assert.throws(
    () => resolveNativeReleaseEnvironment({}, { fileExists: () => true }),
    /signing is incomplete/
  );
  assert.throws(
    () => resolveNativeReleaseEnvironment({
      ...signingEnvironment,
      EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'http://health.example/path'
    }, { fileExists: () => true }),
    /HTTPS origin/
  );
  assert.throws(
    () => resolveNativeReleaseEnvironment({
      ...signingEnvironment,
      EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'not a URL'
    }, { fileExists: () => true }),
    /HTTPS origin/
  );
  assert.throws(
    () => resolveNativeReleaseEnvironment(signingEnvironment, { fileExists: () => false }),
    /does not point to a file/
  );
  assert.throws(
    () => resolveNativeReleaseEnvironment({
      ...signingEnvironment,
      EXPO_PUBLIC_EAS_PROJECT_ID: 'not-a-uuid'
    }, { fileExists: () => true }),
    /project UUID/
  );
});

test('native release build always produces phone and Wear APK plus AAB tasks', () => {
  for (const platform of ['win32', 'linux']) {
    const commands = nativeReleaseGradleCommands(platform);
    assert.deepEqual(commands.map(({ label }) => label), ['phone', 'wear']);
    for (const command of commands) {
      assert.ok(command.args.includes(':app:bundleRelease'));
      assert.ok(command.args.includes(':app:assembleRelease'));
      assert.ok(command.args.includes('--no-daemon'));
    }
  }
});

test('native release build regenerates the ignored phone project before Gradle', () => {
  const command = nativeReleasePrebuildCommand('C:/repo');

  assert.equal(command.label, 'phone prebuild');
  assert.match(command.cwd, /repo[\\/]mobile$/);
  assert.match(command.args[0], /node_modules[\\/]expo[\\/]bin[\\/]cli$/);
  assert.deepEqual(command.args.slice(1), [
    'prebuild',
    '--platform',
    'android',
    '--clean',
    '--no-install'
  ]);
});

test('Windows release builds bypass the command shell', () => {
  const build = nativeReleaseGradleCommands('win32')[0];
  const invocation = nativeReleaseInvocation(build, build.args, { JAVA_HOME: 'C:/Java' }, 'win32');

  assert.match(invocation.command, /Java[\\/]bin[\\/]java\.exe$/);
  assert.equal(invocation.args[0], '-classpath');
  assert.match(invocation.args[1], /gradle[\\/]wrapper[\\/]gradle-wrapper\.jar$/);
  assert.equal(invocation.args[2], 'org.gradle.wrapper.GradleWrapperMain');
  assert.ok(invocation.args.includes(':app:bundleRelease'));
});
