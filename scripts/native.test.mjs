import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseNativeArguments, runNative } from './native.mjs';

function fixture() {
  const calls = [];
  const environment = {
    PATH: 'tools', JAVA_HOME: 'explicit-java',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://synthetic.invalid',
    EXPO_PUBLIC_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
    CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD: 'signing-secret',
    google_play_access_token: 'play-secret', GOOGLE_APPLICATION_CREDENTIALS: 'secret-file',
    EXPO_TOKEN: 'expo-secret'
  };
  const record = (name) => (...args) => { calls.push([name, ...args]); return { ok: true }; };
  return { calls, environment, options: {
    environment, platform: 'win32', readUserEnvironment: () => {
      calls.push(['settings']);
      return { JAVA_HOME: 'saved-java', BUNDLETOOL_JAR: 'saved-bundletool' };
    },
    internal: record('internal'), setup: record('setup'), ota: record('ota'),
    configure: record('configure'), log: record('log'),
    resolveCredentialFile: (field, override) => override ||
      (field === 'credentialsFile' ? 'configured-signing.json' : 'configured-play.json'),
    verifyArtifacts: record('verify'), devices: record('devices')
  } };
}

test('root exposes native package commands and a separate OTA publication command without implementation stages', () => {
  const { scripts } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  const nativeActions = ['build', 'install', 'release', 'configure', 'setup'];
  for (const action of nativeActions) assert.equal(scripts['native:' + action], 'node scripts/native.mjs ' + action);
  assert.deepEqual(Object.keys(scripts).filter((name) => name.startsWith('native:')).sort(),
    nativeActions.map((action) => 'native:' + action).sort());
  assert.equal(scripts['ota:publish'], 'node scripts/native.mjs ota');
  assert.equal(scripts.native, undefined);
  assert.deepEqual(Object.keys(scripts).filter((key) => /^(?:setup:|prepare:|build:|release:)native/.test(key)), []);
});

test('root and per-action help do not inspect settings, credentials or artifacts', async () => {
  const { options, calls } = fixture();
  options.resolveCredentialFile = () => assert.fail('Help must not read configured credentials');
  for (const argv of [[], ['--help'], ...['build','ota','install','release','configure','setup'].map((action) => [action, '--help'])]) {
    const output = await runNative(argv, options);
    if (argv[0] === 'ota') assert.match(output, /npm run ota:publish -- /);
    else assert.match(output, /npm run /);
    assert.doesNotMatch(output, /npm run native --/);
    assert.doesNotMatch(output, /native:(?:doctor|version|status)/);
  }
  assert.deepEqual(calls, []);
});

test('invalid actions and options fail before any side effects or authentication', async () => {
  const { options, calls } = fixture();
  for (const argv of [
    ['prepare'], ['deploy'], ['doctor'], ['version'], ['status'], ['submit'],
    ['release', '--skip-build', '--skip-build'], ['release', '--service-account-file'],
    ['release', '--skip-build', '--credentials-file', 'a'], ['release', '--track', 'production'],
    ['release', '--confirm-play-console-clean'],
    ['build', '--credentials-file'], ['build', '--credentials-file', 'a', '--track', 'production'],
    ['submit', '--service-account-file'], ['submit', '--service-account-file', 'a', '--confirm-play-console-clean', '--track', 'production'],
    ['configure', '--credentials-file'], ['configure', '--service-account-file', 'a', '--service-account-file', 'b'],
    ['install', '--skip-build'], ['install', '--keystore', 'secret'], ['install', '--phone-serial'],
    ['install', '--no-launch', '--no-launch'], ['version', '--bump', 'invalid'], ['ota', '--credentials-file', 'a']
  ]) await assert.rejects(runNative(argv, options));
  assert.deepEqual(calls, []);
});

test('configure admits only Expo authentication before SDK setup', async () => {
  const { options, calls } = fixture();
  await runNative(['configure', '--service-account-file', 'play.json'], options);
  assert.deepEqual(calls.map(([name]) => name), ['configure']);
  assert.deepEqual(calls[0][1], { serviceAccountFile: 'play.json' });
  assert.equal(calls[0][2].environment.EXPO_TOKEN, 'expo-secret');
  assert.equal(calls[0][2].environment.CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD, undefined);
});

