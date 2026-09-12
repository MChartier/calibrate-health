import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReleaseContext, releaseEnvironment, withReleaseLock, writeJson, readJson } from './local-release-context.mjs';
import { nativeRecordFile, verifyNativeRecord, prepareLocalNative, releaseLocalNative } from './local-release-native.mjs';
import { publishLocalOta } from './local-release-ota.mjs';
import { executeLocalRelease, parseLocalReleaseArgs } from './local-release.mjs';
import { createNativeRuntimeFingerprint } from './native-ota-contract.mjs';
import { createNativePlayReleasePlan } from './native-play-release.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceCommit = 'a'.repeat(40);
const projectId = 'fda8f8c5-e646-47ac-82fb-35003c9cbec7';
const signer = 'b'.repeat(64);
const serverUrl = 'https://instance.example';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-local-client-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = readJson(path.join(repositoryRoot, 'shared/release.json'));
  const client = { requiresServer: '>=0.36.0 <1.0.0' };
  writeJson(path.join(root, 'shared/release.json'), manifest);
  writeJson(path.join(root, 'shared/client-release.json'), client);
  writeJson(path.join(root, 'mobile/app.json'), { expo: { version: manifest.android.mobile.version_name } });
  writeJson(path.join(root, 'mobile/eas.json'), {});
  writeJson(path.join(root, 'package-lock.json'), { packages: { mobile: {},
    'node_modules/expo': { version: '57.0.7' }, 'node_modules/expo-updates': { version: '57.0.8' } } });
  for (const file of ['mobile/app.config.js', 'mobile/assets/adaptive-icon.png', 'mobile/assets/icon.png',
    'mobile/assets/notification-icon.png', 'mobile/modules/module.ts', 'mobile/plugins/plugin.js',
    'wear/app/native.kt', 'tools/eas-cli/node_modules/eas-cli/bin/run', 'upload.keystore', 'play.json']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), 'fixture');
  }
  const environment = {
    EXPO_PUBLIC_EAS_PROJECT_ID: projectId, EXPO_PUBLIC_CALIBRATE_SERVER_URL: serverUrl,
    CALIBRATE_ANDROID_SIGNING_STORE_FILE: path.join(root, 'upload.keystore'),
    CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD: 'store-secret', CALIBRATE_ANDROID_SIGNING_KEY_ALIAS: 'upload',
    CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD: 'key-secret', CALIBRATE_ANDROID_SIGNER_SHA256: signer,
    CALIBRATE_PLAY_SERVICE_ACCOUNT_FILE: path.join(root, 'play.json')
  };
  const context = { root, stateRoot: path.join(root, '.local-release'), repository: 'example/product',
    sourceCommit, manifest, client, environment, safeEnv: releaseEnvironment(environment),
    git: args => args.includes('show') ? JSON.stringify(manifest) : '',
    run: () => { throw Error('Unexpected external command'); } };
  return context;
}
function baseline(context, channel = 'production') {
  return { schema_version: 1, commit: context.sourceCommit, platform: 'android', project_id: projectId,
    server_url: serverUrl, channel, runtime_version: context.manifest.android.mobile.version_name,
    native_fingerprint_sha256: createNativeRuntimeFingerprint(context.root).sha256 };
}
function record(context, channel = 'production') {
  return { schemaVersion: 1, repository: context.repository, sourceCommit, requiresServer: context.client.requiresServer,
    baseline: baseline(context, channel), signerSha256: signer };
}
function nativeOptions(context) {
  const plan = createNativePlayReleasePlan({ root: context.root, sourceCommit });
  return { verifyArtifacts: () => ({ sourceCommit, applicationId: plan.applicationId, signerSha256: signer,
    artifacts: Object.values(plan.candidates).map(candidate => ({ id: candidate.artifactId, path: candidate.artifactPath,
      sha256: (candidate.role === 'phone' ? 'c' : 'd').repeat(64) })) }) };
}

