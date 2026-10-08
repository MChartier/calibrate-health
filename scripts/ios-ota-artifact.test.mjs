import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEnvironmentArtifact } from './expo-ota-artifact.mjs';
import { createIosOtaArtifact, verifyIosOtaArtifact, createIosOtaPublisher } from './ios-ota-artifact.mjs';
import { hash, bytes } from './release-plan.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ios-ota-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const configuration = { profile: 'production', environment: 'production', channel: 'production',
    projectId: '11111111-1111-4111-8111-111111111111', serverUrl: 'https://synthetic.invalid' };
  const target = { source: 'a'.repeat(40), configuration, nativeFingerprint: hash('native inputs'), sdkVersion: '57.0.0', expoUpdatesVersion: '57.0.8' };
  const baseline = { source: 'b'.repeat(40), id: 'verified-build', kind: 'native', platform: 'ios',
    artifactSha256: hash('IPA'), input: target.nativeFingerprint, configuration: hash(configuration), profile: 'production', runtime: 'ios-1.2.3-11' };
  const raw = path.join(root, 'environment.env'), environmentArtifact = path.join(root, 'environment.json');
  fs.writeFileSync(raw, `EXPO_PUBLIC_CALIBRATE_SERVER_URL=${configuration.serverUrl}\nEXPO_PUBLIC_EAS_PROJECT_ID=${configuration.projectId}\nEXPO_UPDATES_CHANNEL=production\nPRIVATE_VALUE=must-not-leave\n`);
  createEnvironmentArtifact({ environmentFile: raw, outputFile: environmentArtifact, sourceCommit: target.source, ...configuration });
  const inputDir = path.join(root, 'export'), outputDir = path.join(root, 'artifact'); fs.mkdirSync(inputDir);
  fs.writeFileSync(path.join(inputDir, 'ios.js'), 'synthetic iOS application bundle');
  fs.writeFileSync(path.join(inputDir, 'metadata.json'), bytes({ version: 0, bundler: 'metro', fileMetadata: { ios: { bundle: 'ios.js', assets: [] } } }));
  const publicConfig = { sdkVersion: target.sdkVersion, ios: { bundleIdentifier: 'app.calibratehealth.mobile', runtimeVersion: baseline.runtime },
    extra: { eas: { projectId: configuration.projectId } }, updates: { url: `https://u.expo.dev/${configuration.projectId}`, requestHeaders: { 'expo-channel-name': 'production' } } };
  return { root, inputDir, outputDir, publicConfig, environmentArtifact, target, baseline };
}
test('iOS OTA packaging and inert publisher bind exact runtime, config and export bytes', t => {
  const f = fixture(t), artifact = createIosOtaArtifact(f);
  const verified = verifyIosOtaArtifact({ artifactRoot: f.outputDir, target: f.target, baseline: f.baseline });
  assert.deepEqual(verified, artifact);
  const publisher = createIosOtaPublisher({ outputDir: path.join(f.root, 'publisher'), artifactRoot: f.outputDir,
    target: f.target, baseline: f.baseline });
  assert(publisher.args.includes('--skip-bundler')); assert(publisher.args.includes('ios'));
  assert(!fs.readFileSync(path.join(f.root, 'publisher', 'app.json'), 'utf8').includes('owner'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'publisher', 'package.json'))).dependencies['expo-updates'], f.target.expoUpdatesVersion);
  assert.throws(() => verifyIosOtaArtifact({ artifactRoot: f.outputDir, target: { ...f.target, expoUpdatesVersion: '57.0.9' }, baseline: f.baseline }), /binding changed/);
  fs.appendFileSync(path.join(f.outputDir, 'bundle', 'ios.js'), 'changed');
  assert.throws(() => verifyIosOtaArtifact({ artifactRoot: f.outputDir, target: f.target, baseline: f.baseline }), /bytes changed/);
});
test('iOS OTA rejects native/configuration drift and another exported platform', t => {
  const f = fixture(t);
  assert.throws(() => createIosOtaArtifact({ ...f, target: { ...f.target, nativeFingerprint: hash('changed native') } }), /incompatible/);
  assert.throws(() => createIosOtaArtifact({ ...f, baseline: { ...f.baseline, configuration: hash('wrong endpoint') } }), /incompatible/);
  fs.writeFileSync(path.join(f.inputDir, 'metadata.json'), bytes({ version: 0, bundler: 'metro', fileMetadata: { android: { bundle: 'ios.js', assets: [] } } }));
  assert.throws(() => createIosOtaArtifact(f), /exactly the iOS/);
});
