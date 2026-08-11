/**
 * Runs the repository-owned native release evidence workflow.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NATIVE_RELEASE_EVIDENCE_SCHEMA_VERSION = 3;
export const NATIVE_RELEASE_OBSERVATION_SCHEMA_VERSION = 2;
export const NATIVE_RELEASE_BUILD_PROVENANCE_SCHEMA_VERSION = 1;
export const NATIVE_RELEASE_APPLICATION_ID = 'app.calibratehealth.mobile';
export const NATIVE_RELEASE_PROTOCOL = 'docs/physical-galaxy-validation.md';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

export const NATIVE_RELEASE_ARTIFACT_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'phone-apk',
    role: 'phone',
    format: 'apk',
    path: 'mobile/android/app/build/outputs/apk/release/app-release.apk'
  }),
  Object.freeze({
    id: 'phone-aab',
    role: 'phone',
    format: 'aab',
    path: 'mobile/android/app/build/outputs/bundle/release/app-release.aab'
  }),
  Object.freeze({
    id: 'watch-apk',
    role: 'watch',
    format: 'apk',
    path: 'wear/app/build/outputs/apk/release/app-release.apk'
  }),
  Object.freeze({
    id: 'watch-aab',
    role: 'watch',
    format: 'aab',
    path: 'wear/app/build/outputs/bundle/release/app-release.aab'
  })
]);

export const NATIVE_RELEASE_CHECKPOINT_GROUPS = Object.freeze({
  'android-physical-happy-path': Object.freeze([
    'phone-authentication',
    'phone-onboarding',
    'phone-today',
    'phone-food-create',
    'phone-food-edit',
    'phone-food-delete',
    'phone-food-undo',
    'phone-food-copy',
    'phone-barcode',
    'phone-weight',
    'phone-trend',
    'phone-notifications',
    'phone-health-connect',
    'phone-session-revocation-cleanup',
    'phone-account-deletion-cleanup',
    'phone-in-place-upgrade'
  ]),
  'android-physical-offline-reconnect': Object.freeze([
    'phone-offline-replay-once',
    'phone-offline-account-isolation',
    'phone-offline-server-isolation'
  ]),
  'wear-physical-happy-path': Object.freeze([
    'watch-pairing',
    'watch-snapshot',
    'watch-supported-handoffs',
    'watch-session-revocation-cleanup',
    'watch-account-deletion-cleanup',
    'watch-in-place-upgrade'
  ]),
  'wear-physical-offline-reconnect': Object.freeze([
    'watch-offline-replay-once',
    'watch-offline-recovery'
  ])
});

export const NATIVE_RELEASE_GATE_CHECKPOINTS = Object.freeze([
  'gate-native-release',
  'gate-android-emulator',
  'gate-wear-emulator',
  'gate-native-upgrade',
  'gate-ota'
]);

export const NATIVE_RELEASE_CHECKPOINTS = Object.freeze([
  ...new Set([
    ...Object.values(NATIVE_RELEASE_CHECKPOINT_GROUPS).flat(),
    ...NATIVE_RELEASE_GATE_CHECKPOINTS
  ])
].sort());

const GATE_COMMAND_IDS = Object.freeze({
  'gate-native-release': 'repo-test-native-release',
  'gate-android-emulator': 'repo-test-android-e2e',
  'gate-wear-emulator': 'repo-test-wear-emulator',
  'gate-native-upgrade': 'repo-test-native-upgrade',
  'gate-ota': 'repo-release-native-ota'
});

export const NATIVE_RELEASE_CHECKPOINT_DEFINITIONS = Object.freeze(Object.fromEntries(
  NATIVE_RELEASE_CHECKPOINTS.map((checkpoint) => {
    const capabilityId = Object.entries(NATIVE_RELEASE_CHECKPOINT_GROUPS)
      .find(([, checkpoints]) => checkpoints.includes(checkpoint))?.[0] ?? 'release-gates';
    return [checkpoint, Object.freeze({
      commandId: GATE_COMMAND_IDS[checkpoint] ?? `protocol-${checkpoint}`,
      capabilityId
    })];
  })
));

const RESULT_FIELDS = Object.freeze([
  'schemaVersion',
  'status',
  'owner',
  'executedOn',
  'sourceCommit',
  'protocol',
  'syntheticAccount',
  'buildProvenance',
  'releaseManifest',
  'artifacts',
  'devices',
  'upgrades',
  'checkpoints',
  'capabilities'
]);
const OBSERVATION_FIELDS = Object.freeze([
  'schemaVersion',
  'sourceCommit',
  'buildProvenance',
  'releaseManifest',
  'artifacts',
  'devices',
  'upgrades'
]);
const ARTIFACT_FIELDS = Object.freeze([
  'id',
  'role',
  'format',
  'path',
  'sizeBytes',
  'sha256',
  'applicationId',
  'versionName',
  'versionCode',
  'signerSha256'
]);
const DEVICE_FIELDS = Object.freeze([
  'role',
  'deviceClass',
  'manufacturer',
  'model',
  'osVersion',
  'apiLevel',
  'isPhysical',
  'isEmulator'
]);
const UPGRADE_FIELDS = Object.freeze([
  'explicitAdbTarget',
  'installMode',
  'uninstallPerformed',
  'dataCleared',
  'pre',
  'post'
]);
const INSTALL_STATE_FIELDS = Object.freeze([
  'versionName',
  'versionCode',
  'firstInstallTime',
  'signerSha256'
]);
const MANIFEST_FIELDS = Object.freeze(['path', 'sha256']);
const BUILD_PROVENANCE_FIELDS = Object.freeze(['schemaVersion', 'sourceCommit', 'releaseManifest', 'artifacts']);
const BUILD_PROVENANCE_ARTIFACT_FIELDS = Object.freeze([
  'id', 'role', 'format', 'path', 'sizeBytes', 'sha256', 'applicationId', 'versionName', 'versionCode'
]);
const CHECKPOINT_FIELDS = Object.freeze(['commandId', 'capabilityId', 'outcome']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Check whether the current state has exact fields. */
function hasExactFields(value, expected, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((field) => !actual.includes(field));
  const unexpected = actual.filter((field) => !wanted.includes(field));
  if (missing.length) errors.push(`${label} is missing fields: ${missing.join(', ')}.`);
  if (unexpected.length) errors.push(`${label} has unexpected fields: ${unexpected.join(', ')}.`);
  return missing.length === 0 && unexpected.length === 0;
}

