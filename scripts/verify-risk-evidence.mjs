import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  NATIVE_RELEASE_PROTOCOL,
  readEvidenceGitContext,
  validateEvidenceOnlyAttestation,
  validateNativeReleaseEvidence
} from './native-release-evidence.mjs';

const EXPECTED_RISK_AREAS = Object.freeze({
  'authentication-and-authorization': [
    'success',
    'invalid-or-expired-credential',
    'replay-or-idempotency',
    'revocation',
    'cross-account-denial'
  ],
  'synchronization-and-offline-writes': [
    'durable-retry',
    'duplicate-replay',
    'stale-revision-or-conflict',
    'account-or-server-isolation',
    'reconnect'
  ],
  'database-and-portability': [
    'fresh-migration',
    'supported-upgrade',
    'representative-export',
    'cascade-deletion',
    'encrypted-backup-validation',
    'clean-restore'
  ],
  'tracking-domain-calculations': [
    'unit-conversion',
    'timezone-or-local-day',
    'boundary-values',
    'immutable-snapshot',
    'api-serialization'
  ],
  'privacy-and-diagnostics': [
    'permission-or-config-assertions',
    'log-redaction',
    'metric-redaction',
    'export-redaction',
    'error-redaction',
    'health-detail-minimization'
  ],
  'critical-client-workflows': [
    'web-state-transitions',
    'web-browser-happy-path',
    'web-failure-recovery',
    'android-state-transitions',
    'android-emulator-happy-path',
    'wear-state-transitions',
    'wear-emulator-package-smoke',
    'android-physical-happy-path',
    'android-physical-offline-reconnect',
    'wear-physical-happy-path',
    'wear-physical-offline-reconnect'
  ]
});

const REQUIRED_PHYSICAL_WAIVER = Object.freeze({
  id: 'physical-galaxy-phone-and-watch-validation',
  riskArea: 'critical-client-workflows',
  status: 'release-blocking',
  owner: 'MChartier',
  trackingIssues: ['#219', '#222', '#303'],
  expiresOn: '2026-08-12',
  capabilities: [
    'android-physical-happy-path',
    'android-physical-offline-reconnect',
    'wear-physical-happy-path',
    'wear-physical-offline-reconnect'
  ]
});
const PHYSICAL_CAPABILITIES = new Set(REQUIRED_PHYSICAL_WAIVER.capabilities);

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sortedUniqueStrings(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    return null;
  }
  return [...new Set(value)].sort();
}

function sameStrings(actual, expected) {
  const normalized = sortedUniqueStrings(actual);
  return normalized !== null
    && normalized.length === actual.length
    && normalized.join('\n') === [...expected].sort().join('\n');
}

function describeSetMismatch(actual, expected) {
  const actualSet = new Set(Array.isArray(actual) ? actual : []);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((item) => !actualSet.has(item));
  const unexpected = [...actualSet].filter((item) => !expectedSet.has(item));
  const details = [];
  if (missing.length) details.push(`missing ${missing.join(', ')}`);
  if (unexpected.length) details.push(`unexpected ${unexpected.join(', ')}`);
  if (Array.isArray(actual) && new Set(actual).size !== actual.length) details.push('duplicate values');
  return details.join('; ') || 'invalid value';
}

function validateRepositoryPath(relativePath, label, repoRoot, errors, statSync) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    errors.push(`${label} must be a non-empty repository-relative path.`);
    return;
  }

  const normalized = relativePath.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (path.isAbsolute(relativePath) || segments.includes('..')) {
    errors.push(`${label} must stay within the repository: ${relativePath}`);
    return;
  }

  const resolvedPath = path.resolve(repoRoot, relativePath);
  const fromRoot = path.relative(repoRoot, resolvedPath);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
    errors.push(`${label} must stay within the repository: ${relativePath}`);
    return;
  }

  try {
    const stat = statSync(resolvedPath);
    if (!stat.isFile() || stat.size === 0) {
      errors.push(`${label} must reference a non-empty file: ${relativePath}`);
    }
  } catch {
    errors.push(`${label} does not exist: ${relativePath}`);
  }
}

