import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
export const RELEASE_MANIFEST_PATH = path.join(REPOSITORY_ROOT, 'shared', 'release.json');

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const STABLE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const readOptionalFile = async (filePath) => {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const getPath = (value, dottedPath) => dottedPath.split('.').reduce((current, key) => current?.[key], value);

const parseSemver = (value) => {
  const match = value.match(SEMVER_PATTERN);
  if (!match) throw new Error(`Invalid semantic version: ${value}`);
  return {
    core: match.slice(1, 4),
    prerelease: match[4]?.split('.') ?? null
  };
};

const compareNumericIdentifier = (left, right) => {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

export const compareSemver = (left, right) => {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = compareNumericIdentifier(leftVersion.core[index], rightVersion.core[index]);
    if (difference !== 0) return difference;
  }

  if (leftVersion.prerelease === null) return rightVersion.prerelease === null ? 0 : 1;
  if (rightVersion.prerelease === null) return -1;
  const identifierCount = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) return compareNumericIdentifier(leftIdentifier, rightIdentifier);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
};

/** Return the production tag encoded by the canonical manifest and ensure it advances. */
export function getReleaseTag(manifest, latestTag = null) {
  const version = manifest?.server?.version;
  if (typeof version !== 'string' || !STABLE_SEMVER_PATTERN.test(version)) {
    throw new Error('Production release tags require a stable server.version in shared/release.json.');
  }
  if (latestTag !== null) {
    if (!/^v\d+\.\d+\.\d+$/.test(latestTag)) throw new Error(`Invalid latest release tag: ${latestTag}`);
    if (compareSemver(version, latestTag.slice(1)) <= 0) {
      throw new Error(`Manifest version ${version} must be newer than ${latestTag}.`);
    }
  }
  return `v${version}`;
}

/** Decide whether the reviewed manifest needs a new stable tag without treating an existing tag as an error. */
export function getReleasePlan(manifest, latestTag = null) {
  const newTag = getReleaseTag(manifest);
  if (latestTag === null) {
    return { latest_tag: '', new_tag: newTag, should_release: true };
  }
  if (!/^v\d+\.\d+\.\d+$/.test(latestTag)) throw new Error(`Invalid latest release tag: ${latestTag}`);

  const comparison = compareSemver(newTag.slice(1), latestTag.slice(1));
  if (comparison < 0) {
    throw new Error(`Manifest version ${newTag.slice(1)} cannot be older than ${latestTag}.`);
  }
  return {
    latest_tag: latestTag,
    new_tag: newTag,
    should_release: comparison > 0
  };
}

export function validateManifest(manifest) {
  const errors = [];
  const requiredSemvers = [
    'server.version',
    'android.mobile.version_name',
    'android.mobile.minimum_supported_version',
    'android.wear.version_name',
    'android.wear.minimum_supported_version'
  ];

  if (manifest?.schema_version !== 1) errors.push('schema_version must be 1.');
  for (const key of requiredSemvers) {
    const value = getPath(manifest, key);
    if (typeof value !== 'string' || !SEMVER_PATTERN.test(value)) {
      errors.push(`${key} must be a semantic version such as 1.2.3.`);
    }
  }

  for (const client of ['mobile', 'wear']) {
    const versionCode = getPath(manifest, `android.${client}.version_code`);
    if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
      errors.push(`android.${client}.version_code must be a positive integer.`);
    }
    const current = getPath(manifest, `android.${client}.version_name`);
    const minimum = getPath(manifest, `android.${client}.minimum_supported_version`);
    if (SEMVER_PATTERN.test(current ?? '') && SEMVER_PATTERN.test(minimum ?? '') && compareSemver(minimum, current) > 0) {
      errors.push(`android.${client}.minimum_supported_version cannot exceed its current version.`);
    }
  }

  const applicationId = manifest?.android?.application_id;
  if (typeof applicationId !== 'string' || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(applicationId)) {
    errors.push('android.application_id must be a valid lowercase Android application ID.');
  }

  const currentApi = manifest?.server?.api?.current;
  const supportedApis = manifest?.server?.api?.supported;
  if (typeof currentApi !== 'string' || !Array.isArray(supportedApis) || !supportedApis.includes(currentApi)) {
    errors.push('server.api.supported must include server.api.current.');
  }

  const requiredChannels = ['debug', 'internal', 'production'];
  for (const channel of requiredChannels) {
    if (!manifest?.android?.channels?.[channel]) errors.push(`android.channels.${channel} is required.`);
  }

  return errors;
}

