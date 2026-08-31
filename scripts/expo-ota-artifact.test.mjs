import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createEnvironmentArtifact,
  createEnvironmentPublisherProject,
  createUpdateArtifact,
  createUpdatePublisherProject,
  parseExpoOtaArtifactArgs,
  selectPublicEasEnvironment,
  verifyEnvironmentArtifact,
  verifyUpdateArtifact
} from './expo-ota-artifact.mjs';

const sourceCommit = 'a'.repeat(40);
const projectId = 'fda8f8c5-e646-47ac-82fb-35003c9cbec7';
const target = Object.freeze({
  sourceCommit,
  nativeBuildRef: 'native-v0.2.6',
  channel: 'internal',
  environment: 'preview',
  projectId
});

function createRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-expo-ota-artifact-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createEnvironmentFixture(root, values = {}) {
  const raw = path.join(root, 'raw.env');
  fs.writeFileSync(raw,
    `EXPO_PUBLIC_EAS_PROJECT_ID=${projectId}\n` +
    'EXPO_UPDATES_CHANNEL=internal\n' +
    'EXPO_PUBLIC_CALIBRATE_SERVER_URL=https://api.calibratehealth.app\n' +
    'PRIVATE_SIGNING_KEY=must-not-cross-the-job-boundary\n' +
    Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join('')
  );
  const artifact = path.join(root, 'environment.json');
  createEnvironmentArtifact({ environmentFile: raw, outputFile: artifact, ...target });
  return artifact;
}

function createExportFixture(root, metadataOverride = null) {
  const exportRoot = path.join(root, 'export');
  fs.mkdirSync(path.join(exportRoot, 'bundles'), { recursive: true });
  fs.mkdirSync(path.join(exportRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(exportRoot, 'bundles', 'android.js'), 'console.log("calibrate");\n');
  fs.writeFileSync(path.join(exportRoot, 'assets', 'icon'), 'png bytes');
  writeJson(path.join(exportRoot, 'metadata.json'), metadataOverride ?? {
    version: 0,
    bundler: 'metro',
    fileMetadata: {
      android: {
        bundle: 'bundles/android.js',
        assets: [{ path: path.join('assets', 'icon'), ext: 'png' }]
      }
    }
  });
  return exportRoot;
}

function createSourceMetadata(root) {
  const publicConfig = path.join(root, 'public-config.json');
  writeJson(publicConfig, {
    name: 'calibrate',
    slug: 'calibrate-health-app',
    owner: 'calibrate-health',
    version: '0.2.6',
    sdkVersion: '57.0.0',
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      url: `https://u.expo.dev/${projectId}`,
      requestHeaders: { 'expo-channel-name': 'internal' }
    },
    android: { package: 'app.calibratehealth.mobile' },
    extra: { eas: { projectId } }
  });
  const packageLock = path.join(root, 'package-lock.json');
  writeJson(packageLock, {
    lockfileVersion: 3,
    packages: {
      'node_modules/expo': { version: '57.0.7' },
      'node_modules/expo-updates': { version: '57.0.8' }
    }
  });
  return { publicConfig, packageLock };
}

function createCompleteUpdateFixture(t) {
  const root = createRoot(t);
  const environmentArtifact = createEnvironmentFixture(root);
  const inputDir = createExportFixture(root);
  const { publicConfig, packageLock } = createSourceMetadata(root);
  const artifactRoot = path.join(root, 'packaged');
  createUpdateArtifact({
    inputDir,
    outputDir: artifactRoot,
    publicConfigFile: publicConfig,
    packageLockFile: packageLock,
    environmentArtifactFile: environmentArtifact,
    ...target
  });
  return { root, environmentArtifact, artifactRoot };
}