/** Determine whether the input conforms to the non empty string contract. */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Normalize the repository path into the canonical representation used at this boundary. */
function normalizedRepositoryPath(value) {
  if (!isNonEmptyString(value) || path.isAbsolute(value)) return null;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').includes('..') || normalized.startsWith('/')) return null;
  return normalized;
}

/** Sha256 using validated domain inputs. */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Validate no serial fields. */
function validateNoSerialFields(value, label, errors) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (key.toLowerCase().includes('serial')) {
      errors.push(`${label} must not retain serial-like field ${key}.`);
    }
    if (nested && typeof nested === 'object') validateNoSerialFields(nested, label, errors);
  }
}

/** Release version using validated domain inputs. */
function releaseVersion(manifest, role) {
  const client = role === 'phone' ? 'mobile' : 'wear';
  const value = manifest?.android?.[client];
  return {
    versionName: value?.version_name,
    versionCode: value?.version_code
  };
}

/** Parse and validate keytool signer fingerprint. */
export function parseKeytoolSignerFingerprint(output) {
  const fingerprints = [...output.matchAll(/\bSHA256:\s*([0-9a-f:]{64,})/gi)]
    .map((match) => match[1].replaceAll(':', '').toLowerCase())
    .filter((fingerprint) => SHA256_PATTERN.test(fingerprint));
  const unique = [...new Set(fingerprints)];
  if (unique.length !== 1) {
    throw new Error('AAB must contain exactly one unique signing certificate SHA-256 fingerprint.');
  }
  return unique[0];
}

/** Build native release capabilities from the supplied domain inputs. */
export function deriveNativeReleaseCapabilities(checkpoints) {
  return Object.entries(NATIVE_RELEASE_CHECKPOINT_GROUPS)
    .filter(([, required]) => required.every((checkpoint) => checkpoints?.[checkpoint]?.outcome === true))
    .map(([capability]) => capability)
    .sort();
}

/** Validate checkpoints. */
function validateCheckpoints(checkpoints, errors) {
  if (!checkpoints || typeof checkpoints !== 'object' || Array.isArray(checkpoints)) {
    errors.push('Native release checkpoints must be an object.');
    return [];
  }
  const actual = Object.keys(checkpoints).sort();
  const missing = NATIVE_RELEASE_CHECKPOINTS.filter((checkpoint) => !(checkpoint in checkpoints));
  const unexpected = actual.filter((checkpoint) => !NATIVE_RELEASE_CHECKPOINTS.includes(checkpoint));
  if (missing.length) errors.push(`Native release checkpoints are missing: ${missing.join(', ')}.`);
  if (unexpected.length) errors.push(`Native release checkpoints are not allowlisted: ${unexpected.join(', ')}.`);
  for (const checkpoint of actual) {
    const record = checkpoints[checkpoint];
    const definition = NATIVE_RELEASE_CHECKPOINT_DEFINITIONS[checkpoint];
    hasExactFields(record, CHECKPOINT_FIELDS, `Native release checkpoint ${checkpoint}`, errors);
    if (record?.commandId !== definition?.commandId) {
      errors.push(`Native release checkpoint ${checkpoint} commandId must be ${definition?.commandId}.`);
    }
    if (record?.capabilityId !== definition?.capabilityId) {
      errors.push(`Native release checkpoint ${checkpoint} capabilityId must be ${definition?.capabilityId}.`);
    }
    if (typeof record?.outcome !== 'boolean') {
      errors.push(`Native release checkpoint ${checkpoint} outcome must be boolean.`);
    }
  }
  for (const gate of NATIVE_RELEASE_GATE_CHECKPOINTS) {
    if (checkpoints[gate]?.outcome !== true) errors.push(`Native release gate checkpoint ${gate} must pass.`);
  }
  return deriveNativeReleaseCapabilities(checkpoints);
}

