/** Verify retained OTA bytes and archive boundaries plus exact paired Play promotions. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import test from 'node:test';
import { packOtaArtifact, unpackOtaArtifact } from './expo-ota-store.mjs';
import { createEnvironmentArtifact, createUpdateArtifact } from './expo-ota-artifact.mjs';
import { publishOta } from './expo-ota-publish.mjs';
import { promoteEasPair } from './native-eas-promote.mjs';
import { ReleaseRecordStore } from './release-record.mjs';
import { readZipEntry } from './zip-entry.mjs';

/** Make a small real export fixture with the same provenance checks as production. */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-retention-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = { sourceCommit: 'a'.repeat(40), channel: 'internal', environment: 'preview', projectId: 'fda8f8c5-e646-47ac-82fb-35003c9cbec7' };
  /** Write an isolated test input without depending on application source. */
  const write = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value));
  fs.mkdirSync(path.join(root, 'export'));
  write('export/android.js', 'bundle content');
  write('export/metadata.json', { version: 0, bundler: 'metro', fileMetadata: { android: { bundle: 'android.js', assets: [] } } });
  write('config.json', { version: '0.2.8', sdkVersion: '57.0.0', runtimeVersion: { policy: 'fingerprint' },
    name: 'Calibrate', slug: 'calibrate-health-app', owner: 'calibrate-health', android: { package: 'net.darkmachines.healthtracker' },
    extra: { eas: { projectId: target.projectId } }, updates: { url: `https://u.expo.dev/${target.projectId}`, requestHeaders: { 'expo-channel-name': 'internal' } } });
  write('lock.json', { packages: { 'node_modules/expo': { version: '57.0.7' }, 'node_modules/expo-updates': { version: '57.0.8' } } });
  write('runtime.json', { runtimeVersion: 'b'.repeat(40) });
  fs.writeFileSync(path.join(root, 'public.env'), `EXPO_PUBLIC_EAS_PROJECT_ID=${target.projectId}\nEXPO_UPDATES_CHANNEL=internal\nEXPO_PUBLIC_CALIBRATE_SERVER_URL=https://api.calibratehealth.app\n`);
  createEnvironmentArtifact({ environmentFile: path.join(root, 'public.env'), outputFile: path.join(root, 'env.json'), ...target });
  const artifactRoot = path.join(root, 'artifact');
  const provenance = createUpdateArtifact({ ...target, inputDir: path.join(root, 'export'), outputDir: artifactRoot,
    publicConfigFile: path.join(root, 'config.json'), packageLockFile: path.join(root, 'lock.json'),
    runtimeFile: path.join(root, 'runtime.json'), environmentArtifactFile: path.join(root, 'env.json') });
  return { root, target, artifactRoot, provenance };
}

test('OTA retention restores exact verified bytes and rejects traversal, corruption, or target drift', (t) => {
  const { root, target, artifactRoot, provenance } = fixture(t);
  const archive = packOtaArtifact(artifactRoot, target);
  assert.deepEqual(unpackOtaArtifact(archive, path.join(root, 'restored'), target), provenance);
  assert.deepEqual(fs.readFileSync(path.join(root, 'restored/provenance.json')), fs.readFileSync(path.join(artifactRoot, 'provenance.json')),
    'GitHub attestation verification requires the exact original JSON bytes');
  assert.throws(() => unpackOtaArtifact(archive, path.join(root, 'wrong'), { ...target, sourceCommit: 'c'.repeat(40) }), /source/i);
  assert.throws(() => unpackOtaArtifact(gzipSync(JSON.stringify({ provenance: fs.readFileSync(path.join(artifactRoot, 'provenance.json')).toString('base64'),
    files: [{ path: '../outside', bytes: '' }] })), path.join(root, 'unsafe'), target), /Unsafe/);
  assert.equal(fs.existsSync(path.join(root, 'outside')), false);
});

test('OTA intent survives lost response and blocks a duplicate publication', async (t) => {
  const { target, artifactRoot } = fixture(t);
  const checkpoints = [];
  const store = { read: async () => ({ checkpoints }), checkpoint: async (_id, stage, value) => checkpoints.push({ stage, ...value, asset_id: checkpoints.length + 1 }) };
  let calls = 0;
  const args = { artifactRoot, target, toolRoot: '/tool', publisherRoot: '/publisher', releaseId: '1', store,
    execute: () => { calls++; throw new Error('lost response'); } };
  await assert.rejects(publishOta(args), /lost response/);
  await assert.rejects(publishOta(args), /unresolved/);
  assert.equal(calls, 1);
});

test('Release asset redirects never forward GitHub authentication to storage', async () => {
  let calls = 0;
  const store = new ReleaseRecordStore({ repository: 'owner/repo', token: 'private', request: async (url, options) => {
    calls++;
    if (calls === 1) return new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/exact' } });
    assert.equal(url, 'https://release-assets.githubusercontent.com/exact');
    assert.equal(options.headers, undefined);
    return new Response('asset');
  } });
  assert.equal((await store.api('/releases/assets/1', { raw: true })).toString(), 'asset');
});

test('Play promotion verifies both AAB hashes before editing either track', async () => {
  const metadata = { native: { phone_code: 13, wear_code: 14 }, artifacts: [{ id: 'phone-aab', sha256: 'a'.repeat(64) }, { id: 'wear-aab', sha256: 'b'.repeat(64) }] };
  const calls = [];
  const tracks = { qa: { track: 'qa', releases: [{ versionCodes: ['13'], status: 'completed' }] },
    'wear:qa': { track: 'wear:qa', releases: [{ versionCodes: ['14'], status: 'completed' }] } };
  const bundles = { bundles: [{ versionCode: 13, sha256: 'a'.repeat(64) }, { versionCode: 14, sha256: 'b'.repeat(64) }] };
  const publisher = { createEdit: async () => 'edit', deleteEdit: async () => {}, listBundles: async () => bundles,
    getTrack: async (_edit, track) => tracks[track] ?? { track, releases: [] },
    updateTrack: async (_edit, track, release) => { calls.push(track); tracks[track] = { track, releases: [release] }; }, commitEdit: async () => {} };
  bundles.bundles[1].sha256 = 'c'.repeat(64);
  await assert.rejects(promoteEasPair({ metadata, destination: 'closed', publisher }), /differs/);
  assert.equal(calls.length, 0);
  bundles.bundles[1].sha256 = 'b'.repeat(64);
  await promoteEasPair({ metadata, destination: 'closed', publisher });
  assert.deepEqual(calls, ['closed', 'wear:closed']);
  assert.equal((await promoteEasPair({ metadata, destination: 'closed', publisher })).alreadyComplete, true);
  assert.equal(calls.length, 2);
});

test('native runtime inspection reads one bounded APK/AAB fingerprint member', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-runtime-zip-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const name = Buffer.from('base/assets/fingerprint'), value = Buffer.from('a'.repeat(40));
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt32LE(value.length, 18); local.writeUInt32LE(value.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(value.length, 20); central.writeUInt32LE(value.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + value.length, 16);
  const file = path.join(root, 'app.aab');
  fs.writeFileSync(file, Buffer.concat([local, name, value, central, name, end]));
  assert.equal(readZipEntry(file, name.toString()).toString(), value.toString());
  assert.throws(() => readZipEntry(file, 'assets/fingerprint'), /Expected one ZIP member/);
  assert.throws(() => readZipEntry(file, name.toString(), 16), /Unsupported ZIP member/);
});
