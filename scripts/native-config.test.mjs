import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runNative } from './native.mjs';
import {
  configureNative, nativeConfigurationPath, parseNativeConfigureArguments,
  readNativeConfiguration, resolveNativeCredentialFile
} from './native-config.mjs';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-native-config-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'checkout');
  const userDirectory = path.join(temporary, 'user settings');
  fs.mkdirSync(root);
  fs.mkdirSync(userDirectory);
  const credentialsFile = path.join(temporary, 'signing data.json');
  const serviceAccountFile = path.join(temporary, 'play data.json');
  const keystorePath = path.join(temporary, 'upload.p12');
  fs.writeFileSync(keystorePath, 'test keystore');
  const signing = { android: { keystore: {
    keystorePath, keystorePassword: 'private-store-sentinel', keyAlias: 'upload', keyPassword: 'private-key-sentinel'
  } } };
  const account = { type: 'service_account', client_email: 'test@example.test', private_key: privateKey };
  fs.writeFileSync(credentialsFile, JSON.stringify(signing));
  fs.writeFileSync(serviceAccountFile, JSON.stringify(account));
  const options = { root, platform: 'win32', environment: { LOCALAPPDATA: userDirectory } };
  return { temporary, root, userDirectory, credentialsFile, serviceAccountFile, keystorePath, signing, account, options };
}

test('configuration accepts either path, rejects malformed arguments, and requires an absolute settings root', () => {
  assert.deepEqual(parseNativeConfigureArguments([]), {});
  assert.deepEqual(parseNativeConfigureArguments(['--credentials-file', 'signing.json']), { credentialsFile: 'signing.json' });
  for (const args of [
    ['--credentials-file'], ['--service-account-file', '--credentials-file', 'a'],
    ['--credentials-file', 'a', '--credentials-file', 'b'], ['constructor', 'a'], ['--', 'service-account-file', 'a']
  ]) assert.throws(() => parseNativeConfigureArguments(args));
  assert.throws(() => nativeConfigurationPath({ LOCALAPPDATA: 'relative' }, 'win32'), /absolute/);
  assert.throws(() => nativeConfigurationPath({}, 'win32'), /LOCALAPPDATA/);
});

test('configure validates both assets without SDK/network setup, persists only paths, and shares them across checkouts', (t) => {
  const f = fixture(t);
  const result = configureNative({ credentialsFile: f.credentialsFile, serviceAccountFile: f.serviceAccountFile }, f.options);
  const expected = {
    schemaVersion: 1, credentialsFile: fs.realpathSync(f.credentialsFile), serviceAccountFile: fs.realpathSync(f.serviceAccountFile)
  };
  assert.deepEqual(JSON.parse(fs.readFileSync(result.configurationFile, 'utf8')), expected);
  assert.deepEqual(Object.keys(result).sort(), ['configurationFile', 'credentialsFile', 'schemaVersion', 'serviceAccountFile']);
  assert.equal(JSON.stringify(result).includes('sentinel'), false);
  assert.equal(fs.readFileSync(result.configurationFile, 'utf8').includes('PRIVATE KEY'), false);
  const secondRoot = path.join(f.temporary, 'another checkout');
  fs.mkdirSync(secondRoot);
  const second = { ...f.options, root: secondRoot };
  assert.equal(resolveNativeCredentialFile('credentialsFile', undefined, second), expected.credentialsFile);
  assert.equal(resolveNativeCredentialFile('serviceAccountFile', undefined, second), expected.serviceAccountFile);
  assert.deepEqual(configureNative({}, second), result);
  assert.deepEqual(fs.readdirSync(path.dirname(result.configurationFile)), ['native.json']);
});

test('partial configuration supports build-only use and rotation preserves the other file', (t) => {
  const f = fixture(t);
  configureNative({ credentialsFile: f.credentialsFile }, f.options);
  assert.equal(resolveNativeCredentialFile('credentialsFile', undefined, f.options), fs.realpathSync(f.credentialsFile));
  assert.throws(() => resolveNativeCredentialFile('serviceAccountFile', undefined, f.options), /native:configure.*--service-account-file/);
  configureNative({ serviceAccountFile: f.serviceAccountFile }, f.options);
  const replacement = path.join(f.temporary, 'replacement signing.json');
  fs.copyFileSync(f.credentialsFile, replacement);
  configureNative({ credentialsFile: replacement }, f.options);
  const { config } = readNativeConfiguration(f.options);
  assert.equal(config.credentialsFile, fs.realpathSync(replacement));
  assert.equal(config.serviceAccountFile, fs.realpathSync(f.serviceAccountFile));
});

test('overrides do not change saved paths and build resolution never reads signing contents or the Play credential', (t) => {
  const f = fixture(t);
  configureNative({ credentialsFile: f.credentialsFile, serviceAccountFile: f.serviceAccountFile }, f.options);
  const replacement = path.join(f.temporary, 'once.json');
  fs.writeFileSync(replacement, 'not loaded by path resolution');
  assert.equal(resolveNativeCredentialFile('credentialsFile', replacement, f.options), fs.realpathSync(replacement));
  fs.rmSync(f.serviceAccountFile);
  fs.rmSync(f.keystorePath);
  fs.writeFileSync(f.credentialsFile, 'secrets are not parsed until the consuming build stage');
  assert.equal(resolveNativeCredentialFile('credentialsFile', undefined, f.options), fs.realpathSync(f.credentialsFile));
  assert.throws(() => resolveNativeCredentialFile('serviceAccountFile', undefined, f.options), /existing external file/);
});