const assertMatch = (errors, label, actual, expected) => {
  if (actual !== expected) errors.push(`${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`);
};

const capture = (source, pattern, label, errors) => {
  const match = source.match(pattern);
  if (!match) {
    errors.push(`Could not read ${label}.`);
    return null;
  }
  return match[1];
};

export async function checkRepository(root = REPOSITORY_ROOT) {
  const manifest = await readJson(path.join(root, 'shared', 'release.json'));
  const errors = validateManifest(manifest);
  const [rootPackage, backendPackage, mobilePackage, expoConfig, easConfig, mobileGradle, wearGradle, pairingGradle] = await Promise.all([
    readJson(path.join(root, 'package.json')),
    readJson(path.join(root, 'backend', 'package.json')),
    readJson(path.join(root, 'mobile', 'package.json')),
    readJson(path.join(root, 'mobile', 'app.json')),
    readJson(path.join(root, 'mobile', 'eas.json')),
    readOptionalFile(path.join(root, 'mobile', 'android', 'app', 'build.gradle')),
    readFile(path.join(root, 'wear', 'app', 'build.gradle.kts'), 'utf8'),
    readFile(path.join(root, 'mobile', 'modules', 'wear-pairing', 'android', 'build.gradle'), 'utf8')
  ]);

  assertMatch(errors, 'package.json version', rootPackage.version, manifest.server.version);
  assertMatch(errors, 'backend/package.json version', backendPackage.version, manifest.server.version);
  assertMatch(errors, 'mobile/package.json version', mobilePackage.version, manifest.android.mobile.version_name);
  assertMatch(errors, 'mobile/app.json expo.version', expoConfig.expo?.version, manifest.android.mobile.version_name);
  assertMatch(errors, 'mobile/app.json expo.android.versionCode', expoConfig.expo?.android?.versionCode, manifest.android.mobile.version_code);
  assertMatch(errors, 'mobile/app.json expo.android.package', expoConfig.expo?.android?.package, manifest.android.application_id);

  // Expo generates this ignored directory. Validate it when present without making a clean checkout depend on prebuild.
  if (mobileGradle !== null) {
    const mobileVersionCode = Number(capture(mobileGradle, /versionCode\s+(\d+)/, 'mobile native versionCode', errors));
    const mobileVersionName = capture(mobileGradle, /versionName\s+["']([^"']+)["']/, 'mobile native versionName', errors);
    const mobileApplicationId = capture(mobileGradle, /applicationId\s+["']([^"']+)["']/, 'mobile native applicationId', errors);
    assertMatch(errors, 'mobile native versionCode', mobileVersionCode, manifest.android.mobile.version_code);
    assertMatch(errors, 'mobile native versionName', mobileVersionName, manifest.android.mobile.version_name);
    assertMatch(errors, 'mobile native applicationId', mobileApplicationId, manifest.android.application_id);
  }

  const wearVersionCode = Number(capture(wearGradle, /versionCode\s*=\s*(\d+)/, 'Wear versionCode', errors));
  const wearVersionName = capture(wearGradle, /versionName\s*=\s*"([^"]+)"/, 'Wear versionName', errors);
  const wearApplicationId = capture(wearGradle, /applicationId\s*=\s*"([^"]+)"/, 'Wear applicationId', errors);
  assertMatch(errors, 'Wear versionCode', wearVersionCode, manifest.android.wear.version_code);
  assertMatch(errors, 'Wear versionName', wearVersionName, manifest.android.wear.version_name);
  assertMatch(errors, 'Wear applicationId', wearApplicationId, manifest.android.application_id);

  const pairingVersion = capture(pairingGradle, /^version\s*=\s*["']([^"']+)["']/m, 'Wear pairing module version', errors);
  const pairingVersionCode = Number(capture(pairingGradle, /versionCode\s+(\d+)/, 'Wear pairing module versionCode', errors));
  assertMatch(errors, 'Wear pairing module version', pairingVersion, manifest.android.mobile.version_name);
  assertMatch(errors, 'Wear pairing module versionCode', pairingVersionCode, manifest.android.mobile.version_code);

  for (const channel of ['internal', 'production']) {
    const profile = manifest.android.channels[channel].mobile_eas_profile;
    if (!easConfig.build?.[profile]) errors.push(`mobile/eas.json is missing the ${profile} profile for ${channel}.`);
  }

  return { manifest, errors };
}

