import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveExpoUpdateBuildConfig, writeNativeOtaBaseline } from './native-ota-contract.mjs';
import {
  NATIVE_RELEASE_APPLICATION_ID,
  NATIVE_RELEASE_ARTIFACT_CONTRACTS
} from './native-release-evidence.mjs';

export const REQUIRED_SIGNING_ENV = Object.freeze([
  'CALIBRATE_ANDROID_SIGNING_STORE_FILE',
  'CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD',
  'CALIBRATE_ANDROID_SIGNING_KEY_ALIAS',
  'CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD'
]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

// Expo SDK 57 release lint can exceed the generated project's 512 MiB metaspace cap.
export const RELEASE_GRADLE_JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8';
export const NATIVE_RELEASE_BUILD_PROVENANCE_SCHEMA_VERSION = 1;
export const NATIVE_RELEASE_BUILD_PROVENANCE_PATH = 'build/native-release-provenance.json';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PROVENANCE_FIELDS = Object.freeze(['schemaVersion', 'sourceCommit', 'releaseManifest', 'artifacts']);
const PROVENANCE_MANIFEST_FIELDS = Object.freeze(['path', 'sha256']);
const PROVENANCE_ARTIFACT_FIELDS = Object.freeze([
  'id', 'role', 'format', 'path', 'sizeBytes', 'sha256', 'applicationId', 'versionName', 'versionCode'
]);

/** Sha256 using validated domain inputs. */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Build exact fields from the supplied domain inputs. */
function exactFields(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\n') === [...expected].sort().join('\n');
}

/** Release version using validated domain inputs. */
function releaseVersion(manifest, role) {
  const value = manifest?.android?.[role === 'phone' ? 'mobile' : 'wear'];
  return { versionName: value?.version_name, versionCode: value?.version_code };
}

/** Read native release build source. */
export function readNativeReleaseBuildSource(root = repositoryRoot, execute = execFileSync) {
  const git = (args) => execute('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).toString().trim();
  const sourceCommit = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  if (!COMMIT_PATTERN.test(sourceCommit)) {
    throw new Error('Native release build requires HEAD to resolve to a lowercase 40-character Git SHA.');
  }
  if (git(['status', '--porcelain=v1', '--untracked-files=normal'])) {
    throw new Error('Native release build requires a clean worktree and index before artifacts are created.');
  }
  return sourceCommit;
}

/** Build native release build provenance from validated configuration and dependencies. */
export function createNativeReleaseBuildProvenance(root, sourceCommit) {
  if (!COMMIT_PATTERN.test(sourceCommit ?? '')) {
    throw new Error('Native release build provenance requires a lowercase 40-character sourceCommit.');
  }
  const manifestContent = fs.readFileSync(path.join(root, 'shared', 'release.json'));
  const manifest = JSON.parse(manifestContent.toString('utf8'));
  if (manifest?.android?.application_id !== NATIVE_RELEASE_APPLICATION_ID) {
    throw new Error(`shared/release.json application_id must be ${NATIVE_RELEASE_APPLICATION_ID}.`);
  }
  const artifacts = NATIVE_RELEASE_ARTIFACT_CONTRACTS.map((contract) => {
    const file = path.resolve(root, contract.path);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      throw new Error(`${contract.id} release artifact is missing at ${contract.path}.`);
    }
    if (!stat.isFile()) throw new Error(`${contract.id} release artifact is not a file at ${contract.path}.`);
    const version = releaseVersion(manifest, contract.role);
    if (!version.versionName || !Number.isSafeInteger(version.versionCode) || version.versionCode < 1) {
      throw new Error(`shared/release.json must define a valid ${contract.role} version.`);
    }
    return {
      ...contract,
      sizeBytes: stat.size,
      sha256: sha256(fs.readFileSync(file)),
      applicationId: NATIVE_RELEASE_APPLICATION_ID,
      ...version
    };
  });
  return {
    schemaVersion: NATIVE_RELEASE_BUILD_PROVENANCE_SCHEMA_VERSION,
    sourceCommit,
    releaseManifest: { path: 'shared/release.json', sha256: sha256(manifestContent) },
    artifacts
  };
}

/** Validate native release build provenance. */
export function validateNativeReleaseBuildProvenance(provenance, options = {}) {
  const errors = [];
  if (!exactFields(provenance, PROVENANCE_FIELDS)) errors.push('Build provenance fields are invalid.');
  if (provenance?.schemaVersion !== NATIVE_RELEASE_BUILD_PROVENANCE_SCHEMA_VERSION) {
    errors.push(`Build provenance schemaVersion must be ${NATIVE_RELEASE_BUILD_PROVENANCE_SCHEMA_VERSION}.`);
  }
  if (!COMMIT_PATTERN.test(provenance?.sourceCommit ?? '')) errors.push('Build provenance sourceCommit is invalid.');
  if (options.candidateCommit && provenance?.sourceCommit !== options.candidateCommit) {
    errors.push('Build provenance sourceCommit does not match candidate C.');
  }
  if (!exactFields(provenance?.releaseManifest, PROVENANCE_MANIFEST_FIELDS) ||
      provenance?.releaseManifest?.path !== 'shared/release.json' ||
      !SHA256_PATTERN.test(provenance?.releaseManifest?.sha256 ?? '')) {
    errors.push('Build provenance release manifest record is invalid.');
  }
  if (options.manifestContent !== undefined &&
      provenance?.releaseManifest?.sha256 !== sha256(options.manifestContent)) {
    errors.push('Build provenance release manifest hash does not match candidate C.');
  }
  if (!Array.isArray(provenance?.artifacts) || provenance.artifacts.length !== NATIVE_RELEASE_ARTIFACT_CONTRACTS.length) {
    errors.push('Build provenance must contain exactly four artifact records.');
  } else {
    const actualById = new Map((options.artifacts ?? []).map((artifact) => [artifact.id, artifact]));
    const provenanceById = new Map(provenance.artifacts.map((artifact) => [artifact?.id, artifact]));
    if (provenanceById.size !== NATIVE_RELEASE_ARTIFACT_CONTRACTS.length) {
      errors.push('Build provenance artifact IDs must be unique.');
    }
    for (const contract of NATIVE_RELEASE_ARTIFACT_CONTRACTS) {
      const artifact = provenanceById.get(contract.id);
      const actual = actualById.get(contract.id);
      if (!exactFields(artifact, PROVENANCE_ARTIFACT_FIELDS)) {
        errors.push(`Build provenance ${contract.id} fields are invalid.`);
        continue;
      }
      for (const field of ['id', 'role', 'format', 'path']) {
        if (artifact[field] !== contract[field]) errors.push(`Build provenance ${contract.id} ${field} is invalid.`);
      }
      if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 1 ||
          !SHA256_PATTERN.test(artifact.sha256 ?? '') ||
          artifact.applicationId !== NATIVE_RELEASE_APPLICATION_ID ||
          !artifact.versionName || !Number.isSafeInteger(artifact.versionCode) || artifact.versionCode < 1) {
        errors.push(`Build provenance ${contract.id} identity is invalid.`);
      }
      if (actual) {
        for (const field of ['role', 'format', 'path', 'sizeBytes', 'sha256', 'applicationId', 'versionName', 'versionCode']) {
          if (artifact[field] !== actual[field]) {
            errors.push(`Build provenance ${contract.id} ${field} does not match the independently inspected artifact.`);
          }
        }
      } else if (options.artifacts) {
        errors.push(`Build provenance ${contract.id} has no independently inspected artifact.`);
      }
    }
  }
  return errors;
}