function validateWaiver(waiver, now, errors) {
  const label = `Waiver ${waiver?.id ?? 'unknown'}`;
  if (typeof waiver?.riskArea !== 'string' || !(waiver.riskArea in EXPECTED_RISK_AREAS)) {
    errors.push(`${label} must reference a known risk area.`);
  }
  if (waiver?.status !== 'release-blocking') {
    errors.push(`${label} must be release-blocking.`);
  }
  if (typeof waiver?.owner !== 'string' || !waiver.owner.trim()) {
    errors.push(`${label} must name an owner.`);
  }
  if (typeof waiver?.reason !== 'string' || !waiver.reason.trim()) {
    errors.push(`${label} must explain why evidence is outstanding.`);
  }

  const trackingIssues = sortedUniqueStrings(waiver?.trackingIssues);
  if (
    trackingIssues === null ||
    trackingIssues.length === 0 ||
    trackingIssues.length !== waiver.trackingIssues.length ||
    trackingIssues.some((issue) => !/^#\d+$/.test(issue))
  ) {
    errors.push(`${label} trackingIssues must contain unique GitHub issue references such as #222.`);
  }

  const expectedCapabilities = EXPECTED_RISK_AREAS[waiver?.riskArea] ?? [];
  const capabilities = sortedUniqueStrings(waiver?.capabilities);
  if (
    capabilities === null ||
    capabilities.length === 0 ||
    capabilities.length !== waiver.capabilities.length
  ) {
    errors.push(`${label} capabilities must be unique non-empty strings.`);
  } else {
    for (const capability of capabilities) {
      if (!expectedCapabilities.includes(capability)) {
        errors.push(`${label} references unknown capability for ${waiver.riskArea}: ${capability}.`);
      }
    }
  }

  const expiresAt = Date.parse(`${waiver?.expiresOn}T23:59:59.999Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(waiver?.expiresOn ?? '') || Number.isNaN(expiresAt)) {
    errors.push(`${label} must have a valid YYYY-MM-DD expiry.`);
  } else if (now.getTime() > expiresAt) {
    errors.push(`${label} expired on ${waiver.expiresOn}.`);
  }

  if (waiver?.id === REQUIRED_PHYSICAL_WAIVER.id) {
    for (const field of ['riskArea', 'status', 'owner', 'expiresOn']) {
      if (waiver[field] !== REQUIRED_PHYSICAL_WAIVER[field]) {
        errors.push(
          `${label} ${field} must be ${REQUIRED_PHYSICAL_WAIVER[field]}, got ${waiver[field] ?? 'missing'}.`
        );
      }
    }
    if (!sameStrings(waiver.trackingIssues, REQUIRED_PHYSICAL_WAIVER.trackingIssues)) {
      errors.push(
        `${label} trackingIssues is invalid: ${describeSetMismatch(waiver.trackingIssues, REQUIRED_PHYSICAL_WAIVER.trackingIssues)}.`
      );
    }
  }
}

/** Physical release evidence must be retained as a device- and candidate-specific result artifact. */
function validatePhysicalDeviceEvidence(records, options) {
  const {
    repoRoot,
    now,
    errors,
    statSync,
    readFileSync,
    releaseMode,
    candidateCommit,
    candidateManifestContent
  } = options;
  const coveredByArea = new Map();
  const ids = new Set();
  const recordFields = [
    'id',
    'riskArea',
    'status',
    'owner',
    'executedOn',
    'sourceCommit',
    'protocolPath',
    'resultArtifact',
    'capabilities'
  ];

  if (releaseMode && records.length > 0 && !/^[0-9a-f]{40}$/.test(candidateCommit ?? '')) {
    errors.push('Release mode with physical evidence requires an explicit frozen 40-character candidate commit.');
  }

  let manifestContent = candidateManifestContent;
  if (records.length > 0 && manifestContent === undefined) {
    try {
      manifestContent = readFileSync(path.resolve(repoRoot, 'shared/release.json'));
    } catch (error) {
      errors.push(
        `Unable to read candidate shared/release.json: ${error instanceof Error ? error.message : error}.`
      );
    }
  }

  for (const record of records) {
    const label = `Physical evidence ${record?.id ?? 'unknown'}`;
    if (typeof record?.id !== 'string' || !record.id) {
      errors.push('Every physical device evidence record must have an id.');
      continue;
    }
    if (ids.has(record.id)) errors.push(`Duplicate physical device evidence id: ${record.id}.`);
    ids.add(record.id);

    const actualFields = Object.keys(record).sort();
    const missingFields = recordFields.filter((field) => !actualFields.includes(field));
    const unexpectedFields = actualFields.filter((field) => !recordFields.includes(field));
    if (missingFields.length) errors.push(`${label} is missing fields: ${missingFields.join(', ')}.`);
    if (unexpectedFields.length) errors.push(`${label} has unexpected fields: ${unexpectedFields.join(', ')}.`);

    if (record.riskArea !== REQUIRED_PHYSICAL_WAIVER.riskArea) {
      errors.push(`${label} must belong to ${REQUIRED_PHYSICAL_WAIVER.riskArea}.`);
    }
    if (record.status !== 'passed') errors.push(`${label} status must be passed.`);
    if (typeof record.owner !== 'string' || !record.owner.trim()) errors.push(`${label} must name an owner.`);
    if (!/^[0-9a-f]{40}$/.test(record.sourceCommit ?? '')) {
      errors.push(`${label} must record the frozen 40-character source commit.`);
    } else if (
      releaseMode &&
      /^[0-9a-f]{40}$/.test(candidateCommit ?? '') &&
      record.sourceCommit !== candidateCommit
    ) {
      errors.push(
        `${label} source commit ${record.sourceCommit} does not match release candidate ${candidateCommit}.`
      );
    }

    const executedAt = Date.parse(`${record.executedOn}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.executedOn ?? '') || Number.isNaN(executedAt)) {
      errors.push(`${label} must record a valid YYYY-MM-DD execution date.`);
    } else if (executedAt > now.getTime()) {
      errors.push(`${label} execution date cannot be in the future.`);
    }
    if (record.protocolPath !== NATIVE_RELEASE_PROTOCOL) {
      errors.push(`${label} protocolPath must be ${NATIVE_RELEASE_PROTOCOL}.`);
    }

    const capabilities = sortedUniqueStrings(record.capabilities);
    if (capabilities === null || capabilities.length === 0 || capabilities.length !== record.capabilities.length) {
      errors.push(`${label} capabilities must be unique non-empty strings.`);
    } else {
      const covered = coveredByArea.get(record.riskArea) ?? new Set();
      for (const capability of capabilities) {
        if (!PHYSICAL_CAPABILITIES.has(capability)) {
          errors.push(`${label} references a non-physical or unknown capability: ${capability}.`);
        } else if (covered.has(capability)) {
          errors.push(`${label} duplicates physical capability evidence: ${capability}.`);
        } else {
          covered.add(capability);
        }
      }
      coveredByArea.set(record.riskArea, covered);
    }

    validateRepositoryPath(record.protocolPath, `${label} protocol`, repoRoot, errors, statSync);
    validateRepositoryPath(record.resultArtifact, `${label} result artifact`, repoRoot, errors, statSync);
    try {
      const artifact = JSON.parse(readFileSync(path.resolve(repoRoot, record.resultArtifact), 'utf8'));
      const validation = validateNativeReleaseEvidence(artifact, {
        candidateCommit: record.sourceCommit,
        manifestContent,
        now
      });
      for (const error of validation.errors) errors.push(`${label}: ${error}`);
      for (const field of ['status', 'owner', 'executedOn', 'sourceCommit']) {
        if (artifact[field] !== record[field]) errors.push(`${label} result artifact does not match ${field}.`);
      }
      if (artifact.protocol !== record.protocolPath) {
        errors.push(`${label} result artifact does not match protocolPath.`);
      }
      if (!sameStrings(artifact.capabilities, record.capabilities ?? [])) {
        errors.push(`${label} result artifact capabilities do not match the manifest.`);
      }
    } catch (error) {
      errors.push(`${label} result artifact must be valid JSON: ${error instanceof Error ? error.message : error}.`);
    }
  }

  return coveredByArea;
}