test('OTA artifact CLI parses source-bound packaging options', () => {
  assert.deepEqual(parseExpoOtaArtifactArgs([
    'package-update',
    '--input-dir', 'dist',
    '--output-dir', 'artifact',
    '--source-commit', sourceCommit,
    '--native-build-ref', target.nativeBuildRef,
    '--channel', target.channel,
    '--environment', target.environment,
    '--project-id', projectId
  ]), {
    command: 'package-update',
    input: null,
    inputDir: 'dist',
    output: null,
    outputDir: 'artifact',
    artifactRoot: null,
    publicConfig: null,
    packageLock: null,
    environmentArtifact: null,
    sourceCommit,
    nativeBuildRef: target.nativeBuildRef,
    channel: target.channel,
    environment: target.environment,
    projectId,
    githubEnv: null,
    help: false
  });
  assert.throws(() => parseExpoOtaArtifactArgs(['verify-update', '--unknown']), /Unknown Expo OTA artifact option/);
});

test('environment handoff keeps only validated public Expo values', (t) => {
  const root = createRoot(t);
  const artifactFile = createEnvironmentFixture(root);
  const githubEnv = path.join(root, 'github.env');
  const artifact = verifyEnvironmentArtifact({ artifactFile, githubEnv, ...target });
  assert.deepEqual(Object.keys(artifact.values).sort(), [
    'EXPO_PUBLIC_CALIBRATE_SERVER_URL',
    'EXPO_PUBLIC_EAS_PROJECT_ID',
    'EXPO_UPDATES_CHANNEL'
  ]);
  assert.doesNotMatch(JSON.stringify(artifact), /PRIVATE_SIGNING_KEY|must-not-cross/);
  assert.equal(
    fs.readFileSync(githubEnv, 'utf8'),
    'EXPO_PUBLIC_CALIBRATE_SERVER_URL=https://api.calibratehealth.app\n' +
    `EXPO_PUBLIC_EAS_PROJECT_ID=${projectId}\n` +
    'EXPO_UPDATES_CHANNEL=internal\n'
  );
});

test('environment handoff rejects target drift and unsafe server URLs', (t) => {
  const root = createRoot(t);
  const artifactFile = createEnvironmentFixture(root);
  assert.throws(
    () => verifyEnvironmentArtifact({ artifactFile, ...target, channel: 'production' }),
    /does not match production/
  );
  assert.throws(
    () => selectPublicEasEnvironment({
      EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
      EXPO_UPDATES_CHANNEL: 'internal',
      EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://user:password@example.com'
    }, target),
    /credential-free HTTPS/
  );
});

test('pre-exported Android update is bound to exact provenance and every file hash', (t) => {
  const { artifactRoot } = createCompleteUpdateFixture(t);
  const provenance = verifyUpdateArtifact({ artifactRoot, ...target });
  assert.equal(provenance.appVersion, '0.2.6');
  assert.equal(provenance.sdkVersion, '57.0.0');
  assert.equal(provenance.expoVersion, '57.0.7');
  assert.equal(provenance.expoUpdatesVersion, '57.0.8');
  assert.match(provenance.bundleIntegrity, /^[0-9a-f]{64}$/);
  assert.deepEqual(provenance.files.map(({ path: file }) => file), [
    'assets/icon',
    'bundles/android.js',
    'metadata.json'
  ]);
  assert.throws(
    () => verifyUpdateArtifact({ artifactRoot, ...target, sourceCommit: 'b'.repeat(40) }),
    /sourceCommit .* does not match/
  );
});

test('update packager rejects an app version outside the installed native tag', (t) => {
  const root = createRoot(t);
  const environmentArtifact = createEnvironmentFixture(root);
  const inputDir = createExportFixture(root);
  const { publicConfig, packageLock } = createSourceMetadata(root);
  const config = JSON.parse(fs.readFileSync(publicConfig, 'utf8'));
  config.version = '0.2.7';
  writeJson(publicConfig, config);
  assert.throws(() => createUpdateArtifact({
    inputDir,
    outputDir: path.join(root, 'packaged'),
    publicConfigFile: publicConfig,
    packageLockFile: packageLock,
    environmentArtifactFile: environmentArtifact,
    ...target
  }), /does not match installed native release tag/);
});