test('source defaults to clean HEAD and validates an independent server requirement without contacting a server', t => {
  const context = fixture(t);
  const calls = [];
  const run = (_binary, args) => {
    calls.push(args);
    if (args.includes('get-url')) return 'git@github.com:example/product.git';
    if (args.includes('rev-parse')) return sourceCommit;
    return '';
  };
  const actual = createReleaseContext({ root: context.root, environment: context.environment, run });
  assert.equal(actual.sourceCommit, sourceCommit);
  assert.equal(actual.client.requiresServer, context.client.requiresServer);
  assert.equal(calls.some(args => args.includes('fetch')), false);
  assert.equal(fs.existsSync(actual.stateRoot), false);
  assert.throws(() => createReleaseContext({ root: context.root, run: (b,a) => a.includes('status') ? '?? stray' : run(b,a) }), /Commit or stash/);
  writeJson(path.join(context.root, 'shared/client-release.json'), { requiresServer: '^0.36.0' });
  assert.throws(() => createReleaseContext({ root: context.root, run }), /explicit/);
});

test('source subprocesses receive only appropriate build configuration', () => {
  const env = releaseEnvironment({ Path: 'tools', EXPO_TOKEN: 'secret', DATABASE_URL: 'secret',
    CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD: 'secret', NODE_OPTIONS: '--require bad', GIT_CONFIG_COUNT: '1' });
  assert.equal(env.Path, 'tools');
  assert.equal(Object.values(env).includes('secret'), false);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.GIT_CONFIG_COUNT, undefined);
});

test('native allocation previews next odd/even pair and rejects stale source without a tag-signing prerequisite', async t => {
  const context = fixture(t);
  const before = fs.readFileSync(path.join(context.root, 'shared/release.json'), 'utf8');
  const result = await prepareLocalNative(context, { bump: 'patch', dryRun: true });
  assert.equal(result.mobileVersionCode % 2, 1);
  assert.equal(result.wearVersionCode, result.mobileVersionCode + 1);
  assert.ok(result.mobileVersionCode > context.manifest.android.wear.version_code);
  assert.equal(fs.readFileSync(path.join(context.root, 'shared/release.json'), 'utf8'), before);
  context.git = () => JSON.stringify({ android: { mobile: { version_code: 101 }, wear: { version_code: 102 } } });
  await assert.rejects(prepareLocalNative(context, { bump: 'patch', dryRun: true }), /behind origin\/master/);
});

test('native preparation changes only native mirrors and needs no published or signed tag', async t => {
  const context = fixture(t);
  const paths = ['package.json', 'package-lock.json', 'backend/package.json', 'backend/package-lock.json',
    'mobile/package.json', 'mobile/app.json', 'mobile/eas.json', 'mobile/modules/wear-pairing/package.json',
    'mobile/modules/wear-pairing/android/build.gradle', 'wear/app/build.gradle.kts', 'shared/release.json',
    'shared/client-diagnostic-versions.json', 'docs/openapi/v1.yaml', 'packages/api-client/src/generated/v1.ts'];
  for (const file of paths) {
    fs.mkdirSync(path.dirname(path.join(context.root, file)), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, file), path.join(context.root, file));
  }
  const requirement = fs.readFileSync(path.join(context.root, 'shared/client-release.json'), 'utf8');
  const result = await prepareLocalNative(context, { bump: 'patch' });
  const updated = readJson(path.join(context.root, 'shared/release.json'));
  assert.equal(updated.android.mobile.version_name, result.version);
  assert.equal(updated.server.version, context.manifest.server.version);
  assert.equal(fs.readFileSync(path.join(context.root, 'shared/client-release.json'), 'utf8'), requirement);
});

test('native record checks runtime, channel, app instance, source ancestry, and native fingerprint', t => {
  const context = fixture(t);
  const built = record(context);
  assert.equal(verifyNativeRecord(context, built, 'production'), built);
  context.client.requiresServer = '>=0.37.1 <1.0.0';
  writeJson(path.join(context.root, 'shared/client-release.json'), context.client);
  assert.equal(verifyNativeRecord(context, built, 'production'), built);
  assert.throws(() => verifyNativeRecord(context, built, 'internal'), /does not match/);
  assert.throws(() => verifyNativeRecord(context, { ...built, repository: 'other/repo' }, 'production'), /does not match/);
  fs.appendFileSync(path.join(context.root, 'mobile/modules/module.ts'), 'native change');
  assert.throws(() => verifyNativeRecord(context, built, 'production'), /Native runtime inputs changed/);
});