/** Validate artifacts. */
function validateArtifacts(artifacts, manifest, errors) {
  if (!Array.isArray(artifacts) || artifacts.length !== NATIVE_RELEASE_ARTIFACT_CONTRACTS.length) {
    errors.push('Native release evidence must contain exactly four APK/AAB artifact records.');
    return { signerSha256: null, byRole: new Map() };
  }
  const byId = new Map();
  const byRole = new Map();
  for (const artifact of artifacts) {
    const label = `Artifact ${artifact?.id ?? 'unknown'}`;
    hasExactFields(artifact, ARTIFACT_FIELDS, label, errors);
    if (byId.has(artifact?.id)) errors.push(`Duplicate native release artifact id: ${artifact?.id}.`);
    byId.set(artifact?.id, artifact);
  }

  for (const contract of NATIVE_RELEASE_ARTIFACT_CONTRACTS) {
    const artifact = byId.get(contract.id);
    if (!artifact) {
      errors.push(`Missing native release artifact: ${contract.id}.`);
      continue;
    }
    const label = `Artifact ${contract.id}`;
    for (const field of ['role', 'format', 'path']) {
      if (artifact[field] !== contract[field]) {
        errors.push(`${label} ${field} must be ${contract[field]}.`);
      }
    }
    if (normalizedRepositoryPath(artifact.path) !== contract.path) {
      errors.push(`${label} path must be the canonical repository-relative output path.`);
    }
    if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 1) {
      errors.push(`${label} sizeBytes must be a positive integer.`);
    }
    if (!SHA256_PATTERN.test(artifact.sha256 ?? '')) errors.push(`${label} SHA-256 is invalid.`);
    if (!SHA256_PATTERN.test(artifact.signerSha256 ?? '')) errors.push(`${label} signer SHA-256 is invalid.`);

    const expectedVersion = releaseVersion(manifest, contract.role);
    const expectedApplicationId = manifest?.android?.application_id;
    if (artifact.applicationId !== expectedApplicationId || artifact.applicationId !== NATIVE_RELEASE_APPLICATION_ID) {
      errors.push(`${label} applicationId must match ${NATIVE_RELEASE_APPLICATION_ID}.`);
    }
    if (artifact.versionName !== expectedVersion.versionName) {
      errors.push(`${label} versionName does not match shared/release.json.`);
    }
    if (artifact.versionCode !== expectedVersion.versionCode) {
      errors.push(`${label} versionCode does not match shared/release.json.`);
    }
    const roleRows = byRole.get(contract.role) ?? [];
    roleRows.push(artifact);
    byRole.set(contract.role, roleRows);
  }

  const signers = new Set(artifacts.map((artifact) => artifact?.signerSha256));
  if (signers.size !== 1 || !SHA256_PATTERN.test([...signers][0] ?? '')) {
    errors.push('Phone and Wear APK/AAB artifacts must share one independently inspected signer SHA-256.');
  }
  return { signerSha256: signers.size === 1 ? [...signers][0] : null, byRole };
}

