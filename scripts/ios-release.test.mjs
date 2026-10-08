import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextIosVersion, iosVersionDocuments, prepareIosVersion, iosBuildRequest, iosSubmitRequest, verifyIosArtifact } from './ios-release.mjs';
import { checkRepository, prepareLocalInternalNativeRelease } from './release-config.mjs';
import { hash } from './release-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'shared/ios-release.json')));
const files = ['shared/ios-release.json', 'mobile/app.json', 'shared/client-diagnostic-versions.json',
  'docs/openapi/v1.yaml', 'packages/api-client/src/generated/v1.ts'];
const original = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
const source = 'a'.repeat(40), buildId = '11111111-1111-4111-8111-111111111111';
const configuration = { profile: 'production', serverUrl: 'https://synthetic.invalid', projectId: buildId,
  environment: 'production', channel: 'production' };
test('iOS metadata advances once without rewriting Android or Wear counters and rejects extra allocation', () => {
  const next = nextIosVersion(version), documents = iosVersionDocuments(original, next);
  const before = JSON.parse(original['mobile/app.json']).expo, after = JSON.parse(documents['mobile/app.json']).expo;
  assert.deepEqual(after.android, before.android); assert.equal(after.version, before.version);
  assert.equal(after.ios.buildNumber, String(Number(before.ios.buildNumber) + 1));
  assert.deepEqual(JSON.parse(documents['shared/client-diagnostic-versions.json']).supported_versions.android_phone,
    JSON.parse(original['shared/client-diagnostic-versions.json']).supported_versions.android_phone);
  assert.throws(() => iosVersionDocuments(original, nextIosVersion(next)), /exact allocation/);
  assert.deepEqual(iosVersionDocuments(original, next), documents);
});
test('independent iOS and Android preparation retain consistent complete release mirrors', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ios-contract-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const paths = [...files, 'package.json', 'package-lock.json', 'backend/package.json', 'backend/package-lock.json',
    'mobile/package.json', 'mobile/eas.json', 'mobile/modules/wear-pairing/package.json',
    'mobile/modules/wear-pairing/android/build.gradle', 'wear/app/build.gradle.kts', 'shared/release.json'];
  for (const f of paths) { fs.mkdirSync(path.dirname(path.join(directory, f)), { recursive: true }); fs.copyFileSync(path.join(root, f), path.join(directory, f)); }
  const android = fs.readFileSync(path.join(directory, 'shared/release.json'), 'utf8');
  prepareIosVersion(directory);
  assert.deepEqual((await checkRepository(directory)).errors, []);
  assert.equal(fs.readFileSync(path.join(directory, 'shared/release.json'), 'utf8'), android);
  const ios = fs.readFileSync(path.join(directory, 'shared/ios-release.json'), 'utf8');
  const iosNumber = JSON.parse(fs.readFileSync(path.join(directory, 'mobile/app.json'))).expo.ios.buildNumber;
  await prepareLocalInternalNativeRelease({ root: directory, bump: 'patch' });
  assert.deepEqual((await checkRepository(directory)).errors, []);
  assert.equal(fs.readFileSync(path.join(directory, 'shared/ios-release.json'), 'utf8'), ios);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'mobile/app.json'))).expo.ios.buildNumber, iosNumber);
});
test('iOS build request freezes credentials and binds source/configuration without auto-submit', () => {
  const request = iosBuildRequest({ source, configuration, version, planDigest: hash('plan') });
  assert(request.args.includes('--freeze-credentials')); assert(!request.args.includes('--auto-submit'));
  assert(request.args.includes(`calibrate:${source}:${hash('plan')}`));
  assert.equal(request.environment.EXPO_PUBLIC_CALIBRATE_SERVER_URL, configuration.serverUrl);
  assert.equal(request.binding.runtime, `ios-${version.version}-${version.buildNumber}`);
});
test('IPA verification precedes exact build upload; upload does not claim processing or rollout', () => {
  const expected = { source, buildId, bundleIdentifier: 'app.calibratehealth.mobile', version: version.version,
    buildNumber: version.buildNumber, runtime: `ios-${version.version}-${version.buildNumber}`,
    projectId: configuration.projectId, channel: 'production', serverUrl: configuration.serverUrl,
    distribution: 'store', configuration: hash(configuration) };
  const observed = { ...expected, platform: 'ios', simulator: false, signed: true, entitlements: { 'get-task-allow': false }, artifactSha256: hash('ipa') };
  const receipt = verifyIosArtifact(observed, expected);
  const submit = iosSubmitRequest({ buildId, buildReceipt: receipt, appStoreConnectId: '123456' });
  assert(submit.args.includes(buildId)); assert(!submit.args.includes('--latest'));
  assert.equal(submit.binding.stage, 'upload');
  const attested = { ...receipt, schema: 1, kind: 'native', profile: 'production', planDigest: hash('plan') };
  delete attested.distribution;
  assert.deepEqual(iosSubmitRequest({ buildId, buildReceipt: attested, appStoreConnectId: '123456' }), submit);
  assert.throws(() => iosSubmitRequest({ buildId, buildReceipt: { ...attested, profile: 'internal' }, appStoreConnectId: '123456' }), /verified store/);
  for (const changed of [{ simulator: true }, { signed: false }, { distribution: 'internal' }, { runtime: 'other' },
    { projectId: 'other' }, { serverUrl: 'https://other.invalid' }, { buildNumber: '999' }]) {
    assert.throws(() => verifyIosArtifact({ ...observed, ...changed }, expected));
  }
  assert.throws(() => iosSubmitRequest({ buildId, buildReceipt: { ...receipt, distribution: 'internal' }, appStoreConnectId: '123456' }), /verified store/);
});
