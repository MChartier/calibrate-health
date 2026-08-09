import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertNativeReleaseArtifacts,
  createNativeReleaseBuildProvenance,
  NATIVE_RELEASE_BUILD_PROVENANCE_PATH,
  nativeReleaseArtifactPaths,
  nativeReleaseGradleCommands,
  nativeReleaseInvocation,
  nativeReleasePrebuildCommand,
  prepareNativeReleaseArtifacts,
  readNativeReleaseBuildProvenance,
  readNativeReleaseBuildSource,
  RELEASE_GRADLE_JVM_ARGS,
  resolveNativeReleaseEnvironment,
  writeNativeReleaseBuildProvenance
} from './native-release-build.mjs';
import { NATIVE_RELEASE_ARTIFACT_CONTRACTS } from './native-release-evidence.mjs';

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

test('native release environment defaults to the official hosted service', () => {
  const resolved = resolveNativeReleaseEnvironment(signingEnvironment, {
    repositoryRoot: 'C:/repo',
    fileExists: () => true
  });

  assert.equal(resolved.EXPO_PUBLIC_CALIBRATE_SERVER_URL, 'https://calibratehealth.app');
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
      assert.ok(command.args.includes(`-Dorg.gradle.jvmargs=${RELEASE_GRADLE_JVM_ARGS}`));
    }
  }
});

test('native release builds require freshly generated APK and AAB outputs', () => {
  const build = { label: 'phone', cwd: 'C:/repo/mobile/android' };
  const artifacts = nativeReleaseArtifactPaths(build);
  assert.match(artifacts[0], /outputs[\\/]apk[\\/]release[\\/]app-release\.apk$/);
  assert.match(artifacts[1], /outputs[\\/]bundle[\\/]release[\\/]app-release\.aab$/);

  const removed = [];
  prepareNativeReleaseArtifacts(build, (file) => removed.push(file));
  assert.deepEqual(removed, artifacts);
  assert.doesNotThrow(() => assertNativeReleaseArtifacts(build, () => true));
  assert.throws(
    () => assertNativeReleaseArtifacts(build, (file) => file.endsWith('.apk')),
    /phone Gradle completed without producing.*app-release\.aab.*masked daemon, lint, or memory failure/s
  );
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
test('native release build provenance requires a clean commit-specific source', () => {
  const sourceCommit = 'a'.repeat(40);
  const cleanGit = (_command, args) => args[0] === 'rev-parse' ? `${sourceCommit}\n` : '';
  assert.equal(readNativeReleaseBuildSource('C:/repo', cleanGit), sourceCommit);
  assert.throws(
    () => readNativeReleaseBuildSource('C:/repo', (_command, args) =>
      args[0] === 'rev-parse' ? `${sourceCommit}\n` : ' M shared/release.json\n'
    ),
    /clean worktree and index/
  );
  assert.throws(
    () => readNativeReleaseBuildSource('C:/repo', (_command, args) =>
      args[0] === 'rev-parse' ? 'not-a-commit\n' : ''
    ),
    /lowercase 40-character Git SHA/
  );
});

test('candidate-bound sidecar records and revalidates all four artifact bytes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-native-provenance-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceCommit = 'a'.repeat(40);
  const manifest = {
    android: {
      application_id: 'app.calibratehealth.mobile',
      mobile: { version_name: '1.2.3', version_code: 12 },
      wear: { version_name: '1.2.4', version_code: 13 }
    }
  };
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  const manifestContent = `${JSON.stringify(manifest)}\n`;
  fs.writeFileSync(path.join(root, 'shared', 'release.json'), manifestContent);
  for (const contract of NATIVE_RELEASE_ARTIFACT_CONTRACTS) {
    const file = path.join(root, contract.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `candidate-bytes-${contract.id}`);
  }

  assert.throws(
    () => readNativeReleaseBuildProvenance(root, { candidateCommit: sourceCommit }),
    (error) => {
      assert.match(error.message, /missing or invalid at build\/native-release-provenance\.json/);
      assert.equal(error.message.includes(root), false);
      return true;
    }
  );
  const provenance = createNativeReleaseBuildProvenance(root, sourceCommit);
  assert.equal(provenance.sourceCommit, sourceCommit);
  assert.equal(provenance.artifacts.length, 4);
  assert.ok(provenance.artifacts.every((artifact) => !path.isAbsolute(artifact.path)));
  assert.equal(writeNativeReleaseBuildProvenance(root, provenance), NATIVE_RELEASE_BUILD_PROVENANCE_PATH);
  assert.equal(fs.existsSync(path.join(root, NATIVE_RELEASE_BUILD_PROVENANCE_PATH)), true);

  const inspected = provenance.artifacts.map((artifact) => ({
    ...artifact,
    signerSha256: 'f'.repeat(64)
  }));
  assert.deepEqual(
    readNativeReleaseBuildProvenance(root, {
      candidateCommit: sourceCommit,
      manifestContent,
      artifacts: inspected
    }),
    provenance
  );
  assert.throws(
    () => readNativeReleaseBuildProvenance(root, {
      candidateCommit: 'b'.repeat(40),
      manifestContent,
      artifacts: inspected
    }),
    /sourceCommit does not match candidate C/
  );
  const oldArtifacts = inspected.map((artifact) => artifact.id === 'phone-apk'
    ? { ...artifact, sha256: '0'.repeat(64) }
    : artifact);
  assert.throws(
    () => readNativeReleaseBuildProvenance(root, {
      candidateCommit: sourceCommit,
      manifestContent,
      artifacts: oldArtifacts
    }),
    /phone-apk sha256 does not match the independently inspected artifact/
  );
});
