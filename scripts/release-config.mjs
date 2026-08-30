import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
export const RELEASE_MANIFEST_PATH = path.join(REPOSITORY_ROOT, 'shared', 'release.json');
export const GOOGLE_PLAY_MAX_VERSION_CODE = 2_100_000_000;

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const STABLE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_BUMPS = new Set(['major', 'minor', 'patch']);

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const formatJson = (value, originalSource) => {
  const newline = originalSource.includes('\r\n') ? '\r\n' : '\n';
  const formatted = `${JSON.stringify(value, null, 2)}\n`;
  return newline === '\r\n' ? formatted.replaceAll('\n', '\r\n') : formatted;
};

const replaceExactlyOnce = (source, current, replacement, label) => {
  const firstIndex = source.indexOf(current);
  if (firstIndex < 0) throw new Error(`${label} does not contain the expected current release value.`);
  if (source.indexOf(current, firstIndex + current.length) >= 0) {
    throw new Error(`${label} contains the expected current release value more than once.`);
  }
  return `${source.slice(0, firstIndex)}${replacement}${source.slice(firstIndex + current.length)}`;
};

const replacePatternExactlyOnce = (source, pattern, replacement, label) => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  const matches = [...source.matchAll(globalPattern)];
  if (matches.length !== 1) {
    throw new Error(`${label} must contain exactly one matching release value; found ${matches.length}.`);
  }
  return source.replace(globalPattern, replacement);
};

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

/** Calculate the next strict stable release without losing precision. */
export function nextReleaseVersion(version, bump) {
  if (!STABLE_SEMVER_PATTERN.test(version)) throw new Error(`Invalid stable release version: ${version}`);
  if (!RELEASE_BUMPS.has(bump)) throw new Error('Release bump must be major, minor, or patch.');

  let [major, minor, patch] = version.split('.').map((part) => BigInt(part));
  if (bump === 'major') {
    major += 1n;
    minor = 0n;
    patch = 0n;
  } else if (bump === 'minor') {
    minor += 1n;
    patch = 0n;
  } else {
    patch += 1n;
  }
  return `${major}.${minor}.${patch}`;
}

const CLIENT_DIAGNOSTIC_PLATFORMS = ['web', 'android_phone', 'wear_os'];
const MAX_CLIENT_DIAGNOSTIC_VERSIONS_PER_PLATFORM = 16;