test('invalid credential data never overwrites working configuration or prints credential contents', (t) => {
  const f = fixture(t);
  const initial = configureNative({ credentialsFile: f.credentialsFile, serviceAccountFile: f.serviceAccountFile }, f.options);
  const before = fs.readFileSync(initial.configurationFile, 'utf8');
  for (const [file, content, values, pattern] of [
    [f.credentialsFile, '{"password":"private-sentinel"', { credentialsFile: f.credentialsFile }, /Unable to read/],
    [f.serviceAccountFile, JSON.stringify({ ...f.account, private_key: 'private-sentinel' }), { serviceAccountFile: f.serviceAccountFile }, /valid RSA signing key/],
    [f.serviceAccountFile, JSON.stringify({ ...f.account, token_uri: 'https://wrong.example/token' }), { serviceAccountFile: f.serviceAccountFile }, /token_uri must be/]
  ]) {
    fs.writeFileSync(file, content);
    assert.throws(() => configureNative(values, f.options), (error) => {
      assert.match(error.message, pattern);
      assert.equal(error.message.includes('private-sentinel'), false);
      return true;
    });
    assert.equal(fs.readFileSync(initial.configurationFile, 'utf8'), before);
  }
});

test('credentials, keystore, and machine settings cannot be stored in the current checkout', (t) => {
  const f = fixture(t);
  const internal = path.join(f.root, 'credentials.json');
  fs.copyFileSync(f.credentialsFile, internal);
  assert.throws(() => configureNative({ credentialsFile: internal }, f.options), /outside the repository/);
  f.signing.android.keystore.keystorePath = internal;
  fs.writeFileSync(f.credentialsFile, JSON.stringify(f.signing));
  assert.throws(() => configureNative({ credentialsFile: f.credentialsFile }, f.options), /outside the repository/);
  assert.throws(() => configureNative({}, { ...f.options, environment: { LOCALAPPDATA: f.root } }), /outside the repository/);
  const link = path.join(f.userDirectory, 'calibrate-health');
  fs.symlinkSync(f.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => readNativeConfiguration(f.options), /outside the repository/);
});

test('corrupt settings fail with an actionable error and can be replaced by configuring both files', (t) => {
  const f = fixture(t);
  const file = nativeConfigurationPath(f.options.environment, 'win32');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const invalid of ['secret-sentinel{', JSON.stringify({ schemaVersion: 1, credentialsFile: 'relative.json' }),
    JSON.stringify({ schemaVersion: 1, unexpectedSecret: 'secret-sentinel' })]) {
    fs.writeFileSync(file, invalid);
    assert.throws(() => readNativeConfiguration(f.options), (error) => {
      assert.match(error.message, /native:configure with both/);
      assert.equal(error.message.includes('secret-sentinel'), false);
      return true;
    });
    assert.equal(resolveNativeCredentialFile('credentialsFile', f.credentialsFile, f.options), fs.realpathSync(f.credentialsFile));
  }
  configureNative({ credentialsFile: f.credentialsFile, serviceAccountFile: f.serviceAccountFile }, f.options);
  assert.equal(readNativeConfiguration(f.options).config.credentialsFile, fs.realpathSync(f.credentialsFile));
});

test('the CLI configures and reads saved paths in separate processes without Android tools', (t) => {
  const f = fixture(t);
  const script = fileURLToPath(new URL('./native.mjs', import.meta.url));
  const environment = { ...process.env, LOCALAPPDATA: f.userDirectory, XDG_CONFIG_HOME: f.userDirectory, JAVA_HOME: 'missing-sdk' };
  const execute = (args) => JSON.parse(execFileSync(process.execPath, [script, 'configure', ...args], {
    env: environment, encoding: 'utf8', windowsHide: true
  }));
  const configured = execute(['--credentials-file', f.credentialsFile, '--service-account-file', f.serviceAccountFile]);
  assert.deepEqual(execute([]), configured);
  assert.equal(configured.credentialsFile, fs.realpathSync(f.credentialsFile));
  assert.equal(configured.serviceAccountFile, fs.realpathSync(f.serviceAccountFile));
});

test('configure, setup, bare build, and bare submit compose without passing credentials between commands', async (t) => {
  const f = fixture(t);
  const events = [];
  const options = {
    ...f.options, readUserEnvironment: () => ({}), log: () => {},
    setup: (_args, { environment }) => {
      assert.equal(environment.CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD, undefined);
      events.push('setup');
    },
    internal: (args, { environment }) => {
      assert.equal(environment.CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD, undefined);
      assert.equal(environment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
      events.push(args);
    }
  };
  await runNative(['configure', '--credentials-file', f.credentialsFile, '--service-account-file', f.serviceAccountFile], options);
  await runNative(['setup'], options);
  await runNative(['build'], options);
  await runNative(['submit'], options);
  assert.deepEqual(events, [
    'setup',
    ['build', '--credentials-file', fs.realpathSync(f.credentialsFile)],
    ['submit', '--service-account-file', fs.realpathSync(f.serviceAccountFile), '--confirm-play-console-clean']
  ]);
});