/** Read native release build provenance. */
export function readNativeReleaseBuildProvenance(root, options = {}) {
  const relativePath = NATIVE_RELEASE_BUILD_PROVENANCE_PATH;
  const file = path.resolve(root, relativePath);
  let provenance;
  try {
    provenance = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(
      `Native release build provenance is missing or invalid at ${relativePath}. ` +
      'Run npm run build:native:release from clean candidate C.'
    );
  }
  const errors = validateNativeReleaseBuildProvenance(provenance, options);
  if (errors.length) throw new Error(`Native release build provenance is invalid:\n- ${errors.join('\n- ')}`);
  return provenance;
}

/** Write native release build provenance. */
export function writeNativeReleaseBuildProvenance(root, provenance) {
  const errors = validateNativeReleaseBuildProvenance(provenance);
  if (errors.length) throw new Error(`Native release build provenance is invalid:\n- ${errors.join('\n- ')}`);
  const file = path.resolve(root, NATIVE_RELEASE_BUILD_PROVENANCE_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(provenance, null, 2)}\n`, { flag: 'wx' });
  return NATIVE_RELEASE_BUILD_PROVENANCE_PATH;
}

/** Resolve and validate the shared phone/watch release environment before Gradle can start. */
export function resolveNativeReleaseEnvironment(environment, options = {}) {
  const missing = REQUIRED_SIGNING_ENV.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Native release signing is incomplete. Missing: ${missing.join(', ')}`);
  }

  const storeFile = path.resolve(options.repositoryRoot ?? repositoryRoot, environment.CALIBRATE_ANDROID_SIGNING_STORE_FILE);
  const isFile = options.fileExists ?? ((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!isFile(storeFile)) {
    throw new Error('CALIBRATE_ANDROID_SIGNING_STORE_FILE does not point to a file.');
  }

  const configuredOrigin = environment.EXPO_PUBLIC_CALIBRATE_SERVER_URL?.trim() || 'https://calibratehealth.app';
  let serverUrl;
  try {
    serverUrl = new URL(configuredOrigin);
  } catch {
    throw new Error('EXPO_PUBLIC_CALIBRATE_SERVER_URL must be a credential-free HTTPS origin for release builds.');
  }
  if (serverUrl.protocol !== 'https:' || serverUrl.origin !== configuredOrigin) {
    throw new Error('EXPO_PUBLIC_CALIBRATE_SERVER_URL must be a credential-free HTTPS origin for release builds.');
  }

  let linkedProjectId = options.expoProjectId ?? null;
  try {
    const appConfig = JSON.parse(fs.readFileSync(path.join(
      options.repositoryRoot ?? repositoryRoot,
      'mobile',
      'app.json'
    ), 'utf8'));
    linkedProjectId ??= appConfig.expo?.extra?.eas?.projectId;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const updates = resolveExpoUpdateBuildConfig(environment, linkedProjectId);

  return {
    ...environment,
    CALIBRATE_ANDROID_SIGNING_STORE_FILE: storeFile,
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: serverUrl.origin,
    EXPO_PUBLIC_EAS_PROJECT_ID: updates.projectId ?? '',
    EXPO_UPDATES_CHANNEL: updates.channel,
    // Keep Metro rooted at the mobile app when the release build is launched from this workspace.
    EXPO_NO_METRO_WORKSPACE_ROOT: '1',
    NODE_ENV: 'production'
  };
}

export function nativeReleaseGradleCommands(platform = process.platform) {
  const wrapper = platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const common = [
    `-Dorg.gradle.jvmargs=${RELEASE_GRADLE_JVM_ARGS}`,
    '--no-daemon',
    '--console=plain'
  ];
  return [
    {
      label: 'phone',
      cwd: path.join(repositoryRoot, 'mobile', 'android'),
      command: wrapper,
      args: [':app:bundleRelease', ':app:assembleRelease', ...common]
    },
    {
      label: 'wear',
      cwd: path.join(repositoryRoot, 'wear'),
      command: wrapper,
      args: [':app:bundleRelease', ':app:assembleRelease', ...common]
    }
  ];
}

export function nativeReleaseArtifactPaths(build) {
  const outputRoot = path.join(build.cwd, 'app', 'build', 'outputs');
  return [
    path.join(outputRoot, 'apk', 'release', 'app-release.apk'),
    path.join(outputRoot, 'bundle', 'release', 'app-release.aab')
  ];
}

/** Ensure a successful Gradle exit cannot reuse or conceal missing release outputs. */
export function prepareNativeReleaseArtifacts(build, removeFile = (file) => fs.rmSync(file, { force: true })) {
  for (const file of nativeReleaseArtifactPaths(build)) removeFile(file);
}

export function assertNativeReleaseArtifacts(build, fileExists = fs.existsSync) {
  const missing = nativeReleaseArtifactPaths(build).filter((file) => !fileExists(file));
  if (missing.length === 0) return;
  throw new Error(
    `${build.label} Gradle completed without producing the expected release artifacts:\n` +
    `${missing.map((file) => `  - ${file}`).join('\n')}\n` +
    `Review the earlier ${build.label} Gradle output for a masked daemon, lint, or memory failure.`
  );
}

export function nativeReleasePrebuildCommand(root = repositoryRoot) {
  return {
    label: 'phone prebuild',
    cwd: path.join(root, 'mobile'),
    command: process.execPath,
    args: [
      path.join(root, 'node_modules', 'expo', 'bin', 'cli'),
      'prebuild',
      '--platform',
      'android',
      '--clean',
      '--no-install'
    ]
  };
}

/** Run Gradle's wrapper jar directly on Windows so release arguments never pass through cmd.exe. */
export function nativeReleaseInvocation(build, args, environment, platform = process.platform) {
  if (platform !== 'win32') return { command: build.command, args };
  const javaExecutable = environment.JAVA_HOME?.trim()
    ? path.join(environment.JAVA_HOME, 'bin', 'java.exe')
    : 'java.exe';
  return {
    command: javaExecutable,
    args: [
      '-classpath',
      path.join(build.cwd, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
      'org.gradle.wrapper.GradleWrapperMain',
      ...args
    ]
  };
}

function run() {
  const provenanceFile = path.resolve(repositoryRoot, NATIVE_RELEASE_BUILD_PROVENANCE_PATH);
  fs.rmSync(provenanceFile, { force: true });
  const sourceCommit = readNativeReleaseBuildSource(repositoryRoot);
  const environment = resolveNativeReleaseEnvironment(process.env);
  const prebuild = nativeReleasePrebuildCommand();
  const prebuildResult = spawnSync(prebuild.command, prebuild.args, {
    cwd: prebuild.cwd,
    env: environment,
    stdio: 'inherit'
  });
  if (prebuildResult.error) throw prebuildResult.error;
  if (prebuildResult.status !== 0) process.exit(prebuildResult.status ?? 1);

  for (const build of nativeReleaseGradleCommands()) {
    if (!fs.existsSync(path.join(build.cwd, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'))) {
      throw new Error(`${build.label} Gradle wrapper is missing. Run a clean Android prebuild before release.`);
    }
    prepareNativeReleaseArtifacts(build);
    const args = build.label === 'wear'
      ? [`-PcalibrateWearServerUrl=${environment.EXPO_PUBLIC_CALIBRATE_SERVER_URL}`, ...build.args]
      : build.args;
    const invocation = nativeReleaseInvocation(build, args, environment);
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: build.cwd,
      env: environment,
      stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
    assertNativeReleaseArtifacts(build);
  }

  const otaBaseline = writeNativeOtaBaseline({ root: repositoryRoot, environment, commit: sourceCommit });
  if (otaBaseline) {
    console.log(`Recorded OTA compatibility baseline at ${otaBaseline.output}`);
  } else {
    console.log('Expo OTA is disabled for this build because EXPO_PUBLIC_EAS_PROJECT_ID was not set.');
  }
  const provenance = createNativeReleaseBuildProvenance(repositoryRoot, sourceCommit);
  const output = writeNativeReleaseBuildProvenance(repositoryRoot, provenance);
  console.log(`Recorded candidate-bound native release provenance at ${output}.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run();
}