/** Keep the reviewed rollout window synchronized with current releases and the generated API source. */
export function validateClientDiagnosticVersionContract(manifest, diagnosticVersions, openApiSource) {
  const errors = [];
  const supported = diagnosticVersions?.supported_versions;
  const previousWebRelease = diagnosticVersions?.previous_web_release;
  if (diagnosticVersions?.schema_version !== 1) {
    errors.push('client-diagnostic-versions.json schema_version must be 1.');
  }
  if (typeof previousWebRelease !== 'string' || !STABLE_SEMVER_PATTERN.test(previousWebRelease)) {
    errors.push('client-diagnostic-versions.json previous_web_release must be a stable semantic version.');
  }
  if (!supported || typeof supported !== 'object' || Array.isArray(supported)) {
    return [...errors, 'client-diagnostic-versions.json supported_versions must be an object.'];
  }

  const keys = Object.keys(supported).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...CLIENT_DIAGNOSTIC_PLATFORMS].sort())) {
    errors.push('client-diagnostic-versions.json must define exactly web, android_phone, and wear_os.');
  }
  const currentVersions = {
    web: manifest?.server?.version,
    android_phone: manifest?.android?.mobile?.version_name,
    wear_os: manifest?.android?.wear?.version_name
  };
  const minimumVersions = {
    android_phone: manifest?.android?.mobile?.minimum_supported_version,
    wear_os: manifest?.android?.wear?.minimum_supported_version
  };

  for (const platform of CLIENT_DIAGNOSTIC_PLATFORMS) {
    const versions = supported[platform];
    if (!Array.isArray(versions) || versions.length === 0 || versions.length > MAX_CLIENT_DIAGNOSTIC_VERSIONS_PER_PLATFORM) {
      errors.push(`client diagnostic ${platform} versions must contain 1-${MAX_CLIENT_DIAGNOSTIC_VERSIONS_PER_PLATFORM} entries.`);
      continue;
    }
    if (versions.some((version) => typeof version !== 'string' || !STABLE_SEMVER_PATTERN.test(version))) {
      errors.push(`client diagnostic ${platform} versions must be stable semantic versions.`);
      continue;
    }
    if (new Set(versions).size !== versions.length) {
      errors.push(`client diagnostic ${platform} versions must be unique.`);
    }
    if (versions[0] !== currentVersions[platform]) {
      errors.push(`client diagnostic ${platform} versions must start with the current release ${currentVersions[platform]}.`);
    }
    if (platform === 'web' && (versions.length !== 2 || versions[1] !== previousWebRelease)) {
      errors.push('client diagnostic web versions must retain exactly the reviewed previous_web_release.');
    }
    const current = currentVersions[platform];
    if (platform === 'web' && typeof previousWebRelease === 'string'
      && STABLE_SEMVER_PATTERN.test(previousWebRelease)
      && typeof current === 'string' && STABLE_SEMVER_PATTERN.test(current)
      && compareSemver(previousWebRelease, current) >= 0) {
      errors.push('client diagnostic previous_web_release must be older than the current server release.');
    }
    const minimum = platform === 'web' ? null : minimumVersions[platform];
    if (typeof current === 'string' && STABLE_SEMVER_PATTERN.test(current)) {
      for (const version of versions) {
        if (compareSemver(version, current) > 0 || (minimum && compareSemver(version, minimum) < 0)) {
          errors.push(`client diagnostic ${platform} version ${version} is outside the supported release range.`);
        }
      }
    }
    const openApiLine = `- properties: { platform: { const: ${platform} }, version: { enum: [${versions.join(', ')}] } }`;
    if (typeof openApiSource !== 'string' || !openApiSource.includes(openApiLine)) {
      errors.push(`OpenAPI client diagnostic ${platform} versions do not match client-diagnostic-versions.json.`);
    }
  }

  return errors;
}

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
    } else if (versionCode > GOOGLE_PLAY_MAX_VERSION_CODE) {
      errors.push(`android.${client}.version_code cannot exceed Google Play's ${GOOGLE_PLAY_MAX_VERSION_CODE} limit.`);
    } else if (client === 'mobile' && versionCode % 2 !== 1) {
      errors.push('android.mobile.version_code must be odd so phone and Wear releases remain globally unique in Play.');
    } else if (client === 'wear' && versionCode % 2 !== 0) {
      errors.push('android.wear.version_code must be even so phone and Wear releases remain globally unique in Play.');
    }
    const current = getPath(manifest, `android.${client}.version_name`);
    const minimum = getPath(manifest, `android.${client}.minimum_supported_version`);
    if (SEMVER_PATTERN.test(current ?? '') && SEMVER_PATTERN.test(minimum ?? '') && compareSemver(minimum, current) > 0) {
      errors.push(`android.${client}.minimum_supported_version cannot exceed its current version.`);
    }
  }

  const mobileVersionCode = manifest?.android?.mobile?.version_code;
  const wearVersionCode = manifest?.android?.wear?.version_code;
  if (Number.isSafeInteger(mobileVersionCode) && mobileVersionCode === wearVersionCode) {
    errors.push('android mobile and Wear version_code values must be globally unique in Play.');
  }

  const nativeReleaseTag = manifest?.android?.mobile?.native_release_tag;
  const mobileVersionName = manifest?.android?.mobile?.version_name;
  if (typeof nativeReleaseTag !== 'string' || !/^native-v\d+\.\d+\.\d+$/.test(nativeReleaseTag)) {
    errors.push('android.mobile.native_release_tag must be a stable native-vMAJOR.MINOR.PATCH tag.');
  } else if (
    STABLE_SEMVER_PATTERN.test(mobileVersionName ?? '') &&
    nativeReleaseTag !== `native-v${mobileVersionName}`
  ) {
    errors.push('android.mobile.native_release_tag must match android.mobile.version_name.');
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
  const [
    rootPackage,
    rootPackageLock,
    backendPackage,
    backendPackageLock,
    mobilePackage,
    pairingPackage,
    expoConfig,
    easConfig,
    mobileGradle,
    wearGradle,
    pairingGradle,
    diagnosticVersions,
    openApiSource,
    generatedApiClientSource
  ] = await Promise.all([
    readJson(path.join(root, 'package.json')),
    readJson(path.join(root, 'package-lock.json')),
    readJson(path.join(root, 'backend', 'package.json')),
    readJson(path.join(root, 'backend', 'package-lock.json')),
    readJson(path.join(root, 'mobile', 'package.json')),
    readJson(path.join(root, 'mobile', 'modules', 'wear-pairing', 'package.json')),
    readJson(path.join(root, 'mobile', 'app.json')),
    readJson(path.join(root, 'mobile', 'eas.json')),
    readOptionalFile(path.join(root, 'mobile', 'android', 'app', 'build.gradle')),
    readFile(path.join(root, 'wear', 'app', 'build.gradle.kts'), 'utf8'),
    readFile(path.join(root, 'mobile', 'modules', 'wear-pairing', 'android', 'build.gradle'), 'utf8'),
    readJson(path.join(root, 'shared', 'client-diagnostic-versions.json')),
    readFile(path.join(root, 'docs', 'openapi', 'v1.yaml'), 'utf8'),
    readFile(path.join(root, 'packages', 'api-client', 'src', 'generated', 'v1.ts'), 'utf8')
  ]);
  errors.push(...validateClientDiagnosticVersionContract(manifest, diagnosticVersions, openApiSource));

  assertMatch(errors, 'package.json version', rootPackage.version, manifest.server.version);
  assertMatch(errors, 'package-lock.json version', rootPackageLock.version, manifest.server.version);
  assertMatch(errors, 'package-lock.json root package version', rootPackageLock.packages?.['']?.version, manifest.server.version);
  assertMatch(errors, 'backend/package.json version', backendPackage.version, manifest.server.version);
  assertMatch(errors, 'backend/package-lock.json version', backendPackageLock.version, manifest.server.version);
  assertMatch(
    errors,
    'backend/package-lock.json root package version',
    backendPackageLock.packages?.['']?.version,
    manifest.server.version
  );
  assertMatch(errors, 'mobile/package.json version', mobilePackage.version, manifest.android.mobile.version_name);
  assertMatch(
    errors,
    'package-lock.json mobile workspace version',
    rootPackageLock.packages?.mobile?.version,
    manifest.android.mobile.version_name
  );
  assertMatch(
    errors,
    'Wear pairing package version',
    pairingPackage.version,
    manifest.android.mobile.version_name
  );
  assertMatch(
    errors,
    'package-lock.json Wear pairing workspace version',
    rootPackageLock.packages?.['mobile/modules/wear-pairing']?.version,
    manifest.android.mobile.version_name
  );
  assertMatch(errors, 'mobile/app.json expo.version', expoConfig.expo?.version, manifest.android.mobile.version_name);
  assertMatch(errors, 'mobile/app.json expo.android.versionCode', expoConfig.expo?.android?.versionCode, manifest.android.mobile.version_code);
  assertMatch(errors, 'mobile/app.json expo.android.package', expoConfig.expo?.android?.package, manifest.android.application_id);
  assertMatch(
    errors,
    'mobile/app.json expo.extra.calibrate.nativeReleaseTag',
    expoConfig.expo?.extra?.calibrate?.nativeReleaseTag,
    manifest.android.mobile.native_release_tag
  );

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
    if (!easConfig.build?.[profile]) {
      errors.push(`mobile/eas.json is missing the ${profile} profile for ${channel}.`);
    } else {
      assertMatch(
        errors,
        `mobile/eas.json ${profile} update channel`,
        easConfig.build[profile].channel,
        channel
      );
    }
  }

  for (const diagnosticPlatform of CLIENT_DIAGNOSTIC_PLATFORMS) {
    const versions = diagnosticVersions?.supported_versions?.[diagnosticPlatform];
    if (Array.isArray(versions)) {
      const marker = `platform?: "${diagnosticPlatform}";`;
      const markerIndex = generatedApiClientSource.indexOf(marker);
      const nextMarkerIndex = generatedApiClientSource.indexOf('platform?: "', markerIndex + marker.length);
      const block = markerIndex < 0
        ? ''
        : generatedApiClientSource.slice(markerIndex, nextMarkerIndex < 0 ? undefined : nextMarkerIndex);
      const expectedVersions = `version?: "${versions.join('" | "')}";`;
      if (!block.includes(expectedVersions)) {
        errors.push(
          `Generated API client ${diagnosticPlatform} diagnostic versions do not match client-diagnostic-versions.json.`
        );
      }
    }
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

export function getLatestStableTag(root = REPOSITORY_ROOT) {
  const tags = gitValue(root, ['tag', '--list', '--sort=-v:refname'], '');
  return tags.split(/\r?\n/).find((tag) => /^v\d+\.\d+\.\d+$/.test(tag)) || null;
}

export function getLatestNativeReleaseTag(root = REPOSITORY_ROOT) {
  const tags = gitValue(root, ['tag', '--list', 'native-v*', '--sort=-v:refname'], '');
  return tags.split(/\r?\n/).find((tag) => /^native-v\d+\.\d+\.\d+$/.test(tag)) || null;
}

export function getNextNativeVersionCodes(manifest) {
  const currentCodes = [manifest?.android?.mobile?.version_code, manifest?.android?.wear?.version_code];
  if (currentCodes.some((code) => !Number.isSafeInteger(code) || code < 1)) {
    throw new Error('Native version codes must be positive safe integers before allocation.');
  }
  const currentMaximum = Math.max(...currentCodes);
  let mobileVersionCode = currentMaximum + 1;
  if (mobileVersionCode % 2 === 0) mobileVersionCode += 1;
  const wearVersionCode = mobileVersionCode + 1;
  if (wearVersionCode > GOOGLE_PLAY_MAX_VERSION_CODE) {
    throw new Error(`Native version codes cannot exceed Google Play's ${GOOGLE_PLAY_MAX_VERSION_CODE} limit.`);
  }
  return { mobileVersionCode, wearVersionCode };
}

/** Prepare every checked-in server/web release mirror and roll back the batch on validation failure. */
export async function prepareServerRelease({ root = REPOSITORY_ROOT, bump, latestTag = getLatestStableTag(root) }) {
  if (!RELEASE_BUMPS.has(bump)) throw new Error('Release bump must be major, minor, or patch.');
  if (latestTag === null) throw new Error('Cannot prepare a release without an existing stable release tag.');

  const beforeCheck = await checkRepository(root);
  if (beforeCheck.errors.length > 0) {
    throw new Error(`Release configuration is inconsistent before preparation:\n- ${beforeCheck.errors.join('\n- ')}`);
  }

  const currentVersion = beforeCheck.manifest.server.version;
  const currentPlan = getReleasePlan(beforeCheck.manifest, latestTag);
  if (currentPlan.should_release) {
    throw new Error(
      `Manifest version ${currentVersion} is already ahead of ${latestTag}. Publish the pending release before preparing another.`
    );
  }
  const nextVersion = nextReleaseVersion(currentVersion, bump);
  const files = {
    manifest: path.join(root, 'shared', 'release.json'),
    diagnostics: path.join(root, 'shared', 'client-diagnostic-versions.json'),
    rootPackage: path.join(root, 'package.json'),
    rootLock: path.join(root, 'package-lock.json'),
    backendPackage: path.join(root, 'backend', 'package.json'),
    backendLock: path.join(root, 'backend', 'package-lock.json'),
    openApi: path.join(root, 'docs', 'openapi', 'v1.yaml'),
    generatedApi: path.join(root, 'packages', 'api-client', 'src', 'generated', 'v1.ts')
  };
  const originals = Object.fromEntries(
    await Promise.all(Object.entries(files).map(async ([key, filePath]) => [key, await readFile(filePath, 'utf8')]))
  );
  const manifest = JSON.parse(originals.manifest);
  const diagnostics = JSON.parse(originals.diagnostics);
  const rootPackage = JSON.parse(originals.rootPackage);
  const rootLock = JSON.parse(originals.rootLock);
  const backendPackage = JSON.parse(originals.backendPackage);
  const backendLock = JSON.parse(originals.backendLock);
  const previousVersion = diagnostics.previous_web_release;

  manifest.server.version = nextVersion;
  diagnostics.previous_web_release = currentVersion;
  diagnostics.supported_versions.web = [nextVersion, currentVersion];
  rootPackage.version = nextVersion;
  rootLock.version = nextVersion;
  rootLock.packages[''].version = nextVersion;
  backendPackage.version = nextVersion;
  backendLock.version = nextVersion;
  backendLock.packages[''].version = nextVersion;

  const openApiCurrent = `- properties: { platform: { const: web }, version: { enum: [${currentVersion}, ${previousVersion}] } }`;
  const openApiNext = `- properties: { platform: { const: web }, version: { enum: [${nextVersion}, ${currentVersion}] } }`;
  const generatedCurrent = `version?: "${currentVersion}" | "${previousVersion}";`;
  const generatedNext = `version?: "${nextVersion}" | "${currentVersion}";`;
  const replacements = {
    manifest: formatJson(manifest, originals.manifest),
    diagnostics: formatJson(diagnostics, originals.diagnostics),
    rootPackage: formatJson(rootPackage, originals.rootPackage),
    rootLock: formatJson(rootLock, originals.rootLock),
    backendPackage: formatJson(backendPackage, originals.backendPackage),
    backendLock: formatJson(backendLock, originals.backendLock),
    openApi: replaceExactlyOnce(originals.openApi, openApiCurrent, openApiNext, 'docs/openapi/v1.yaml'),
    generatedApi: replaceExactlyOnce(
      originals.generatedApi,
      generatedCurrent,
      generatedNext,
      'packages/api-client/src/generated/v1.ts'
    )
  };

  const writtenKeys = [];
  try {
    for (const [key, filePath] of Object.entries(files)) {
      await writeFile(filePath, replacements[key]);
      writtenKeys.push(key);
    }
    const afterCheck = await checkRepository(root);
    if (afterCheck.errors.length > 0) {
      throw new Error(`Prepared release configuration is inconsistent:\n- ${afterCheck.errors.join('\n- ')}`);
    }
  } catch (error) {
    await Promise.all(writtenKeys.map((key) => writeFile(files[key], originals[key])));
    throw error;
  }
  return nextVersion;
}

/** Prepare a paired phone/Wear release and roll back every mirror if validation fails. */
export async function prepareNativeRelease({
  root = REPOSITORY_ROOT,
  bump,
  latestTag = getLatestNativeReleaseTag(root)
}) {
  if (!RELEASE_BUMPS.has(bump)) throw new Error('Release bump must be major, minor, or patch.');

  const beforeCheck = await checkRepository(root);
  if (beforeCheck.errors.length > 0) {
    throw new Error(`Release configuration is inconsistent before native preparation:\n- ${beforeCheck.errors.join('\n- ')}`);
  }

  const currentVersion = beforeCheck.manifest.android.mobile.version_name;
  const currentWearVersion = beforeCheck.manifest.android.wear.version_name;
  if (!STABLE_SEMVER_PATTERN.test(currentVersion) || currentWearVersion !== currentVersion) {
    throw new Error('Paired native preparation requires matching stable phone and Wear version names.');
  }
  const currentNativeTag = `native-v${currentVersion}`;
  if (latestTag === null) {
    throw new Error(`Cannot prepare another native release until ${currentNativeTag} has been tagged.`);
  }
  if (!/^native-v\d+\.\d+\.\d+$/.test(latestTag)) {
    throw new Error(`Invalid latest native release tag: ${latestTag}`);
  }
  if (latestTag !== currentNativeTag) {
    throw new Error(
      `Manifest native release ${currentNativeTag} must match the latest native tag ${latestTag} before preparation.`
    );
  }

  const nextVersion = nextReleaseVersion(currentVersion, bump);
  const nextNativeTag = `native-v${nextVersion}`;
  const { mobileVersionCode, wearVersionCode } = getNextNativeVersionCodes(beforeCheck.manifest);
  const optionalMobileGradlePath = path.join(root, 'mobile', 'android', 'app', 'build.gradle');
  const optionalMobileGradle = await readOptionalFile(optionalMobileGradlePath);
  const files = {
    manifest: path.join(root, 'shared', 'release.json'),
    diagnostics: path.join(root, 'shared', 'client-diagnostic-versions.json'),
    rootLock: path.join(root, 'package-lock.json'),
    mobilePackage: path.join(root, 'mobile', 'package.json'),
    mobileApp: path.join(root, 'mobile', 'app.json'),
    pairingPackage: path.join(root, 'mobile', 'modules', 'wear-pairing', 'package.json'),
    pairingGradle: path.join(root, 'mobile', 'modules', 'wear-pairing', 'android', 'build.gradle'),
    wearGradle: path.join(root, 'wear', 'app', 'build.gradle.kts'),
    openApi: path.join(root, 'docs', 'openapi', 'v1.yaml'),
    generatedApi: path.join(root, 'packages', 'api-client', 'src', 'generated', 'v1.ts')
  };
  if (optionalMobileGradle !== null) files.mobileGradle = optionalMobileGradlePath;

  const originals = Object.fromEntries(
    await Promise.all(Object.entries(files).map(async ([key, filePath]) => [key, await readFile(filePath, 'utf8')]))
  );
  const manifest = JSON.parse(originals.manifest);
  const diagnostics = JSON.parse(originals.diagnostics);
  const rootLock = JSON.parse(originals.rootLock);
  const mobilePackage = JSON.parse(originals.mobilePackage);
  const mobileApp = JSON.parse(originals.mobileApp);
  const pairingPackage = JSON.parse(originals.pairingPackage);
  const currentPhoneDiagnosticVersions = [...diagnostics.supported_versions.android_phone];
  const currentWearDiagnosticVersions = [...diagnostics.supported_versions.wear_os];
  const advanceDiagnosticVersions = (versions) =>
    [nextVersion, ...versions.filter((version) => version !== nextVersion)]
      .slice(0, MAX_CLIENT_DIAGNOSTIC_VERSIONS_PER_PLATFORM);

  manifest.android.mobile.version_name = nextVersion;
  manifest.android.mobile.version_code = mobileVersionCode;
  manifest.android.mobile.native_release_tag = nextNativeTag;
  manifest.android.wear.version_name = nextVersion;
  manifest.android.wear.version_code = wearVersionCode;
  diagnostics.supported_versions.android_phone = advanceDiagnosticVersions(currentPhoneDiagnosticVersions);
  diagnostics.supported_versions.wear_os = advanceDiagnosticVersions(currentWearDiagnosticVersions);
  rootLock.packages.mobile.version = nextVersion;
  rootLock.packages['mobile/modules/wear-pairing'].version = nextVersion;
  mobilePackage.version = nextVersion;
  mobileApp.expo.version = nextVersion;
  mobileApp.expo.android.versionCode = mobileVersionCode;
  mobileApp.expo.extra.calibrate.nativeReleaseTag = nextNativeTag;
  pairingPackage.version = nextVersion;

  let pairingGradle = replacePatternExactlyOnce(
    originals.pairingGradle,
    /^version\s*=\s*["'][^"']+["']/gm,
    `version = '${nextVersion}'`,
    'Wear pairing module version'
  );
  pairingGradle = replacePatternExactlyOnce(
    pairingGradle,
    /versionCode\s+\d+/g,
    `versionCode ${mobileVersionCode}`,
    'Wear pairing module versionCode'
  );
  pairingGradle = replacePatternExactlyOnce(
    pairingGradle,
    /versionName\s+["'][^"']+["']/g,
    `versionName '${nextVersion}'`,
    'Wear pairing module versionName'
  );
  let wearGradle = replacePatternExactlyOnce(
    originals.wearGradle,
    /versionCode\s*=\s*\d+/g,
    `versionCode = ${wearVersionCode}`,
    'Wear versionCode'
  );
  wearGradle = replacePatternExactlyOnce(
    wearGradle,
    /versionName\s*=\s*"[^"]+"/g,
    `versionName = "${nextVersion}"`,
    'Wear versionName'
  );

  const nextPhoneDiagnosticVersions = diagnostics.supported_versions.android_phone;
  const nextWearDiagnosticVersions = diagnostics.supported_versions.wear_os;
  const openApiLine = (platform, versions) =>
    `- properties: { platform: { const: ${platform} }, version: { enum: [${versions.join(', ')}] } }`;
  const generatedNewline = originals.generatedApi.includes('\r\n') ? '\r\n' : '\n';
  const generatedBlock = (platform, versions) => [
    `platform?: "${platform}";`,
    '            /** @enum {unknown} */',
    `            version?: "${versions.join('" | "')}";`
  ].join(generatedNewline);

  const replacements = {
    manifest: formatJson(manifest, originals.manifest),
    diagnostics: formatJson(diagnostics, originals.diagnostics),
    rootLock: formatJson(rootLock, originals.rootLock),
    mobilePackage: formatJson(mobilePackage, originals.mobilePackage),
    mobileApp: formatJson(mobileApp, originals.mobileApp),
    pairingPackage: formatJson(pairingPackage, originals.pairingPackage),
    pairingGradle,
    wearGradle,
    openApi: replaceExactlyOnce(
      replaceExactlyOnce(
        originals.openApi,
        openApiLine('android_phone', currentPhoneDiagnosticVersions),
        openApiLine('android_phone', nextPhoneDiagnosticVersions),
        'docs/openapi/v1.yaml android_phone versions'
      ),
      openApiLine('wear_os', currentWearDiagnosticVersions),
      openApiLine('wear_os', nextWearDiagnosticVersions),
      'docs/openapi/v1.yaml wear_os versions'
    ),
    generatedApi: replaceExactlyOnce(
      replaceExactlyOnce(
        originals.generatedApi,
        generatedBlock('android_phone', currentPhoneDiagnosticVersions),
        generatedBlock('android_phone', nextPhoneDiagnosticVersions),
        'generated API android_phone versions'
      ),
      generatedBlock('wear_os', currentWearDiagnosticVersions),
      generatedBlock('wear_os', nextWearDiagnosticVersions),
      'generated API wear_os versions'
    )
  };
  if (files.mobileGradle) {
    let mobileGradle = replacePatternExactlyOnce(
      originals.mobileGradle,
      /versionCode\s+\d+/g,
      `versionCode ${mobileVersionCode}`,
      'generated mobile versionCode'
    );
    mobileGradle = replacePatternExactlyOnce(
      mobileGradle,
      /versionName\s+["'][^"']+["']/g,
      `versionName "${nextVersion}"`,
      'generated mobile versionName'
    );
    replacements.mobileGradle = mobileGradle;
  }

  const writtenKeys = [];
  try {
    for (const [key, filePath] of Object.entries(files)) {
      writtenKeys.push(key);
      await writeFile(filePath, replacements[key]);
    }
    const afterCheck = await checkRepository(root);
    if (afterCheck.errors.length > 0) {
      throw new Error(`Prepared native release configuration is inconsistent:\n- ${afterCheck.errors.join('\n- ')}`);
    }
  } catch (error) {
    await Promise.all(writtenKeys.map((key) => writeFile(files[key], originals[key])));
    throw error;
  }

  return {
    version_name: nextVersion,
    mobile_version_code: mobileVersionCode,
    wear_version_code: wearVersionCode,
    native_release_tag: nextNativeTag
  };
}

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
  const result = { command: args[0] ?? 'check', channel: null, artifacts: [], latestTag: null, bump: null };
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--channel') result.channel = args[++index];
    else if (args[index] === '--artifact') result.artifacts.push(args[++index]);
    else if (args[index] === '--latest-tag') result.latestTag = args[++index];
    else if (args[index] === '--bump') result.bump = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return result;
};

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === 'prepare') {
    if (!options.bump) throw new Error('prepare requires --bump major, minor, or patch.');
    if (options.latestTag !== null) throw new Error('prepare reads the latest stable tag from Git; do not pass --latest-tag.');
    console.log(await prepareServerRelease({ bump: options.bump }));
    return;
  }
  if (options.command === 'prepare-native') {
    if (!options.bump) throw new Error('prepare-native requires --bump major, minor, or patch.');
    if (options.latestTag !== null) {
      throw new Error('prepare-native reads the latest native tag from Git; do not pass --latest-tag.');
    }
    console.log(`${JSON.stringify(await prepareNativeRelease({ bump: options.bump }), null, 2)}\n`);
    return;
  }
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