test('update verification fails closed after bundle or provenance tampering', (t) => {
  const { artifactRoot } = createCompleteUpdateFixture(t);
  fs.appendFileSync(path.join(artifactRoot, 'bundle', 'bundles', 'android.js'), 'tampered\n');
  assert.throws(() => verifyUpdateArtifact({ artifactRoot, ...target }), /bundle file integrity/);

  const second = createCompleteUpdateFixture(t);
  const provenancePath = path.join(second.artifactRoot, 'provenance.json');
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  provenance.channel = 'production';
  fs.writeFileSync(provenancePath, JSON.stringify(provenance));
  assert.throws(() => verifyUpdateArtifact({ artifactRoot: second.artifactRoot, ...target }), /provenance integrity/);

  const third = createCompleteUpdateFixture(t);
  fs.writeFileSync(path.join(third.artifactRoot, 'unexpected-source.js'), 'do not execute');
  assert.throws(
    () => verifyUpdateArtifact({ artifactRoot: third.artifactRoot, ...target }),
    /must contain exactly bundle and provenance/
  );
});

test('update packager rejects path traversal metadata and symlinks', (t) => {
  const root = createRoot(t);
  const environmentArtifact = createEnvironmentFixture(root);
  const { publicConfig, packageLock } = createSourceMetadata(root);
  const traversalExport = createExportFixture(root, {
    version: 0,
    bundler: 'metro',
    fileMetadata: { android: { bundle: '../outside.js', assets: [] } }
  });
  assert.throws(() => createUpdateArtifact({
    inputDir: traversalExport,
    outputDir: path.join(root, 'traversal-artifact'),
    publicConfigFile: publicConfig,
    packageLockFile: packageLock,
    environmentArtifactFile: environmentArtifact,
    ...target
  }), /safe artifact-relative path/);

  const safeExport = createExportFixture(path.join(root, 'symlink-case'));
  try {
    fs.symlinkSync(path.join(safeExport, 'bundles', 'android.js'), path.join(safeExport, 'linked-bundle'));
  } catch (error) {
    if (error.code === 'EPERM') return;
    throw error;
  }
  assert.throws(() => createUpdateArtifact({
    inputDir: safeExport,
    outputDir: path.join(root, 'symlink-artifact'),
    publicConfigFile: publicConfig,
    packageLockFile: packageLock,
    environmentArtifactFile: environmentArtifact,
    ...target
  }), /may not contain symlink/);
});

test('clean publisher projects contain only fixed inert configuration', (t) => {
  const { root, artifactRoot } = createCompleteUpdateFixture(t);
  const environmentProject = path.join(root, 'environment-project');
  createEnvironmentPublisherProject({ outputDir: environmentProject, projectId });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(environmentProject, 'app.json'), 'utf8')), {
    expo: {
      name: 'calibrate',
      slug: 'calibrate-health-app',
      owner: 'calibrate-health',
      extra: { eas: { projectId } }
    }
  });

  const publisherProject = path.join(root, 'publisher-project');
  createUpdatePublisherProject({ outputDir: publisherProject, artifactRoot, ...target });
  const app = JSON.parse(fs.readFileSync(path.join(publisherProject, 'app.json'), 'utf8')).expo;
  const packageJson = JSON.parse(fs.readFileSync(path.join(publisherProject, 'package.json'), 'utf8'));
  assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
  assert.equal(app.version, '0.2.6');
  assert.equal(app.sdkVersion, '57.0.0');
  assert.equal(app.updates.requestHeaders['expo-channel-name'], 'internal');
  assert.equal(app.extra.eas.projectId, projectId);
  assert.deepEqual(packageJson.dependencies, { 'expo-updates': '57.0.8' });
  assert.equal(Object.hasOwn(app, 'plugins'), false);
  assert.equal(Object.hasOwn(packageJson, 'scripts'), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(publisherProject, 'eas.json'), 'utf8')), {
    cli: { version: '22.4.0' }
  });
});