/** Validate build provenance. */
function validateBuildProvenance(provenance, sourceCommit, releaseManifest, artifacts, errors) {
  hasExactFields(provenance, BUILD_PROVENANCE_FIELDS, 'Native release build provenance', errors);
  if (provenance?.schemaVersion !== NATIVE_RELEASE_BUILD_PROVENANCE_SCHEMA_VERSION) {
    errors.push(`Native release build provenance schemaVersion must be ${NATIVE_RELEASE_BUILD_PROVENANCE_SCHEMA_VERSION}.`);
  }
  if (provenance?.sourceCommit !== sourceCommit || !COMMIT_PATTERN.test(provenance?.sourceCommit ?? '')) {
    errors.push('Native release build provenance sourceCommit must match candidate C.');
  }
  hasExactFields(provenance?.releaseManifest, MANIFEST_FIELDS, 'Build provenance release manifest', errors);
  if (
    provenance?.releaseManifest?.path !== releaseManifest?.path ||
    provenance?.releaseManifest?.sha256 !== releaseManifest?.sha256
  ) {
    errors.push('Native release build provenance manifest must match the retained candidate manifest.');
  }
  if (!Array.isArray(provenance?.artifacts) || provenance.artifacts.length !== NATIVE_RELEASE_ARTIFACT_CONTRACTS.length) {
    errors.push('Native release build provenance must contain exactly four artifact records.');
    return;
  }
  const retainedById = new Map((Array.isArray(artifacts) ? artifacts : []).map((artifact) => [artifact?.id, artifact]));
  const provenanceById = new Map(provenance.artifacts.map((artifact) => [artifact?.id, artifact]));
  if (provenanceById.size !== NATIVE_RELEASE_ARTIFACT_CONTRACTS.length) {
    errors.push('Native release build provenance artifact IDs must be unique.');
  }
  for (const contract of NATIVE_RELEASE_ARTIFACT_CONTRACTS) {
    const artifact = provenanceById.get(contract.id);
    const retained = retainedById.get(contract.id);
    const label = `Build provenance ${contract.id}`;
    hasExactFields(artifact, BUILD_PROVENANCE_ARTIFACT_FIELDS, label, errors);
    if (!artifact || !retained) {
      errors.push(`${label} must match a retained independently inspected artifact.`);
      continue;
    }
    for (const field of BUILD_PROVENANCE_ARTIFACT_FIELDS) {
      if (artifact[field] !== retained[field]) {
        errors.push(`${label} ${field} must match the retained independently inspected artifact.`);
      }
    }
  }
}

/** Validate devices. */
function validateDevices(devices, errors) {
  if (!Array.isArray(devices) || devices.length !== 2) {
    errors.push('Native release evidence must contain one phone and one watch device record.');
    return new Map();
  }
  const byRole = new Map();
  for (const device of devices) {
    const label = `Device ${device?.role ?? 'unknown'}`;
    hasExactFields(device, DEVICE_FIELDS, label, errors);
    if (!['phone', 'watch'].includes(device?.role)) errors.push(`${label} role is invalid.`);
    const expectedDeviceClass = device?.role === 'phone' ? 'handset' : 'watch';
    if (device?.deviceClass !== expectedDeviceClass) {
      errors.push(`${label} deviceClass must be ${expectedDeviceClass}.`);
    }
    if (byRole.has(device?.role)) errors.push(`Duplicate native release device role: ${device?.role}.`);
    byRole.set(device?.role, device);
    if (!/^samsung(?: electronics)?$/i.test(device?.manufacturer?.trim() ?? '')) {
      errors.push(`${label} must be manufactured by Samsung.`);
    }
    for (const field of ['model', 'osVersion']) {
      if (!isNonEmptyString(device?.[field])) errors.push(`${label} ${field} must be recorded.`);
    }
    if (!Number.isSafeInteger(device?.apiLevel) || device.apiLevel < 1) {
      errors.push(`${label} apiLevel must be a positive integer.`);
    }
    if (device?.isPhysical !== true || device?.isEmulator !== false) {
      errors.push(`${label} must be a physical, non-emulator Samsung target.`);
    }
  }
  for (const role of ['phone', 'watch']) {
    if (!byRole.has(role)) errors.push(`Missing native release ${role} device metadata.`);
  }
  return byRole;
}

/** Validate install state. */
function validateInstallState(state, label, errors) {
  hasExactFields(state, INSTALL_STATE_FIELDS, label, errors);
  if (!isNonEmptyString(state?.versionName)) errors.push(`${label} versionName must be recorded.`);
  if (!Number.isSafeInteger(state?.versionCode) || state.versionCode < 1) {
    errors.push(`${label} versionCode must be a positive integer.`);
  }
  if (!isNonEmptyString(state?.firstInstallTime)) errors.push(`${label} firstInstallTime must be recorded.`);
  if (!SHA256_PATTERN.test(state?.signerSha256 ?? '')) errors.push(`${label} signer SHA-256 is invalid.`);
}