/**
 * Validates the risk contract without running the referenced suites. Release mode can then reject
 * active blockers while normal development still gets a fast structural check.
 */
export function validateRiskEvidence({
  manifest,
  packageScripts,
  repoRoot = repositoryRoot,
  now = new Date(),
  statSync = fs.statSync,
  readFileSync = fs.readFileSync,
  releaseMode = false,
  candidateCommit,
  evidenceCommit,
  evidenceAttestation,
  candidateManifestContent
}) {
  const errors = [];
  const blockers = [];
  const rows = [];

  if (manifest?.schemaVersion !== 1) {
    errors.push(`Unsupported risk evidence schema version: ${manifest?.schemaVersion ?? 'missing'}.`);
  }

  const riskAreas = Array.isArray(manifest?.riskAreas) ? manifest.riskAreas : [];
  const areasById = new Map();
  for (const area of riskAreas) {
    if (typeof area?.id !== 'string' || !area.id) {
      errors.push('Every risk area must have an id.');
      continue;
    }
    if (areasById.has(area.id)) {
      errors.push(`Duplicate risk area id: ${area.id}.`);
      continue;
    }
    areasById.set(area.id, area);
  }

  for (const areaId of areasById.keys()) {
    if (!(areaId in EXPECTED_RISK_AREAS)) errors.push(`Unexpected risk area: ${areaId}.`);
  }

  const waivers = Array.isArray(manifest?.waivers) ? manifest.waivers : [];
  const waiverIds = new Set();
  const waivedCapabilityOwners = new Map();
  for (const waiver of waivers) {
    if (typeof waiver?.id !== 'string' || !waiver.id) {
      errors.push('Every waiver must have an id.');
      continue;
    }
    if (waiverIds.has(waiver.id)) errors.push(`Duplicate waiver id: ${waiver.id}.`);
    waiverIds.add(waiver.id);
    validateWaiver(waiver, now, errors);
    for (const capability of Array.isArray(waiver.capabilities) ? waiver.capabilities : []) {
      const key = `${waiver.riskArea}/${capability}`;
      if (waivedCapabilityOwners.has(key)) {
        errors.push(
          `Capability ${key} is waived by both ${waivedCapabilityOwners.get(key)} and ${waiver.id}.`
        );
      } else {
        waivedCapabilityOwners.set(key, waiver.id);
      }
    }
    blockers.push(waiver);
  }

  const physicalRecords = Array.isArray(manifest?.physicalDeviceEvidence)
    ? manifest.physicalDeviceEvidence
    : [];
  if (releaseMode && physicalRecords.length > 0) {
    if (!/^[0-9a-f]{40}$/.test(evidenceCommit ?? '')) {
      errors.push('Release mode with physical evidence requires an explicit 40-character evidence commit.');
    } else if (!evidenceAttestation) {
      errors.push('Release mode requires Git parent/diff context for the evidence commit.');
    } else {
      errors.push(...validateEvidenceOnlyAttestation({
        sourceCommit: candidateCommit,
        evidenceCommit,
        parentCommits: evidenceAttestation.parentCommits,
        changedPaths: evidenceAttestation.changedPaths,
        resultArtifacts: physicalRecords.map((record) => record.resultArtifact),
        checkedOutCommit: evidenceAttestation.checkedOutCommit,
        worktreeStatus: evidenceAttestation.worktreeStatus
      }));
    }
  }
  const physicalEvidenceByArea = validatePhysicalDeviceEvidence(physicalRecords, {
    repoRoot,
    now,
    errors,
    statSync,
    readFileSync,
    releaseMode,
    candidateCommit,
    candidateManifestContent
  });

  for (const [areaId, expectedCapabilities] of Object.entries(EXPECTED_RISK_AREAS)) {
    const area = areasById.get(areaId);
    if (!area) {
      errors.push(`Missing risk area: ${areaId}.`);
      continue;
    }
    if (typeof area.title !== 'string' || !area.title.trim()) {
      errors.push(`Risk area ${areaId} must have a title.`);
    }
    if (!sameStrings(area.requiredCapabilities, expectedCapabilities)) {
      errors.push(
        `Risk area ${areaId} requiredCapabilities is invalid: ${describeSetMismatch(area.requiredCapabilities, expectedCapabilities)}.`
      );
    }

    const evidence = Array.isArray(area.evidence) ? area.evidence : [];
    if (evidence.length === 0) errors.push(`Risk area ${areaId} must list automated evidence.`);
    const evidenceIds = new Set();
    const automatedCapabilities = new Set();

    for (const item of evidence) {
      const itemLabel = `Evidence ${areaId}/${item?.id ?? 'unknown'}`;
      if (typeof item?.id !== 'string' || !item.id) {
        errors.push(`Risk area ${areaId} contains evidence without an id.`);
      } else if (evidenceIds.has(item.id)) {
        errors.push(`Duplicate evidence id in ${areaId}: ${item.id}.`);
      } else {
        evidenceIds.add(item.id);
      }

      const hasNpmScript = typeof item?.npmScript === 'string' && item.npmScript.length > 0;
      const hasWorkflow = typeof item?.workflow === 'string' && item.workflow.length > 0;
      if (hasNpmScript === hasWorkflow) {
        errors.push(`${itemLabel} must name exactly one npmScript or workflow.`);
      }
      if (hasNpmScript && typeof packageScripts?.[item.npmScript] !== 'string') {
        errors.push(`${itemLabel} references unknown root npm script: ${item.npmScript}.`);
      }
      if (hasNpmScript) {
        if (typeof item.scriptCommand !== 'string' || !item.scriptCommand.trim()) {
          errors.push(`${itemLabel} must pin the expected npm script command.`);
        } else if (
          typeof packageScripts?.[item.npmScript] === 'string' &&
          packageScripts[item.npmScript].trim().replace(/\s+/g, ' ') !==
            item.scriptCommand.trim().replace(/\s+/g, ' ')
        ) {
          errors.push(`${itemLabel} npm script command changed from: ${item.scriptCommand}.`);
        }
      }
      if (hasWorkflow) {
        validateRepositoryPath(item.workflow, `${itemLabel} workflow`, repoRoot, errors, statSync);
        if (typeof item.workflowContains !== 'string' || !item.workflowContains.trim()) {
          errors.push(`${itemLabel} must name the command expected in its workflow.`);
        } else {
          try {
            const workflowSource = readFileSync(path.resolve(repoRoot, item.workflow), 'utf8');
            if (!workflowSource.includes(item.workflowContains)) {
              errors.push(`${itemLabel} workflow no longer contains: ${item.workflowContains}.`);
            }
          } catch {
            // The missing workflow path is already reported by validateRepositoryPath.
          }
        }
      }

      if (!Array.isArray(item?.paths) || item.paths.length === 0) {
        errors.push(`${itemLabel} must reference at least one evidence file.`);
      } else {
        for (const evidencePath of item.paths) {
          validateRepositoryPath(evidencePath, `${itemLabel} path`, repoRoot, errors, statSync);
        }
      }

      const itemCapabilities = sortedUniqueStrings(item?.capabilities);
      if (itemCapabilities === null || itemCapabilities.length !== item.capabilities.length) {
        errors.push(`${itemLabel} capabilities must be unique non-empty strings.`);
        continue;
      }
      for (const capability of itemCapabilities) {
        if (!expectedCapabilities.includes(capability)) {
          errors.push(`${itemLabel} references unknown capability: ${capability}.`);
        } else if (PHYSICAL_CAPABILITIES.has(capability)) {
          errors.push(`${itemLabel} cannot satisfy physical-device capability ${capability}; use physicalDeviceEvidence.`);
        } else {
          automatedCapabilities.add(capability);
        }
      }
    }

    const physicalCapabilities = physicalEvidenceByArea.get(areaId) ?? new Set();
    const waivedCapabilities = new Set(
      waivers
        .filter((waiver) => waiver?.riskArea === areaId)
        .flatMap((waiver) => Array.isArray(waiver.capabilities) ? waiver.capabilities : [])
    );
    for (const capability of waivedCapabilities) {
      if (automatedCapabilities.has(capability) || physicalCapabilities.has(capability)) {
        errors.push(`Risk area ${areaId} has both evidence and a waiver for ${capability}.`);
      }
    }
    for (const capability of expectedCapabilities) {
      if (
        !automatedCapabilities.has(capability) &&
        !physicalCapabilities.has(capability) &&
        !waivedCapabilities.has(capability)
      ) {
        errors.push(`Risk area ${areaId} has no evidence or waiver for ${capability}.`);
      }
    }

    if (areaId === REQUIRED_PHYSICAL_WAIVER.riskArea) {
      const missingPhysicalCapabilities = REQUIRED_PHYSICAL_WAIVER.capabilities.filter(
        (capability) => !physicalCapabilities.has(capability)
      );
      const physicalWaiver = waivers.find((waiver) => waiver?.id === REQUIRED_PHYSICAL_WAIVER.id);
      if (missingPhysicalCapabilities.length === 0 && physicalWaiver) {
        errors.push(`Remove ${REQUIRED_PHYSICAL_WAIVER.id}; physical evidence now covers every capability.`);
      } else if (missingPhysicalCapabilities.length > 0 && !physicalWaiver) {
        errors.push(`Missing release-blocking waiver ${REQUIRED_PHYSICAL_WAIVER.id}.`);
      } else if (
        physicalWaiver &&
        !sameStrings(physicalWaiver.capabilities, missingPhysicalCapabilities)
      ) {
        errors.push(
          `Waiver ${physicalWaiver.id} capabilities must match outstanding physical evidence: ` +
          `${describeSetMismatch(physicalWaiver.capabilities, missingPhysicalCapabilities)}.`
        );
      }
    }

    rows.push({
      id: areaId,
      evidenceCount: evidence.length,
      requiredCount: expectedCapabilities.length,
      automatedCount: automatedCapabilities.size,
      physicalCount: physicalCapabilities.size,
      waivedCount: waivedCapabilities.size
    });
  }

  return { errors, blockers, rows };
}