test('native dry run neither builds nor authenticates', async t => {
  const context = fixture(t);
  const result = await releaseLocalNative(context, { profile: 'production', dryRun: true });
  assert.equal(result.upload, true);
  assert.equal(fs.existsSync(context.stateRoot), false);
});

test('native build records exact artifacts, reuses them, and refuses changed bytes or source', async t => {
  const context = fixture(t), options = nativeOptions(context), calls = [];
  context.run = (_binary,args,request) => {
    calls.push({ args, request });
    if (args.includes('build-prepared')) writeJson(path.join(context.root, 'mobile/android/app/build/outputs/calibrate-ota-baseline.json'), baseline(context));
  };
  await releaseLocalNative(context, { profile: 'production', buildOnly: true }, options);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].request.env.CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD, undefined);
  assert.equal(calls[1].request.env.CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD, 'key-secret');
  await releaseLocalNative(context, { profile: 'production', buildOnly: true }, options);
  assert.equal(calls.length, 2);
  const original = options.verifyArtifacts;
  options.verifyArtifacts = () => ({ ...original(), signerSha256: 'e'.repeat(64) });
  await assert.rejects(releaseLocalNative(context, { profile: 'production', buildOnly: true }, options), /artifacts changed/);
  options.verifyArtifacts = original;
  context.sourceCommit = 'f'.repeat(40);
  await assert.rejects(releaseLocalNative(context, { profile: 'production', buildOnly: true }, options), /already built/);
});

function otaFixture(t) {
  const context = fixture(t);
  context.environment.EXPO_TOKEN = 'expo-secret';
  writeJson(nativeRecordFile(context, 'production'), record(context));
  const calls = [];
  context.run = (_binary,args,request) => {
    calls.push({ args, request });
    if (args.includes('env:pull')) fs.writeFileSync(args[args.indexOf('--path') + 1],
      'EXPO_PUBLIC_EAS_PROJECT_ID=' + projectId + '\nEXPO_UPDATES_CHANNEL=production\nEXPO_PUBLIC_CALIBRATE_SERVER_URL=' + serverUrl + '\nPRIVATE_KEY=never-export\n');
    if (args.includes('config')) return JSON.stringify({ name: 'calibrate', slug: 'calibrate-health-app', owner: 'calibrate-health', version: context.manifest.android.mobile.version_name,
      sdkVersion: '57.0.0', runtimeVersion: { policy: 'appVersion' }, android: { package: 'app.calibratehealth.mobile' },
      updates: { url: 'https://u.expo.dev/' + projectId, requestHeaders: { 'expo-channel-name': 'production' } }, extra: { eas: { projectId } } });
    if (args.includes('export')) {
      const directory = args[args.indexOf('--output-dir') + 1];
      fs.mkdirSync(path.join(directory, 'bundles'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'bundles/android.js'), 'exported bundle');
      writeJson(path.join(directory, 'metadata.json'), { version: 0, bundler: 'metro',
        fileMetadata: { android: { bundle: 'bundles/android.js', assets: [] } } });
    }
    if (args.includes('update')) return JSON.stringify([{ id: 'update-id', group: 'group-id' }]);
    return '';
  };
  return { context, calls };
}

test('OTA dry run checks a local baseline without credentials, exporting, or writing state', async t => {
  const { context,calls } = otaFixture(t);
  delete context.environment.EXPO_TOKEN;
  const result = await publishLocalOta(context, { channel: 'production', dryRun: true });
  assert.equal(result.runtimeVersion, context.manifest.android.mobile.version_name);
  assert.equal(result.requiresServer, context.client.requiresServer);
  assert.equal(calls.length, 0);
  assert.equal(fs.existsSync(path.join(context.stateRoot, 'ota')), false);
});

