import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkRepository,
  compareSemver,
  createReleaseMetadata,
  getReleasePlan,
  getReleaseTag,
  nextReleaseVersion,
  prepareServerRelease,
  validateClientDiagnosticVersionContract,
  validateManifest
} from './release-config.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseFixturePaths = [
  'package.json',
  'package-lock.json',
  'backend/package.json',
  'backend/package-lock.json',
  'mobile/package.json',
  'mobile/app.json',
  'mobile/eas.json',
  'mobile/modules/wear-pairing/android/build.gradle',
  'wear/app/build.gradle.kts',
  'shared/release.json',
  'shared/client-diagnostic-versions.json',
  'docs/openapi/v1.yaml',
  'packages/api-client/src/generated/v1.ts'
];

async function createReleaseFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'calibrate-release-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relativePath of releaseFixturePaths) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(repositoryRoot, relativePath), target);
  }
  return root;
}

const readFixtureJson = async (root, relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));

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

const validDiagnosticVersions = {
  schema_version: 1,
  previous_web_release: '1.2.2',
  supported_versions: {
    web: ['1.2.3', '1.2.2'],
    android_phone: ['2.0.0', '1.5.0'],
    wear_os: ['2.0.0', '1.0.0']
  }
};

const validDiagnosticOpenApi = `
- properties: { platform: { const: web }, version: { enum: [1.2.3, 1.2.2] } }
- properties: { platform: { const: android_phone }, version: { enum: [2.0.0, 1.5.0] } }
- properties: { platform: { const: wear_os }, version: { enum: [2.0.0, 1.0.0] } }
`;

test('semantic versions compare numerically', () => {
  assert.equal(compareSemver('1.10.0', '1.9.9'), 1);
  assert.equal(compareSemver('2.0.0-internal', '2.0.0'), -1);
  assert.equal(compareSemver('2.0.0-internal.10', '2.0.0-internal.2'), 1);
  assert.equal(compareSemver('999999999999999999999.0.0', '999999999999999999998.0.0'), 1);
  assert.equal(compareSemver('2.0.0+build.2', '2.0.0+build.1'), 0);
});