const gitValue = (root, args, fallback = null) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
};

const artifactMetadata = async (root, artifact) => {
  const [label, rawPath] = artifact.includes('=') ? artifact.split(/=(.*)/s, 2) : [path.basename(artifact), artifact];
  const absolutePath = path.resolve(root, rawPath);
  const contents = await readFile(absolutePath);
  const fileStats = await stat(absolutePath);
  return {
    label,
    file_name: path.basename(absolutePath),
    bytes: fileStats.size,
    sha256: createHash('sha256').update(contents).digest('hex')
  };
};

export async function createReleaseMetadata({ manifest, channel, artifacts = [], root = REPOSITORY_ROOT, sourceDateEpoch = process.env.SOURCE_DATE_EPOCH }) {
  if (!manifest.android.channels[channel]) throw new Error(`Unknown release channel: ${channel}`);
  const commit = gitValue(root, ['rev-parse', 'HEAD']);
  const status = gitValue(root, ['status', '--porcelain'], '');
  const artifactRecords = await Promise.all([...artifacts].sort().map((artifact) => artifactMetadata(root, artifact)));
  const metadata = {
    schema_version: 1,
    channel,
    source: {
      git_commit: commit,
      git_dirty: Boolean(status)
    },
    server: manifest.server,
    android: {
      application_id: manifest.android.application_id,
      mobile: manifest.android.mobile,
      wear: manifest.android.wear
    },
    artifacts: artifactRecords
  };
  if (sourceDateEpoch !== undefined) {
    const epoch = Number(sourceDateEpoch);
    if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer.');
    metadata.source.source_date_epoch = epoch;
    metadata.generated_at = new Date(epoch * 1000).toISOString();
  }
  return metadata;
}

const parseArguments = (args) => {
  const result = { command: args[0] ?? 'check', channel: null, artifacts: [], latestTag: null };
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--channel') result.channel = args[++index];
    else if (args[index] === '--artifact') result.artifacts.push(args[++index]);
    else if (args[index] === '--latest-tag') result.latestTag = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return result;
};

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { manifest, errors } = await checkRepository();
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  if (options.command === 'check') {
    console.log('Release configuration is consistent.');
    return;
  }
  if (options.command === 'metadata') {
    if (!options.channel) throw new Error('metadata requires --channel debug, internal, or production.');
    console.log(`${JSON.stringify(await createReleaseMetadata({ manifest, channel: options.channel, artifacts: options.artifacts }), null, 2)}\n`);
    return;
  }
  if (options.command === 'tag') {
    console.log(getReleaseTag(manifest, options.latestTag));
    return;
  }
  if (options.command === 'plan') {
    const plan = getReleasePlan(manifest, options.latestTag);
    console.log(`latest_tag=${plan.latest_tag}`);
    console.log(`new_tag=${plan.new_tag}`);
    console.log(`should_release=${plan.should_release}`);
    return;
  }
  throw new Error(`Unknown command: ${options.command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
