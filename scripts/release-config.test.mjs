import assert from 'node:assert/strict';
import test from 'node:test';

import { compareSemver, createReleaseMetadata, getReleasePlan, getReleaseTag, validateManifest } from './release-config.mjs';

const validManifest = {
  schema_version: 1,
  server: { version: '1.2.3', api: { current: 'v1', supported: ['v1'] } },
  android: {
    application_id: 'app.calibratehealth.mobile',
    mobile: {
      version_name: '2.0.0',
      version_code: 20,
      native_release_tag: 'v1.2.3',
      minimum_supported_version: '1.5.0'
    },
    wear: { version_name: '2.0.0', version_code: 10, minimum_supported_version: '1.0.0' },
    channels: { debug: {}, internal: {}, production: {} }
  }
};

test('semantic versions compare numerically', () => {
  assert.equal(compareSemver('1.10.0', '1.9.9'), 1);
  assert.equal(compareSemver('2.0.0-internal', '2.0.0'), -1);
  assert.equal(compareSemver('2.0.0-internal.10', '2.0.0-internal.2'), 1);
  assert.equal(compareSemver('999999999999999999999.0.0', '999999999999999999998.0.0'), 1);
  assert.equal(compareSemver('2.0.0+build.2', '2.0.0+build.1'), 0);
});

test('manifest rejects malformed semantic versions', () => {
  const manifest = structuredClone(validManifest);
  manifest.android.mobile.version_name = '2.0.0-..';
  assert.match(validateManifest(manifest).join('\n'), /must be a semantic version/);
});

test('manifest rejects a minimum client version newer than the release', () => {
  const manifest = structuredClone(validManifest);
  manifest.android.wear.minimum_supported_version = '2.1.0';
  assert.match(validateManifest(manifest).join('\n'), /minimum_supported_version cannot exceed/);
});

test('manifest requires a stable native build tag', () => {
  const manifest = structuredClone(validManifest);
  manifest.android.mobile.native_release_tag = 'master';
  assert.match(validateManifest(manifest).join('\n'), /native_release_tag must be a stable/);
});

test('release metadata is deterministic when source date epoch is supplied', async () => {
  const first = await createReleaseMetadata({
    manifest: validManifest,
    channel: 'internal',
    root: process.cwd(),
    sourceDateEpoch: '1700000000'
  });
  const second = await createReleaseMetadata({
    manifest: validManifest,
    channel: 'internal',
    root: process.cwd(),
    sourceDateEpoch: '1700000000'
  });
  assert.deepEqual(first, second);
  assert.equal(first.generated_at, '2023-11-14T22:13:20.000Z');
});

test('release metadata rejects unknown channels', async () => {
  await assert.rejects(
    createReleaseMetadata({ manifest: validManifest, channel: 'nightly', root: process.cwd() }),
    /Unknown release channel/
  );
});

test('production tag comes from the manifest and must advance', () => {
  assert.equal(getReleaseTag(validManifest, 'v1.2.2'), 'v1.2.3');
  assert.throws(() => getReleaseTag(validManifest, 'v1.2.3'), /must be newer/);
  const prerelease = structuredClone(validManifest);
  prerelease.server.version = '1.2.4-internal';
  assert.throws(() => getReleaseTag(prerelease), /stable server.version/);
});

test('the v0.12 release advances the existing pre-1.0 tag sequence', () => {
  const manifest = structuredClone(validManifest);
  manifest.server.version = '0.12.0';
  assert.equal(getReleaseTag(manifest, 'v0.11.0'), 'v0.12.0');
});

test('automatic release planning publishes advances, skips an existing version, and rejects regressions', () => {
  assert.deepEqual(getReleasePlan(validManifest, 'v1.2.2'), {
    latest_tag: 'v1.2.2',
    new_tag: 'v1.2.3',
    should_release: true
  });
  assert.deepEqual(getReleasePlan(validManifest, 'v1.2.3'), {
    latest_tag: 'v1.2.3',
    new_tag: 'v1.2.3',
    should_release: false
  });
  assert.throws(() => getReleasePlan(validManifest, 'v1.2.4'), /cannot be older/);
});