/** Validate upgrades. */
function validateUpgrades(upgrades, artifactsByRole, sharedSigner, errors) {
  hasExactFields(upgrades, ['phone', 'watch'], 'Native release upgrades', errors);
  for (const role of ['phone', 'watch']) {
    const upgrade = upgrades?.[role];
    const label = `${role} upgrade evidence`;
    hasExactFields(upgrade, UPGRADE_FIELDS, label, errors);
    if (upgrade?.explicitAdbTarget !== true) errors.push(`${label} must use an explicit ADB target.`);
    if (upgrade?.installMode !== 'adb-install-r') errors.push(`${label} must use adb install -r only.`);
    if (upgrade?.uninstallPerformed !== false) errors.push(`${label} must not uninstall the app.`);
    if (upgrade?.dataCleared !== false) errors.push(`${label} must not clear app data.`);
    validateInstallState(upgrade?.pre, `${label} pre`, errors);
    validateInstallState(upgrade?.post, `${label} post`, errors);

    const apk = (artifactsByRole.get(role) ?? []).find((artifact) => artifact.format === 'apk');
    if (Number.isSafeInteger(upgrade?.pre?.versionCode) && Number.isSafeInteger(apk?.versionCode) &&
        upgrade.pre.versionCode >= apk.versionCode) {
      errors.push(`${label} pre-version must be strictly lower than the candidate.`);
    }
    if (upgrade?.post?.versionCode !== apk?.versionCode || upgrade?.post?.versionName !== apk?.versionName) {
      errors.push(`${label} post-version must equal the candidate APK version.`);
    }
    if (upgrade?.pre?.firstInstallTime !== upgrade?.post?.firstInstallTime) {
      errors.push(`${label} firstInstallTime must remain unchanged across the in-place upgrade.`);
    }
    if (
      upgrade?.pre?.signerSha256 !== sharedSigner ||
      upgrade?.post?.signerSha256 !== sharedSigner
    ) {
      errors.push(`${label} pre/candidate/post signers must match.`);
    }
  }
}

/** Parse and validate release manifest. */
function parseReleaseManifest(content, errors) {
  try {
    const manifest = JSON.parse(Buffer.isBuffer(content) ? content.toString('utf8') : content);
    if (manifest?.android?.application_id !== NATIVE_RELEASE_APPLICATION_ID) {
      errors.push(`shared/release.json application_id must be ${NATIVE_RELEASE_APPLICATION_ID}.`);
    }
    for (const role of ['phone', 'watch']) {
      const version = releaseVersion(manifest, role);
      if (!isNonEmptyString(version.versionName) || !Number.isSafeInteger(version.versionCode) || version.versionCode < 1) {
        errors.push(`shared/release.json must define a valid ${role} version.`);
      }
    }
    return manifest;
  } catch (error) {
    errors.push(`Candidate shared/release.json is invalid JSON: ${error instanceof Error ? error.message : error}.`);
    return null;
  }
}