test('build and one-command release resolve configured paths before invoking workers', async () => {
  const { options, calls } = fixture();
  await runNative(['build'], options);
  assert.deepEqual(calls.at(-1)[1], ['build', '--credentials-file', 'configured-signing.json']);
  calls.length = 0;
  await runNative(['release'], options);
  assert.deepEqual(calls.map(([name]) => name), ['settings', 'log', 'internal', 'internal']);
  assert.deepEqual(calls[2][1], ['build', '--credentials-file', 'configured-signing.json']);
  assert.deepEqual(calls[3][1], ['submit', '--service-account-file', 'configured-play.json', '--confirm-play-console-clean']);
  for (const call of [calls[2], calls[3]]) {
    assert.equal(call[2].environment.EXPO_TOKEN, undefined);
    assert.equal(call[2].environment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
    assert.equal(call[2].environment.CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD, undefined);
    assert.equal(call[2].environment.BUNDLETOOL_JAR, 'saved-bundletool');
  }
  options.resolveCredentialFile = () => { throw new Error('Run native:configure first'); };
  calls.length = 0;
  await assert.rejects(runNative(['release'], options), /native:configure/);
  assert.deepEqual(calls, []);
});

test('build uses external credentials after isolating inherited secrets and restores saved tool paths', async () => {
  const { options, calls, environment } = fixture();
  await runNative(['build', '--credentials-file', 'external.json'], options);
  assert.deepEqual(calls.map(([name]) => name), ['settings', 'internal']);
  assert.deepEqual(calls[1][1], ['build', '--credentials-file', 'external.json']);
  assert.deepEqual(calls[1][2].environment, { PATH: 'tools', JAVA_HOME: 'explicit-java', BUNDLETOOL_JAR: 'saved-bundletool',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://synthetic.invalid', EXPO_PUBLIC_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111' });
  assert.equal(environment.CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD, 'signing-secret');
  assert.equal(environment.BUNDLETOOL_JAR, undefined);
});

test('install verifies retained artifacts before device access and always skips building', async () => {
  const { options, calls } = fixture();
  await runNative(['install', '--phone-serial', 'phone', '--watch-serial', 'watch', '--no-launch'], options);
  assert.deepEqual(calls.map(([name]) => name), ['settings', 'verify', 'devices']);
  const { config, environment } = calls[2][1];
  assert.equal(config.skipBuild, true);
  assert.equal(config.phoneSerial, 'phone');
  assert.equal(config.watchSerial, 'watch');
  assert.equal(config.launch, false);
  assert.equal(config.replaceIncompatible, false);
  assert.equal(environment.EXPO_UPDATES_CHANNEL, 'internal');
  options.verifyArtifacts = () => { throw new Error('Stale build'); };
  calls.length = 0;
  await assert.rejects(runNative(['install'], options), /Stale build/);
  assert.deepEqual(calls.map(([name]) => name), ['settings']);
});

test('release --skip-build submits retained artifacts without reading signing configuration', async () => {
  const { options, calls } = fixture();
  options.resolveCredentialFile = (field, override) => {
    assert.equal(field, 'serviceAccountFile');
    return override;
  };
  await runNative(['release', '--skip-build', '--service-account-file', 'play.json'], options);
  assert.deepEqual(calls.map(([name]) => name), ['settings', 'log', 'internal']);
  assert.deepEqual(calls.at(-1)[1], ['submit', '--service-account-file', 'play.json', '--confirm-play-console-clean']);
});

test('release passes only each stage credential path to its worker', async () => {
  const { options, calls } = fixture();
  await runNative(['release', '--credentials-file', 'signing.json', '--service-account-file', 'play.json'], options);
  assert.deepEqual(calls[2][1], ['build', '--credentials-file', 'signing.json']);
  assert.deepEqual(calls[3][1], ['submit', '--service-account-file', 'play.json', '--confirm-play-console-clean']);
});

test('release never submits after build failure or failed verification', async () => {
  for (const failure of ['throw', 'result']) {
    const { options, calls } = fixture();
    options.internal = async (args) => {
      calls.push(['internal', args]);
      if (failure === 'throw') throw new Error('Build failed');
      return { ok: false };
    };
    await assert.rejects(runNative(['release'], options), /failed/i);
    assert.deepEqual(calls.map(([name]) => name), ['settings', 'log', 'internal']);
    assert.equal(calls[2][1][0], 'build');
  }
});

test('release waits for the full build before submission and propagates upload failures', async () => {
  const { options, calls } = fixture();
  let finishBuild;
  const pendingBuild = new Promise((resolve) => { finishBuild = resolve; });
  options.internal = async (args) => {
    calls.push(['internal', args]);
    if (args[0] === 'build') return pendingBuild;
    throw new Error('Upload failed; retry the retained build');
  };
  const release = runNative(['release'], options);
  assert.deepEqual(calls.filter(([name]) => name === 'internal').map(([, args]) => args[0]), ['build']);
  finishBuild({ ok: true });
  await assert.rejects(release, /Upload failed/);
  assert.deepEqual(calls.filter(([name]) => name === 'internal').map(([, args]) => args[0]), ['build', 'submit']);
});

test('OTA forwards dry-run and baseline options, admits only Expo auth, and needs no Android SDK', async () => {
  const { options, calls } = fixture();
  await runNative(['ota', '--dry-run', '--non-interactive', '--baseline', 'baseline.json', '--message', 'Test update'], options);
  assert.deepEqual(calls.map(([name]) => name), ['ota']);
  const { environment, config } = calls[0][1];
  assert.equal(environment.EXPO_TOKEN, 'expo-secret');
  assert.equal(environment.CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD, undefined);
  assert.equal(environment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(config.dryRun, true);
  assert.equal(config.nonInteractive, true);
  assert.equal(config.baseline, 'baseline.json');
  assert.equal(config.message, 'Test update');
  assert.equal(parseNativeArguments(['ota']).config.dryRun, false);
});

test('setup delegates read-only checks without injecting credentials', async () => {
  const { options, calls } = fixture();
  options.resolveCredentialFile = () => assert.fail('Tool setup must not read configured credentials');
  await runNative(['setup', '--check'], options);
  assert.deepEqual(calls.map(([name]) => name), ['setup']);
  assert.deepEqual(calls[0][1], ['--check']);
  assert.equal(calls[0][2].environment.EXPO_TOKEN, undefined);
});