test('OTA publishes by channel, retains update IDs and requirement, and skips a completed retry', async t => {
  const { context,calls } = otaFixture(t);
  const manifestBefore = fs.readFileSync(path.join(context.root, 'shared/release.json'), 'utf8');
  const result = await publishLocalOta(context, { channel: 'production' });
  assert.equal(result.updates[0].id, 'update-id');
  assert.equal(result.requiresServer, context.client.requiresServer);
  assert.equal(calls.find(c => c.args.includes('export')).request.env.EXPO_TOKEN, undefined);
  assert.equal(calls.find(c => c.args.includes('update')).request.env.EXPO_TOKEN, 'expo-secret');
  assert.equal(calls.some(c => c.args.some(a => String(a).includes('readyz') || String(a).includes('client-config'))), false);
  assert.equal((await publishLocalOta(context, { channel: 'production' })).alreadyPublished, true);
  assert.equal(calls.filter(c => c.args.includes('update')).length, 1);
  assert.equal(fs.readFileSync(path.join(context.root, 'shared/release.json'), 'utf8'), manifestBefore);
});

test('OTA refuses incompatible native changes and uncertain publication retries', async t => {
  const { context,calls } = otaFixture(t);
  const run = context.run;
  context.run = (b,args,o) => { if (args.includes('update')) throw Error('connection lost'); return run(b,args,o); };
  await assert.rejects(publishLocalOta(context, { channel: 'production' }), /connection lost/);
  await assert.rejects(publishLocalOta(context, { channel: 'production' }), /outcome is uncertain/);
  assert.equal(calls.filter(c => c.args.includes('export')).length, 1);
  fs.appendFileSync(path.join(context.root, 'wear/app/native.kt'), 'change');
  await assert.rejects(publishLocalOta(context, { channel: 'production', dryRun: true }), /Native runtime inputs changed/);
});

test('local lock excludes concurrent publishing and clears on failure', async t => {
  const context = fixture(t);
  await assert.rejects(withReleaseLock(context, async () => {
    await assert.rejects(withReleaseLock(context, async () => {}), /Another release/);
    throw Error('failed');
  }), /failed/);
  await withReleaseLock(context, async () => {});
});

test('CLI exposes only client operations with bounded profiles and no source-SHA or deployment requirement', async () => {
  assert.equal(parseLocalReleaseArgs(['native']).profile, 'internal');
  assert.equal(parseLocalReleaseArgs(['ota', '--channel', 'production', '--dry-run']).dryRun, true);
  assert.throws(() => parseLocalReleaseArgs(['deploy']), /Expected native/);
  assert.throws(() => parseLocalReleaseArgs(['native', '--source-commit', sourceCommit]), /Unknown/);
  assert.throws(() => parseLocalReleaseArgs(['ota', '--channel', 'other']), /internal or production/);
  assert.throws(() => parseLocalReleaseArgs(['native-prepare']), /bump/);
  const calls = [];
  await executeLocalRelease({}, { operation: 'ota' }, { ota: () => calls.push('ota') });
  assert.deepEqual(calls, ['ota']);
});

test('production uploads the verified pair to Play internal with no server or tag-signing operation', async t => {
  const context = fixture(t), options = nativeOptions(context), events = [];
  context.run = (_binary,args) => {
    if (args.includes('build-prepared')) writeJson(path.join(context.root, 'mobile/android/app/build/outputs/calibrate-ota-baseline.json'), baseline(context));
  };
  options.resolveAccessToken = async () => { events.push('authenticate'); return 'token'; };
  const plan = createNativePlayReleasePlan({ root: context.root, sourceCommit });
  options.publisher = {
    createEdit: async () => 'edit',
    getTrack: async () => ({ releases: [] }),
    uploadBundle: async (_id,file) => {
      const candidate = Object.values(plan.candidates).find(value => path.resolve(context.root,value.artifactPath) === file);
      events.push(candidate.role);
      return { versionCode: candidate.versionCode, sha256: (candidate.role === 'phone' ? 'c' : 'd').repeat(64) };
    },
    updateTrack: async () => {},
    commitEdit: async () => events.push('commit'),
    deleteEdit: async () => {}
  };
  const result = await releaseLocalNative(context, { profile: 'production' }, options);
  assert.equal(result.uploadedToPlayInternal, true);
  assert.deepEqual(events, ['authenticate', 'phone', 'watch', 'commit']);
  assert.ok(readJson(nativeRecordFile(context,'production')).playInternal);
});