export function loadRepositoryRiskEvidence(repoRoot = repositoryRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'quality/risk-evidence.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  return { manifest, packageScripts: packageJson.scripts ?? {}, repoRoot };
}

/** Parse and validate risk evidence args. */
export function parseRiskEvidenceArgs(argv, environment = process.env) {
  const values = {
    releaseMode: false,
    candidateCommit: environment.CALIBRATE_RELEASE_CANDIDATE?.trim() || null,
    evidenceCommit: environment.CALIBRATE_RELEASE_EVIDENCE?.trim() || environment.GITHUB_SHA?.trim() || null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--release') values.releaseMode = true;
    else if (option === '--candidate' || option === '--evidence') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
      if (option === '--candidate') values.candidateCommit = value;
      else values.evidenceCommit = value;
      index += 1;
    } else {
      throw new Error(`Unknown risk-evidence option: ${option}`);
    }
  }
  return values;
}

function printResult(result) {
  if (result.errors.length) {
    console.error('Risk evidence contract is invalid:');
    for (const error of result.errors) console.error(`- ${error}`);
    return;
  }

  console.log('Risk evidence contract is valid. Numeric coverage remains diagnostic.');
  console.table(result.rows);
  if (result.blockers.length) {
    console.log('Release-blocking evidence still required:');
    for (const blocker of result.blockers) {
      console.log(
        `- ${blocker.id}: ${blocker.owner}, expires ${blocker.expiresOn}, tracked by ${blocker.trackingIssues.join(' and ')}`
      );
    }
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    const cli = parseRiskEvidenceArgs(process.argv.slice(2));
    const input = loadRepositoryRiskEvidence();
    const physicalRecords = Array.isArray(input.manifest?.physicalDeviceEvidence)
      ? input.manifest.physicalDeviceEvidence
      : [];
    if (cli.releaseMode && physicalRecords.length > 0) {
      input.candidateCommit = cli.candidateCommit;
      input.evidenceCommit = cli.evidenceCommit;
      if (
        /^[0-9a-f]{40}$/.test(cli.candidateCommit ?? '') &&
        /^[0-9a-f]{40}$/.test(cli.evidenceCommit ?? '')
      ) {
        const context = readEvidenceGitContext({
          root: input.repoRoot,
          sourceCommit: cli.candidateCommit,
          evidenceCommit: cli.evidenceCommit,
          resultArtifacts: physicalRecords.map((record) => record.resultArtifact)
        });
        input.manifest = JSON.parse(context.riskManifestContent);
        input.candidateManifestContent = context.manifestContent;
        input.evidenceAttestation = context;
        const evidenceFiles = new Map(
          Object.entries(context.resultContents).map(([relativePath, content]) => [
            path.resolve(input.repoRoot, relativePath),
            content
          ])
        );
        input.readFileSync = (file, encoding) => {
          const content = evidenceFiles.get(path.resolve(file));
          if (content === undefined) return fs.readFileSync(file, encoding);
          return encoding ? content : Buffer.from(content);
        };
        input.statSync = (file) => {
          const content = evidenceFiles.get(path.resolve(file));
          if (content === undefined) return fs.statSync(file);
          return { isFile: () => true, size: Buffer.byteLength(content) };
        };
      }
    }
    const result = validateRiskEvidence({ ...input, releaseMode: cli.releaseMode });
    printResult(result);
    if (result.errors.length || (cli.releaseMode && result.blockers.length)) {
      if (!result.errors.length) {
        console.error('Release gate is blocked until all release-blocking evidence is recorded.');
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[risk-evidence] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
