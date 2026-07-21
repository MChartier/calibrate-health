import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const EXPO_PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EXPO_UPDATE_CHANNEL_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
export const OTA_BASELINE_RELATIVE_PATH = path.join(
  'mobile',
  'android',
  'app',
  'build',
  'outputs',
  'calibrate-ota-baseline.json'
);

const NATIVE_INPUT_FILES = Object.freeze([
  'mobile/app.json',
  'mobile/app.config.js',
  'mobile/eas.json',
  'mobile/package.json',
  'mobile/assets/adaptive-icon.png',
  'mobile/assets/icon.png',
  'mobile/assets/notification-icon.png',
  'shared/release.json'
]);

const NATIVE_INPUT_DIRECTORIES = Object.freeze([
  'mobile/modules',
  'mobile/plugins',
  'wear'
]);

const GENERATED_DIRECTORY_NAMES = new Set(['.gradle', '.kotlin', '.cxx', 'build', 'node_modules']);

function normalizedRelativePath(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function filesUnder(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!GENERATED_DIRECTORY_NAMES.has(entry.name)) pending.push(path.join(current, entry.name));
      } else if (entry.isFile()) {
        files.push(path.join(current, entry.name));
      }
    }
  }
  return files;
}

function dependencyPackageKey(packages, currentKey, dependencyName) {
  let scope = currentKey;
  while (scope) {
    const nested = `${scope}/node_modules/${dependencyName}`;
    if (packages[nested]) return nested;
    const marker = scope.lastIndexOf('/node_modules/');
    if (marker < 0) break;
    scope = scope.slice(0, marker);
  }
  const rootKey = `node_modules/${dependencyName}`;
  return packages[rootKey] ? rootKey : null;
}

/** Select only the production dependency graph reachable from the mobile workspace. */
export function createMobileLockSnapshot(lock) {
  const packages = lock?.packages;
  if (!packages?.mobile) throw new Error('package-lock.json is missing the mobile workspace.');
  const selected = new Map();
  const pending = ['mobile'];
  while (pending.length > 0) {
    const key = pending.pop();
    if (selected.has(key)) continue;
    const entry = packages[key];
    if (!entry) throw new Error(`package-lock.json is missing ${key}.`);
    selected.set(key, entry);
    if (entry.link && entry.resolved && packages[entry.resolved]) pending.push(entry.resolved);
    const dependencies = {
      ...entry.dependencies,
      ...entry.optionalDependencies,
      ...entry.peerDependencies
    };
    for (const dependencyName of Object.keys(dependencies)) {
      const dependencyKey = dependencyPackageKey(packages, key, dependencyName);
      if (dependencyKey) pending.push(dependencyKey);
    }
  }
  return [...selected.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, value]);
}

/** Hash every tracked input that can change the Android or Wear native runtime. */
export function createNativeRuntimeFingerprint(root) {
  const files = [
    ...NATIVE_INPUT_FILES.map((file) => path.join(root, file)),
    ...NATIVE_INPUT_DIRECTORIES.flatMap((directory) => filesUnder(root, directory))
  ].sort((left, right) => normalizedRelativePath(root, left).localeCompare(normalizedRelativePath(root, right)));

  const missing = files.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new Error(`Native runtime input is missing: ${normalizedRelativePath(root, missing[0])}`);
  }

  const digest = crypto.createHash('sha256');
  for (const file of files) {
    const relative = normalizedRelativePath(root, file);
    digest.update(`${relative}\0${fs.statSync(file).size}\0`);
    digest.update(fs.readFileSync(file));
    digest.update('\0');
  }
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  digest.update('mobile-package-lock\0');
  digest.update(JSON.stringify(createMobileLockSnapshot(lock)));
  digest.update('\0');
  return {
    sha256: digest.digest('hex'),
    files: [
      ...files.map((file) => normalizedRelativePath(root, file)),
      'package-lock.json#mobile-production-graph'
    ]
  };
}

export function resolveExpoUpdateBuildConfig(environment, fallbackProjectId = null) {
  const projectId = environment.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || fallbackProjectId || null;
  const channel = environment.EXPO_UPDATES_CHANNEL?.trim() || 'internal';
  if (projectId !== null && !EXPO_PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID must be an Expo project UUID.');
  }
  if (!EXPO_UPDATE_CHANNEL_PATTERN.test(channel)) {
    throw new Error('EXPO_UPDATES_CHANNEL must contain only letters, numbers, dots, dashes, or underscores.');
  }
  return { projectId, channel };
}

export function writeNativeOtaBaseline({ root, environment, commit = null, createdAt = new Date().toISOString() }) {
  const { projectId, channel } = resolveExpoUpdateBuildConfig(environment);
  if (!projectId) return null;
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'app.json'), 'utf8'));
  const fingerprint = createNativeRuntimeFingerprint(root);
  const baseline = {
    schema_version: 1,
    commit,
    created_at: createdAt,
    platform: 'android',
    project_id: projectId,
    channel,
    runtime_version: appConfig.expo.version,
    server_url: environment.EXPO_PUBLIC_CALIBRATE_SERVER_URL,
    native_fingerprint_sha256: fingerprint.sha256,
    native_fingerprint_files: fingerprint.files
  };
  const output = path.join(root, OTA_BASELINE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(baseline, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { output, baseline };
}

export function readNativeOtaBaseline(root, baselinePath = null) {
  const file = baselinePath ? path.resolve(root, baselinePath) : path.join(root, OTA_BASELINE_RELATIVE_PATH);
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('OTA baseline is missing. Build and install an OTA-enabled release with release:native:devices first.');
    }
    throw new Error(`Unable to read OTA baseline: ${error.message}`);
  }
  if (baseline.schema_version !== 1 || baseline.platform !== 'android' ||
      !EXPO_PROJECT_ID_PATTERN.test(baseline.project_id ?? '') ||
      !EXPO_UPDATE_CHANNEL_PATTERN.test(baseline.channel ?? '') ||
      !/^[0-9a-f]{64}$/.test(baseline.native_fingerprint_sha256 ?? '')) {
    throw new Error('OTA baseline is invalid or unsupported. Rebuild the native release.');
  }
  return { file, baseline };
}