test('server release versions bump strict semantic components without numeric precision loss', () => {
  assert.equal(nextReleaseVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(nextReleaseVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(nextReleaseVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(nextReleaseVersion('999999999999999999999.2.3', 'major'), '1000000000000000000000.0.0');
  assert.throws(() => nextReleaseVersion('1.2.3', 'build'), /major, minor, or patch/);
  assert.throws(() => nextReleaseVersion('1.2.3-internal', 'patch'), /Invalid stable release version/);
});

test('diagnostics rollout versions must track the current release and exact OpenAPI enums', () => {
  assert.deepEqual(
    validateClientDiagnosticVersionContract(validManifest, validDiagnosticVersions, validDiagnosticOpenApi),
    []
  );

  const bumpedManifest = structuredClone(validManifest);
  bumpedManifest.server.version = '1.2.4';
  assert.match(
    validateClientDiagnosticVersionContract(bumpedManifest, validDiagnosticVersions, validDiagnosticOpenApi).join('\n'),
    /must start with the current release 1\.2\.4/
  );

  const missingImmediatePrior = structuredClone(validDiagnosticVersions);
  missingImmediatePrior.previous_web_release = '1.2.2';
  missingImmediatePrior.supported_versions.web = ['1.2.3', '1.2.1'];
  assert.match(
    validateClientDiagnosticVersionContract(validManifest, missingImmediatePrior, validDiagnosticOpenApi).join('\n'),
    /retain exactly the reviewed previous_web_release/
  );

  const staleOpenApi = validDiagnosticOpenApi.replace('[2.0.0, 1.5.0]', '[2.0.0]');
  assert.match(
    validateClientDiagnosticVersionContract(validManifest, validDiagnosticVersions, staleOpenApi).join('\n'),
    /OpenAPI client diagnostic android_phone versions do not match/
  );
});

test('diagnostics rollout versions stay bounded, unique, and within native support floors', () => {
  const invalid = structuredClone(validDiagnosticVersions);
  invalid.supported_versions.android_phone = ['2.0.0', '1.4.9', '1.4.9'];
  const errors = validateClientDiagnosticVersionContract(validManifest, invalid, validDiagnosticOpenApi).join('\n');
  assert.match(errors, /must be unique/);
  assert.match(errors, /outside the supported release range/);
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

for (const bump of ['patch', 'minor', 'major']) {
  test(`release preparation synchronizes every server/web mirror for a ${bump} bump`, async (t) => {
    const root = await createReleaseFixture(t);
    const manifestBefore = await readFixtureJson(root, 'shared/release.json');
    const currentVersion = manifestBefore.server.version;
    const expectedVersion = nextReleaseVersion(currentVersion, bump);
    const nativeBefore = manifestBefore.android;

    assert.equal(
      await prepareServerRelease({ root, bump, latestTag: `v${currentVersion}` }),
      expectedVersion
    );

    const manifest = await readFixtureJson(root, 'shared/release.json');
    const diagnostics = await readFixtureJson(root, 'shared/client-diagnostic-versions.json');
    const rootPackage = await readFixtureJson(root, 'package.json');
    const rootLock = await readFixtureJson(root, 'package-lock.json');
    const backendPackage = await readFixtureJson(root, 'backend/package.json');
    const backendLock = await readFixtureJson(root, 'backend/package-lock.json');
    const openApi = await readFile(path.join(root, 'docs/openapi/v1.yaml'), 'utf8');
    const generatedApi = await readFile(path.join(root, 'packages/api-client/src/generated/v1.ts'), 'utf8');

    assert.equal(manifest.server.version, expectedVersion);
    assert.deepEqual(manifest.android, nativeBefore);
    assert.equal(rootPackage.version, expectedVersion);
    assert.equal(rootLock.version, expectedVersion);
    assert.equal(rootLock.packages[''].version, expectedVersion);
    assert.equal(backendPackage.version, expectedVersion);
    assert.equal(backendLock.version, expectedVersion);
    assert.equal(backendLock.packages[''].version, expectedVersion);
    assert.equal(diagnostics.previous_web_release, currentVersion);
    assert.deepEqual(diagnostics.supported_versions.web, [expectedVersion, currentVersion]);
    assert.ok(openApi.includes(`version: { enum: [${expectedVersion}, ${currentVersion}]`));
    assert.ok(generatedApi.includes(`version?: "${expectedVersion}" | "${currentVersion}";`));
    assert.deepEqual((await checkRepository(root)).errors, []);
  });
}

test('release preparation rejects a pending manifest release without changing files', async (t) => {
  const root = await createReleaseFixture(t);
  const manifestPath = path.join(root, 'shared/release.json');
  const before = await readFile(manifestPath, 'utf8');
  const diagnostics = await readFixtureJson(root, 'shared/client-diagnostic-versions.json');

  await assert.rejects(
    prepareServerRelease({ root, bump: 'patch', latestTag: `v${diagnostics.previous_web_release}` }),
    /already ahead.*Publish the pending release/
  );
  assert.equal(await readFile(manifestPath, 'utf8'), before);
});

test('release preparation rejects stale mirrors before making any writes', async (t) => {
  const root = await createReleaseFixture(t);
  const lockPath = path.join(root, 'package-lock.json');
  const lock = await readFixtureJson(root, 'package-lock.json');
  lock.packages[''].version = '0.14.0';
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const manifestPath = path.join(root, 'shared/release.json');
  const currentVersion = (await readFixtureJson(root, 'shared/release.json')).server.version;
  const before = await readFile(manifestPath, 'utf8');

  await assert.rejects(
    prepareServerRelease({ root, bump: 'patch', latestTag: `v${currentVersion}` }),
    new RegExp(`root package version.*expected "${currentVersion.replaceAll('.', '\\.')}"`)
  );
  assert.equal(await readFile(manifestPath, 'utf8'), before);
});