/** Determine whether the input conforms to the exact calendar date contract. */
function isExactCalendarDate(value) {
  if (!DATE_PATTERN.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Validate a retained result without consulting devices or artifact files. */
export function validateNativeReleaseEvidence(result, options = {}) {
  const errors = [];
  hasExactFields(result, RESULT_FIELDS, 'Native release evidence', errors);
  validateNoSerialFields(result, 'Native release evidence', errors);
  if (result?.schemaVersion !== NATIVE_RELEASE_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`Native release evidence schemaVersion must be ${NATIVE_RELEASE_EVIDENCE_SCHEMA_VERSION}.`);
  }
  if (result?.status !== 'passed') errors.push('Native release evidence status must be passed.');
  if (!isNonEmptyString(result?.owner)) errors.push('Native release evidence must name an owner.');
  const executedAt = Date.parse(`${result?.executedOn}T00:00:00Z`);
  const now = options.now ?? new Date();
  if (!isExactCalendarDate(result?.executedOn) || Number.isNaN(executedAt)) {
    errors.push('Native release evidence executedOn must be a valid YYYY-MM-DD date.');
  } else if (executedAt > now.getTime()) {
    errors.push('Native release evidence executedOn cannot be in the future.');
  }
  if (!COMMIT_PATTERN.test(result?.sourceCommit ?? '')) {
    errors.push('Native release evidence sourceCommit must be a lowercase 40-character Git SHA.');
  }
  if (options.candidateCommit && result?.sourceCommit !== options.candidateCommit) {
    errors.push(`Native release evidence sourceCommit ${result?.sourceCommit} does not match candidate ${options.candidateCommit}.`);
  }
  if (result?.protocol !== NATIVE_RELEASE_PROTOCOL) {
    errors.push(`Native release evidence protocol must be ${NATIVE_RELEASE_PROTOCOL}.`);
  }
  if (result?.syntheticAccount !== true) errors.push('Native release evidence must use only a synthetic account.');

  hasExactFields(result?.releaseManifest, MANIFEST_FIELDS, 'Native release manifest provenance', errors);
  if (result?.releaseManifest?.path !== 'shared/release.json') {
    errors.push('Native release manifest path must be shared/release.json.');
  }
  if (!SHA256_PATTERN.test(result?.releaseManifest?.sha256 ?? '')) {
    errors.push('Native release manifest SHA-256 is invalid.');
  }
  if (options.manifestContent === undefined) {
    errors.push('Candidate shared/release.json content is required to validate native release evidence.');
  }
  const manifest = options.manifestContent === undefined
    ? null
    : parseReleaseManifest(options.manifestContent, errors);
  if (manifest && result?.releaseManifest?.sha256 !== sha256(options.manifestContent)) {
    errors.push('Native release manifest SHA-256 does not match candidate shared/release.json.');
  }

  const artifactResult = validateArtifacts(result?.artifacts, manifest, errors);
  validateBuildProvenance(
    result?.buildProvenance,
    result?.sourceCommit,
    result?.releaseManifest,
    result?.artifacts,
    errors
  );
  validateDevices(result?.devices, errors);
  validateUpgrades(result?.upgrades, artifactResult.byRole, artifactResult.signerSha256, errors);
  const derivedCapabilities = validateCheckpoints(result?.checkpoints, errors);
  const actualCapabilities = Array.isArray(result?.capabilities) ? [...result.capabilities].sort() : [];
  if (
    !Array.isArray(result?.capabilities) ||
    new Set(result.capabilities).size !== result.capabilities.length ||
    actualCapabilities.join('\n') !== derivedCapabilities.join('\n')
  ) {
    errors.push('Native release evidence capabilities must equal the capabilities derived from checkpoints.');
  }
  if (derivedCapabilities.length !== Object.keys(NATIVE_RELEASE_CHECKPOINT_GROUPS).length) {
    errors.push('Every physical phone/watch checkpoint group must pass before evidence can clear the release gate.');
  }

  return { errors, capabilities: derivedCapabilities, signerSha256: artifactResult.signerSha256 };
}

/** Validate the capture-only observation before operator checkpoints are attached. */
export function validateNativeReleaseObservation(observation, options = {}) {
  const candidate = {
    schemaVersion: NATIVE_RELEASE_EVIDENCE_SCHEMA_VERSION,
    status: 'passed',
    owner: 'capture-validation',
    executedOn: '2000-01-01',
    sourceCommit: observation?.sourceCommit,
    protocol: NATIVE_RELEASE_PROTOCOL,
    syntheticAccount: true,
    buildProvenance: observation?.buildProvenance,
    releaseManifest: observation?.releaseManifest,
    artifacts: observation?.artifacts,
    devices: observation?.devices,
    upgrades: observation?.upgrades,
    checkpoints: Object.fromEntries(Object.entries(NATIVE_RELEASE_CHECKPOINT_DEFINITIONS).map(
      ([checkpoint, definition]) => [checkpoint, { ...definition, outcome: true }]
    )),
    capabilities: Object.keys(NATIVE_RELEASE_CHECKPOINT_GROUPS).sort()
  };
  const result = validateNativeReleaseEvidence(candidate, options);
  if (observation?.schemaVersion !== NATIVE_RELEASE_OBSERVATION_SCHEMA_VERSION) {
    result.errors.unshift(
      `Native release observation schemaVersion must be ${NATIVE_RELEASE_OBSERVATION_SCHEMA_VERSION}.`
    );
  }
  hasExactFields(observation, OBSERVATION_FIELDS, 'Native release observation', result.errors);
  return result;
}

/** Build finalize native release evidence from the supplied domain inputs. */
export function finalizeNativeReleaseEvidence(observation, details, options = {}) {
  const observationResult = validateNativeReleaseObservation(observation, options);
  if (observationResult.errors.length) {
    throw new Error(`Native release observation is invalid:\n- ${observationResult.errors.join('\n- ')}`);
  }
  const result = {
    schemaVersion: NATIVE_RELEASE_EVIDENCE_SCHEMA_VERSION,
    status: 'passed',
    owner: details.owner,
    executedOn: details.executedOn,
    sourceCommit: observation.sourceCommit,
    protocol: NATIVE_RELEASE_PROTOCOL,
    syntheticAccount: details.syntheticAccount,
    buildProvenance: observation.buildProvenance,
    releaseManifest: observation.releaseManifest,
    artifacts: observation.artifacts,
    devices: observation.devices,
    upgrades: observation.upgrades,
    checkpoints: details.checkpoints,
    capabilities: deriveNativeReleaseCapabilities(details.checkpoints)
  };
  const validation = validateNativeReleaseEvidence(result, options);
  if (validation.errors.length) {
    throw new Error(`Native release evidence is invalid:\n- ${validation.errors.join('\n- ')}`);
  }
  return result;
}

/** A is supplied externally because a commit cannot truthfully contain its own SHA. */
export function validateEvidenceOnlyAttestation({
  sourceCommit,
  evidenceCommit,
  parentCommits,
  changedPaths,
  resultArtifacts,
  checkedOutCommit,
  worktreeStatus
}) {
  const errors = [];
  if (!COMMIT_PATTERN.test(sourceCommit ?? '')) errors.push('Evidence source commit must be a lowercase 40-character Git SHA.');
  if (!COMMIT_PATTERN.test(evidenceCommit ?? '')) errors.push('Evidence commit must be a lowercase 40-character Git SHA.');
  if (sourceCommit === evidenceCommit) errors.push('Evidence commit must be a child of the frozen source candidate, not the candidate itself.');
  if (!Array.isArray(parentCommits) || parentCommits.length !== 1 || parentCommits[0] !== sourceCommit) {
    errors.push('Evidence commit must have the frozen source candidate as its sole parent.');
  }
  if (checkedOutCommit !== evidenceCommit) {
    errors.push('Evidence verification requires checked-out HEAD to equal evidence commit A.');
  }
  if (typeof worktreeStatus !== 'string' || worktreeStatus.trim()) {
    errors.push('Evidence verification requires a clean worktree and index.');
  }

  const artifactPaths = Array.isArray(resultArtifacts) ? resultArtifacts : [];
  const approved = ['quality/risk-evidence.json', ...artifactPaths]
    .map(normalizedRepositoryPath);
  if (approved.some((value) => value === null) || artifactPaths.length === 0) {
    errors.push('Attestation result artifacts must be non-empty repository-relative paths.');
  }
  if (new Set(approved).size !== approved.length) errors.push('Attestation approved evidence paths must be unique.');
  const normalizedChanges = Array.isArray(changedPaths)
    ? changedPaths.map(normalizedRepositoryPath)
    : [];
  if (normalizedChanges.some((value) => value === null)) {
    errors.push('Evidence commit contains an invalid changed path.');
  }
  const unexpected = normalizedChanges.filter((value) => value && !approved.includes(value));
  if (unexpected.length) errors.push(`Evidence commit changes non-evidence paths: ${unexpected.join(', ')}.`);
  const missing = approved.filter((value) => value && !normalizedChanges.includes(value));
  if (missing.length) errors.push(`Evidence commit must change every approved evidence path: ${missing.join(', ')}.`);
  if (new Set(normalizedChanges).size !== normalizedChanges.length) {
    errors.push('Evidence commit changed-path list contains duplicates.');
  }
  return errors;
}

/** Run git and surface failures to the caller. */
function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

/** Read evidence git context. */
export function readEvidenceGitContext({
  root = repositoryRoot,
  sourceCommit,
  evidenceCommit,
  resultArtifacts
}) {
  if (!COMMIT_PATTERN.test(sourceCommit ?? '') || !COMMIT_PATTERN.test(evidenceCommit ?? '')) {
    throw new Error('Both --candidate and --evidence must be lowercase 40-character Git SHAs.');
  }
  const parentRow = runGit(root, ['rev-list', '--parents', '-n', '1', evidenceCommit]).trim().split(/\s+/);
  const checkedOutCommit = runGit(root, ['rev-parse', 'HEAD']).trim();
  const worktreeStatus = runGit(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  const changedPaths = runGit(root, ['diff', '--name-only', sourceCommit, evidenceCommit, '--'])
    .split(/\r?\n/)
    .filter(Boolean);
  const manifestContent = runGit(root, ['show', `${sourceCommit}:shared/release.json`]);
  const riskManifestContent = runGit(root, ['show', `${evidenceCommit}:quality/risk-evidence.json`]);
  const resultContents = Object.fromEntries(
    resultArtifacts.map((resultArtifact) => [
      resultArtifact,
      runGit(root, ['show', `${evidenceCommit}:${resultArtifact}`])
    ])
  );
  const errors = validateEvidenceOnlyAttestation({
    sourceCommit,
    evidenceCommit,
    parentCommits: parentRow.slice(1),
    changedPaths,
    resultArtifacts,
    checkedOutCommit,
    worktreeStatus
  });
  return {
    parentCommits: parentRow.slice(1),
    changedPaths,
    checkedOutCommit,
    worktreeStatus,
    manifestContent,
    riskManifestContent,
    resultContents,
    errors
  };
}

/** Build native release evidence result path from the supplied domain inputs. */
export function nativeReleaseEvidenceResultPath(value) {
  const normalized = normalizedRepositoryPath(value);
  if (!normalized || !/^quality\/physical-results\/[a-z0-9][a-z0-9._-]*\.json$/.test(normalized)) {
    throw new Error('Evidence result must be a repository-relative JSON path under quality/physical-results/.');
  }
  return normalized;
}

/** Build required option from the supplied domain inputs. */
function requiredOption(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

/** Parse and validate native release evidence args. */
export function parseNativeReleaseEvidenceArgs(argv) {
  const result = {
    command: argv[0] ?? null,
    result: null,
    candidate: null,
    evidence: null,
    observation: null,
    checkpoints: null,
    output: null,
    owner: null,
    executedOn: null,
    syntheticAccount: false,
    help: false
  };
  const start = result.command && !result.command.startsWith('--') ? 1 : 0;
  if (start === 0) result.command = null;
  for (let index = start; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') result.help = true;
    else if (option === '--synthetic-account') result.syntheticAccount = true;
    else if (option === '--result') result.result = requiredOption(argv, index++, option);
    else if (option === '--candidate') result.candidate = requiredOption(argv, index++, option);
    else if (option === '--evidence') result.evidence = requiredOption(argv, index++, option);
    else if (option === '--observation') result.observation = requiredOption(argv, index++, option);
    else if (option === '--checkpoints') result.checkpoints = requiredOption(argv, index++, option);
    else if (option === '--output') result.output = requiredOption(argv, index++, option);
    else if (option === '--owner') result.owner = requiredOption(argv, index++, option);
    else if (option === '--executed-on') result.executedOn = requiredOption(argv, index++, option);
    else throw new Error(`Unknown native release evidence option: ${option}`);
  }
  return result;
}

/** Build print help from the supplied domain inputs. */
function printHelp() {
  process.stdout.write(`Usage:
  node scripts/native-release-evidence.mjs finalize --observation <json> --checkpoints <json> --output <quality/physical-results/result.json> --owner <owner> --executed-on <YYYY-MM-DD> --synthetic-account
  node scripts/native-release-evidence.mjs verify --result <quality/physical-results/result.json> --candidate <C> --evidence <A>

The retained result names frozen source candidate C only. Verification supplies evidence-only child A externally.
`);
}

/** Read json. */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Run native release evidence cli and surface failures to the caller. */
export function runNativeReleaseEvidenceCli(argv = process.argv.slice(2), options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const args = parseNativeReleaseEvidenceArgs(argv);
  if (args.help || !args.command) {
    printHelp();
    return { help: true };
  }
  if (args.command === 'finalize') {
    for (const [name, value] of Object.entries({
      observation: args.observation,
      checkpoints: args.checkpoints,
      output: args.output,
      owner: args.owner,
      'executed-on': args.executedOn
    })) {
      if (!value) throw new Error(`finalize requires --${name}.`);
    }
    if (!args.syntheticAccount) throw new Error('finalize requires --synthetic-account.');
    const outputPath = nativeReleaseEvidenceResultPath(args.output);
    const absoluteOutput = path.resolve(root, outputPath);
    if (fs.existsSync(absoluteOutput)) throw new Error(`Evidence output already exists: ${outputPath}`);
    const manifestContent = fs.readFileSync(path.join(root, 'shared', 'release.json'));
    const evidence = finalizeNativeReleaseEvidence(
      readJson(path.resolve(root, args.observation)),
      {
        owner: args.owner,
        executedOn: args.executedOn,
        syntheticAccount: true,
        checkpoints: readJson(path.resolve(root, args.checkpoints))
      },
      { manifestContent }
    );
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
    fs.writeFileSync(absoluteOutput, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`Wrote native release evidence: ${outputPath}\n`);
    return { output: outputPath, evidence };
  }
  if (args.command === 'verify') {
    if (!args.result || !args.candidate || !args.evidence) {
      throw new Error('verify requires --result, --candidate C, and --evidence A.');
    }
    const resultPath = nativeReleaseEvidenceResultPath(args.result);
    const context = readEvidenceGitContext({
      root,
      sourceCommit: args.candidate,
      evidenceCommit: args.evidence,
      resultArtifacts: [resultPath]
    });
    const retained = JSON.parse(context.resultContents[resultPath]);
    const validation = validateNativeReleaseEvidence(retained, {
      candidateCommit: args.candidate,
      manifestContent: context.manifestContent
    });
    const errors = [...context.errors, ...validation.errors];
    if (errors.length) throw new Error(`Native release evidence is invalid:\n- ${errors.join('\n- ')}`);
    process.stdout.write(`Native release evidence is valid for candidate ${args.candidate} via ${args.evidence}.\n`);
    return { candidate: args.candidate, evidence: args.evidence, result: resultPath };
  }
  throw new Error(`Unknown native release evidence command: ${args.command}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runNativeReleaseEvidenceCli();
  } catch (error) {
    console.error(`[native-release-evidence] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
