import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RELEASE_ACCEPTANCE_PLAN_SCHEMA_VERSION = 2;
export const RELEASE_ACCEPTANCE_RESULT_SCHEMA_VERSION = 2;
export const HOSTED_RELEASE_RESULT_SCHEMA_VERSION = 1;
export const RELEASE_ACCEPTANCE_PLAN_PATH = 'quality/release-acceptance-plan.json';
export const RELEASE_ACCEPTANCE_RISK_PATH = 'quality/risk-evidence.json';
export const RELEASE_ACCEPTANCE_RESULT_PROPERTY = 'releaseAcceptanceEvidence';
export const RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION = '${{ github.event.pull_request.head.sha || github.sha }}';
export const RELEASE_ACCEPTANCE_SCOPES = Object.freeze(['server-web', 'ota', 'native']);
const RELEASE_ACCEPTANCE_PR_HEAD_EXPRESSION = '${{ github.event.pull_request.head.sha }}';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const HOSTED_EVIDENCE_REFERENCE_PATTERN = /^run:([1-9]\d*)\/artifact:([a-z0-9][a-z0-9._-]{0,127})$/;
const OPERATOR_EVIDENCE_REFERENCE_PATTERN = /^path:(quality\/physical-results\/[a-z0-9][a-z0-9._-]*\.json)$/;
const HOSTED_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);
const RESULT_OUTCOMES = new Set(['passed']);
const EVIDENCE_PROVIDERS = new Set(['github-actions', 'operator-receipt']);
const PLAN_FIELDS = Object.freeze([
  'schemaVersion',
  'protocolPath',
  'releaseManifestPath',
  'releaseNotesPath',
  'releaseScopes',
  'candidateContract',
  'evidenceCommitContract',
  'checkoutWorkflows',
  'requirements'
]);
const CANDIDATE_FIELDS = Object.freeze(['source', 'shaFormat', 'checkoutExpression']);
const EVIDENCE_COMMIT_FIELDS = Object.freeze([
  'resultManifestPath',
  'resultProperty',
  'soleParentMustBeCandidate',
  'checkedOutHeadMustBeEvidence',
  'cleanWorktreeRequired',
  'allowlistedPathPatterns'
]);
const HOSTED_REQUIREMENT_FIELDS = Object.freeze([
  'id',
  'title',
  'execution',
  'blocksImplementation',
  'blocksExternalLaunch',
  'releaseScopes',
  'workflowPath',
  'jobId',
  'command',
  'retainedArtifact'
]);
const OPERATOR_REQUIREMENT_FIELDS = Object.freeze([
  'id',
  'title',
  'execution',
  'blocksImplementation',
  'blocksExternalLaunch',
  'releaseScopes',
  'protocolPath'
]);
const ARTIFACT_CONTRACT_FIELDS = Object.freeze(['namePrefix', 'retentionDays', 'requiredResults']);
const RESULT_FIELDS = Object.freeze([
  'schemaVersion',
  'sourceCommit',
  'completedOn',
  'releaseScopes',
  'plan',
  'releaseManifest',
  'requirements'
]);
const HASHED_PATH_FIELDS = Object.freeze(['path', 'sha256']);
const RESULT_REQUIREMENT_FIELDS = Object.freeze(['id', 'outcome', 'evidence']);
const RESULT_EVIDENCE_FIELDS = Object.freeze(['provider', 'reference', 'sha256']);
const HOSTED_RESULT_FIELDS = Object.freeze([
  'schemaVersion',
  'gateId',
  'sourceCommit',
  'outcome',
  'workflow',
  'runId',
  'runAttempt',
  'job'
]);
const FORBIDDEN_PLAN_KEYS = new Set([
  'candidateCommit',
  'evidenceCommit',
  'sourceCommit',
  'outcome',
  'status',
  'executedOn',
  'completedOn',
  'runId',
  'sha256'
]);

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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeReleaseAcceptanceScopes(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some((scope) => typeof scope !== 'string' || !RELEASE_ACCEPTANCE_SCOPES.includes(scope))) return null;
  if (new Set(value).size !== value.length) return null;
  return RELEASE_ACCEPTANCE_SCOPES.filter((scope) => value.includes(scope));
}

function validateReleaseScopes(value, label, errors, expected = null) {
  const normalized = normalizeReleaseAcceptanceScopes(value);
  if (normalized === null) {
    errors.push(`${label} must contain unique supported scopes: ${RELEASE_ACCEPTANCE_SCOPES.join(', ')}.`);
    return null;
  }
  if (JSON.stringify(value) !== JSON.stringify(normalized)) {
    errors.push(`${label} must use canonical scope order: ${RELEASE_ACCEPTANCE_SCOPES.join(', ')}.`);
  }
  if (expected && JSON.stringify(normalized) !== JSON.stringify(expected)) {
    errors.push(`${label} must define exactly: ${expected.join(', ')}.`);
  }
  return normalized;
}

export function requirementsForReleaseScopes(plan, releaseScopes) {
  const normalized = normalizeReleaseAcceptanceScopes(releaseScopes) ?? [...RELEASE_ACCEPTANCE_SCOPES];
  return (plan?.requirements ?? []).filter((requirement) => (
    Array.isArray(requirement.releaseScopes)
      && requirement.releaseScopes.some((scope) => normalized.includes(scope))
  ));
}

function normalizedRepositoryPath(value) {
  if (!isNonEmptyString(value) || path.isAbsolute(value)) return null;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  return normalized;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isExactCalendarDate(value) {
  if (!DATE_PATTERN.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateRepositoryFile(relativePath, label, root, errors, readFileSync) {
  const normalized = normalizedRepositoryPath(relativePath);
  if (!normalized) {
    errors.push(`${label} must stay within the repository.`);
    return null;
  }
  try {
    const content = readFileSync(path.join(root, normalized), 'utf8');
    if (!content.length) errors.push(`${label} must be non-empty: ${normalized}.`);
    return content;
  } catch {
    errors.push(`${label} does not exist: ${normalized}.`);
    return null;
  }
}

function validatePlanHasNoResults(value, label, errors) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PLAN_KEYS.has(key)) {
      errors.push(`${label} must contain requirements only; result field ${key} is forbidden.`);
    }
    if (typeof nested === 'string' && COMMIT_PATTERN.test(nested)) {
      errors.push(`${label} must not embed a concrete candidate or evidence commit.`);
    }
    if (nested && typeof nested === 'object') validatePlanHasNoResults(nested, label, errors);
  }
}

function workflowJobBlock(workflow, jobId) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(jobId ?? '')) return null;
  const match = workflow.match(new RegExp(`\\n  ${jobId}:\\n[\\s\\S]*?(?=\\n  [a-z0-9][a-z0-9_-]*:|$)`));
  return match?.[0] ?? null;
}

function checkoutBlocks(workflow) {
  return [...workflow.matchAll(/(^|\n)([ \t]+)- name: [^\n]*\n\2  uses: actions\/checkout@v4[\s\S]*?(?=\n\2- name: |$)/g)]
    .map((match) => match[0]);
}

export function validateReleaseAcceptancePlan(plan, options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const readFileSync = options.readFileSync ?? fs.readFileSync;
  const errors = [];
  hasExactFields(plan, PLAN_FIELDS, 'Release acceptance plan', errors);
  validatePlanHasNoResults(plan, 'Release acceptance plan', errors);
  if (plan?.schemaVersion !== RELEASE_ACCEPTANCE_PLAN_SCHEMA_VERSION) {
    errors.push(`Release acceptance plan schemaVersion must be ${RELEASE_ACCEPTANCE_PLAN_SCHEMA_VERSION}.`);
  }
  const protocol = validateRepositoryFile(plan?.protocolPath, 'Release acceptance protocol', root, errors, readFileSync);
  validateRepositoryFile(plan?.releaseManifestPath, 'Release manifest', root, errors, readFileSync);
  validateRepositoryFile(plan?.releaseNotesPath, 'Release notes', root, errors, readFileSync);
  if (protocol && !protocol.includes('candidate C') && !protocol.includes('Candidate C')) {
    errors.push('Release acceptance protocol must explain frozen candidate C.');
  }
  validateReleaseScopes(
    plan?.releaseScopes,
    'Release acceptance plan releaseScopes',
    errors,
    [...RELEASE_ACCEPTANCE_SCOPES]
  );

  hasExactFields(plan?.candidateContract, CANDIDATE_FIELDS, 'Candidate contract', errors);
  if (plan?.candidateContract?.source !== 'pull-request-head') {
    errors.push('Candidate contract source must be pull-request-head.');
  }
  if (plan?.candidateContract?.shaFormat !== 'lowercase-40-hex') {
    errors.push('Candidate contract shaFormat must be lowercase-40-hex.');
  }
  if (plan?.candidateContract?.checkoutExpression !== RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION) {
    errors.push('Candidate contract must use the multi-event-safe pull-request head checkout expression.');
  }

  hasExactFields(plan?.evidenceCommitContract, EVIDENCE_COMMIT_FIELDS, 'Evidence commit contract', errors);
  const evidenceContract = plan?.evidenceCommitContract;
  if (evidenceContract?.resultManifestPath !== RELEASE_ACCEPTANCE_RISK_PATH) {
    errors.push(`Evidence result manifest must be ${RELEASE_ACCEPTANCE_RISK_PATH}.`);
  }
  if (evidenceContract?.resultProperty !== RELEASE_ACCEPTANCE_RESULT_PROPERTY) {
    errors.push(`Evidence result property must be ${RELEASE_ACCEPTANCE_RESULT_PROPERTY}.`);
  }
  for (const field of ['soleParentMustBeCandidate', 'checkedOutHeadMustBeEvidence', 'cleanWorktreeRequired']) {
    if (evidenceContract?.[field] !== true) errors.push(`Evidence commit contract ${field} must be true.`);
  }
  const expectedPatterns = [RELEASE_ACCEPTANCE_RISK_PATH, 'quality/physical-results/*.json'];
  if (JSON.stringify(evidenceContract?.allowlistedPathPatterns) !== JSON.stringify(expectedPatterns)) {
    errors.push(`Evidence commit allowlist must be exactly: ${expectedPatterns.join(', ')}.`);
  }

  const checkoutWorkflows = plan?.checkoutWorkflows;
  if (!Array.isArray(checkoutWorkflows) || checkoutWorkflows.length === 0) {
    errors.push('Release acceptance plan must name pull-request checkout workflows.');
  } else if (new Set(checkoutWorkflows).size !== checkoutWorkflows.length) {
    errors.push('Release acceptance checkout workflows must be unique.');
  } else {
    for (const workflowPath of checkoutWorkflows) {
      const workflow = validateRepositoryFile(workflowPath, 'Candidate checkout workflow', root, errors, readFileSync);
      if (!workflow) continue;
      const blocks = checkoutBlocks(workflow);
      if (blocks.length === 0) errors.push(`${workflowPath} must contain at least one actions/checkout step.`);
      for (const block of blocks) {
        if (!block.includes(`ref: ${RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION}`)) {
          errors.push(`${workflowPath} has a checkout that is not pinned to candidate C.`);
        }
      }
    }
  }

  if (!Array.isArray(plan?.requirements) || plan.requirements.length === 0) {
    errors.push('Release acceptance plan must define at least one requirement.');
    return { errors, hosted: [], operator: [] };
  }
  const ids = new Set();
  const hosted = [];
  const operator = [];
  for (const requirement of plan.requirements) {
    const label = `Release acceptance requirement ${requirement?.id ?? 'unknown'}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(requirement?.id ?? '')) errors.push(`${label} id is invalid.`);
    if (ids.has(requirement?.id)) errors.push(`${label} is duplicated.`);
    ids.add(requirement?.id);
    if (!isNonEmptyString(requirement?.title)) errors.push(`${label} must have a title.`);
    if (requirement?.blocksExternalLaunch !== true) errors.push(`${label} must block external launch.`);
    validateReleaseScopes(requirement?.releaseScopes, `${label} releaseScopes`, errors);

    if (requirement?.execution === 'hosted') {
      hosted.push(requirement);
      hasExactFields(requirement, HOSTED_REQUIREMENT_FIELDS, label, errors);
      if (requirement.blocksImplementation !== true) errors.push(`${label} must block implementation.`);
      const workflow = validateRepositoryFile(requirement.workflowPath, `${label} workflow`, root, errors, readFileSync);
      const job = workflow ? workflowJobBlock(workflow, requirement.jobId) : null;
      if (workflow && !job) errors.push(`${label} workflow must define job ${requirement.jobId}.`);
      if (!isNonEmptyString(requirement.command) || (job && !job.includes(requirement.command))) {
        errors.push(`${label} job must contain command ${requirement.command}.`);
      }
      if (requirement.retainedArtifact === null) {
        errors.push(`${label} must retain a candidate-bound acceptance summary.`);
      } else {
        hasExactFields(requirement.retainedArtifact, ARTIFACT_CONTRACT_FIELDS, `${label} retained artifact`, errors);
        if (!/^[a-z0-9][a-z0-9-]*$/.test(requirement.retainedArtifact?.namePrefix ?? '')) {
          errors.push(`${label} retained artifact namePrefix must be a lowercase artifact name or prefix.`);
        }
        if (!Number.isSafeInteger(requirement.retainedArtifact?.retentionDays)
          || requirement.retainedArtifact.retentionDays < 1
          || requirement.retainedArtifact.retentionDays > 90) {
          errors.push(`${label} retained artifact retentionDays must be 1-90.`);
        }
        if (!Number.isSafeInteger(requirement.retainedArtifact?.requiredResults)
          || requirement.retainedArtifact.requiredResults < 1
          || requirement.retainedArtifact.requiredResults > 10) {
          errors.push(`${label} retained artifact requiredResults must be 1-10.`);
        }
        if (job && !job.includes(`name: ${requirement.retainedArtifact.namePrefix}`)) {
          errors.push(`${label} job must retain its named artifact.`);
        }
        if (job && !job.includes(`retention-days: ${requirement.retainedArtifact.retentionDays}`)) {
          errors.push(`${label} job must retain evidence for the reviewed duration.`);
        }
        const genericSourceBinding = job?.includes(`--candidate "${RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION}"`);
        const exactSourceEnvironment = job?.includes(
          `CALIBRATE_SOURCE_COMMIT: ${RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION}`
        ) || job?.includes(`CALIBRATE_SOURCE_COMMIT: ${RELEASE_ACCEPTANCE_PR_HEAD_EXPRESSION}`);
        const nativeSourceBinding = exactSourceEnvironment
          && job.includes('--source-commit "$CALIBRATE_SOURCE_COMMIT"');
        const repositorySourceBinding = exactSourceEnvironment && job.includes('npm run test:db:rollback');
        if (job && !genericSourceBinding && !nativeSourceBinding && !repositorySourceBinding) {
          errors.push(`${label} retained artifact must record candidate C through a sanitized source-binding command.`);
        }
      }
    } else if (requirement?.execution === 'operator') {
      operator.push(requirement);
      hasExactFields(requirement, OPERATOR_REQUIREMENT_FIELDS, label, errors);
      if (requirement.blocksImplementation !== false) {
        errors.push(`${label} operator intervention must not block implementation.`);
      }
      validateRepositoryFile(requirement.protocolPath, `${label} protocol`, root, errors, readFileSync);
    } else {
      errors.push(`${label} execution must be hosted or operator.`);
    }
  }
  if (hosted.length === 0) errors.push('Release acceptance plan must include hosted implementation gates.');
  if (operator.length === 0) errors.push('Release acceptance plan must explicitly ledger operator gates.');
  for (const scope of RELEASE_ACCEPTANCE_SCOPES) {
    if (!hosted.some((requirement) => requirement.releaseScopes?.includes(scope))) {
      errors.push(`Release scope ${scope} must include at least one hosted gate.`);
    }
    if (!operator.some((requirement) => requirement.releaseScopes?.includes(scope))) {
      errors.push(`Release scope ${scope} must include at least one operator gate.`);
    }
  }
  return { errors, hosted, operator };
}

export function validateHostedReleaseResult(result, plan) {
  const errors = [];
  hasExactFields(result, HOSTED_RESULT_FIELDS, 'Hosted release result', errors);
  if (result?.schemaVersion !== HOSTED_RELEASE_RESULT_SCHEMA_VERSION) {
    errors.push(`Hosted release result schemaVersion must be ${HOSTED_RELEASE_RESULT_SCHEMA_VERSION}.`);
  }
  const requirement = plan?.requirements?.find((item) => item.id === result?.gateId);
  if (!requirement || requirement.execution !== 'hosted') errors.push('Hosted release result gateId must name a hosted plan requirement.');
  if (!COMMIT_PATTERN.test(result?.sourceCommit ?? '')) errors.push('Hosted release result sourceCommit must be candidate C.');
  if (!HOSTED_OUTCOMES.has(result?.outcome)) errors.push('Hosted release result outcome is invalid.');
  for (const field of ['workflow', 'job']) {
    if (!isNonEmptyString(result?.[field]) || !SAFE_REFERENCE_PATTERN.test(result[field])) {
      errors.push(`Hosted release result ${field} must be a bounded safe identifier.`);
    }
  }
  for (const field of ['runId', 'runAttempt']) {
    if (!/^\d+$/.test(result?.[field] ?? '')) errors.push(`Hosted release result ${field} must be numeric text.`);
  }
  return errors;
}

export function createHostedReleaseResult(details, plan) {
  const result = {
    schemaVersion: HOSTED_RELEASE_RESULT_SCHEMA_VERSION,
    gateId: details.gateId,
    sourceCommit: details.sourceCommit,
    outcome: details.outcome,
    workflow: details.workflow,
    runId: details.runId,
    runAttempt: details.runAttempt,
    job: details.job
  };
  const errors = validateHostedReleaseResult(result, plan);
  if (errors.length) throw new Error(`Hosted release result is invalid:\n- ${errors.join('\n- ')}`);
  return result;
}

function validateHashedPath(record, expectedPath, label, expectedContent, errors) {
  hasExactFields(record, HASHED_PATH_FIELDS, label, errors);
  if (record?.path !== expectedPath) errors.push(`${label} path must be ${expectedPath}.`);
  if (!SHA256_PATTERN.test(record?.sha256 ?? '')) errors.push(`${label} SHA-256 is invalid.`);
  if (expectedContent !== undefined && record?.sha256 !== sha256(expectedContent)) {
    errors.push(`${label} SHA-256 does not match frozen candidate C.`);
  }
}

function resolvedEvidenceContent(contents, reference) {
  if (contents instanceof Map) return contents.get(reference);
  return contents?.[reference];
}

function evidenceContentText(value) {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return null;
}

function validateResolvedEvidence(record, requirement, evidence, options, label, errors, hostedEvidenceJobs) {
  const isHosted = requirement?.execution === 'hosted';
  const match = isHosted
    ? HOSTED_EVIDENCE_REFERENCE_PATTERN.exec(evidence?.reference ?? '')
    : OPERATOR_EVIDENCE_REFERENCE_PATTERN.exec(evidence?.reference ?? '');
  if (!match) {
    errors.push(`${label} evidence reference must use the reviewed ${isHosted ? 'run/artifact' : 'evidence-child path'} format.`);
    return;
  }
  if (isHosted && !match[2].startsWith(requirement?.retainedArtifact?.namePrefix ?? '')) {
    errors.push(`${label} evidence artifact must use its frozen plan prefix.`);
  }
  const rawContent = resolvedEvidenceContent(options.evidenceContentByReference, evidence.reference);
  const content = evidenceContentText(rawContent);
  if (content === null) {
    errors.push(`${label} evidence could not be resolved.`);
    return;
  }
  if (evidence.sha256 !== sha256(rawContent)) {
    errors.push(`${label} evidence SHA-256 does not match the resolved bytes.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    errors.push(`${label} evidence must contain valid JSON.`);
    return;
  }
  if (isHosted) {
    for (const error of validateHostedReleaseResult(parsed, options.plan)) {
      errors.push(`${label} hosted evidence: ${error}`);
    }
    if (parsed?.gateId !== record.id) errors.push(`${label} hosted evidence gateId must match the requirement.`);
    const expectedWorkflow = path.basename(requirement.workflowPath, path.extname(requirement.workflowPath));
    if (parsed?.workflow !== expectedWorkflow) {
      errors.push(`${label} hosted evidence workflow must match the frozen requirement.`);
    }
    if (parsed?.job !== requirement.jobId && !parsed?.job?.startsWith(`${requirement.jobId}-`)) {
      errors.push(`${label} hosted evidence job must match the frozen requirement.`);
    }
    if (hostedEvidenceJobs.has(parsed?.job)) {
      errors.push(`${label} hosted evidence jobs must be unique.`);
    }
    hostedEvidenceJobs.add(parsed?.job);
    if (parsed?.runId !== match[1]) errors.push(`${label} hosted evidence runId must match its reference.`);
    if (!match[2].endsWith(`-${parsed?.runId}-${parsed?.runAttempt}`)) {
      errors.push(`${label} hosted evidence artifact name must match its run ID and attempt.`);
    }
    if (parsed?.sourceCommit !== options.candidateCommit) {
      errors.push(`${label} hosted evidence sourceCommit must equal candidate C.`);
    }
    if (parsed?.outcome !== 'success') errors.push(`${label} hosted evidence outcome must be success.`);
    return;
  }
  if (parsed?.sourceCommit !== options.candidateCommit) {
    errors.push(`${label} operator evidence sourceCommit must equal candidate C.`);
  }
  const operatorOutcome = parsed?.outcome ?? parsed?.status;
  if (operatorOutcome !== 'success' && operatorOutcome !== 'passed') {
    errors.push(`${label} operator evidence outcome must be success or passed.`);
  }
  if (parsed?.requirementId !== undefined && parsed.requirementId !== record.id) {
    errors.push(`${label} operator evidence requirementId must match the requirement.`);
  }
}

export function validateReleaseAcceptanceResult(result, options) {
  const errors = [];
  const { plan, candidateCommit, planContent, releaseManifestContent, now = new Date() } = options;
  hasExactFields(result, RESULT_FIELDS, 'Release acceptance result', errors);
  if (result?.schemaVersion !== RELEASE_ACCEPTANCE_RESULT_SCHEMA_VERSION) {
    errors.push(`Release acceptance result schemaVersion must be ${RELEASE_ACCEPTANCE_RESULT_SCHEMA_VERSION}.`);
  }
  if (!COMMIT_PATTERN.test(candidateCommit ?? '') || result?.sourceCommit !== candidateCommit) {
    errors.push('Release acceptance result sourceCommit must equal frozen candidate C.');
  }
  if (!isExactCalendarDate(result?.completedOn)) {
    errors.push('Release acceptance result completedOn must be an exact calendar date.');
  } else if (result.completedOn > now.toISOString().slice(0, 10)) {
    errors.push('Release acceptance result completedOn cannot be in the future.');
  }
  const selectedScopes = validateReleaseScopes(
    result?.releaseScopes,
    'Release acceptance result releaseScopes',
    errors
  );
  validateHashedPath(result?.plan, RELEASE_ACCEPTANCE_PLAN_PATH, 'Release acceptance result plan', planContent, errors);
  validateHashedPath(
    result?.releaseManifest,
    plan?.releaseManifestPath,
    'Release acceptance result release manifest',
    releaseManifestContent,
    errors
  );

  if (!Array.isArray(result?.requirements)) {
    errors.push('Release acceptance result requirements must be an array.');
    return errors;
  }
  // Invalid or missing scope data must never reduce the required evidence set.
  const activeRequirements = selectedScopes === null
    ? plan.requirements
    : requirementsForReleaseScopes(plan, selectedScopes);
  const expectedById = new Map(activeRequirements.map((requirement) => [requirement.id, requirement]));
  const planById = new Map(plan.requirements.map((requirement) => [requirement.id, requirement]));
  const actualIds = new Set();
  for (const record of result.requirements) {
    const label = `Acceptance result requirement ${record?.id ?? 'unknown'}`;
    hasExactFields(record, RESULT_REQUIREMENT_FIELDS, label, errors);
    if (actualIds.has(record?.id)) errors.push(`${label} is duplicated.`);
    actualIds.add(record?.id);
    const requirement = expectedById.get(record?.id);
    if (!requirement) {
      if (planById.has(record?.id)) errors.push(`${label} is not required for the selected release scopes.`);
      else errors.push(`${label} is not in the frozen plan.`);
    }
    if (!RESULT_OUTCOMES.has(record?.outcome)) errors.push(`${label} must pass before external launch.`);
    if (!Array.isArray(record?.evidence) || record.evidence.length === 0) {
      errors.push(`${label} must retain at least one evidence reference.`);
      continue;
    }
    if (requirement?.execution === 'hosted'
      && record.evidence.length !== requirement.retainedArtifact?.requiredResults) {
      errors.push(`${label} must retain exactly ${requirement.retainedArtifact?.requiredResults} evidence result(s).`);
    }
    const evidenceReferences = new Set();
    const hostedEvidenceJobs = new Set();
    for (const evidence of record.evidence) {
      hasExactFields(evidence, RESULT_EVIDENCE_FIELDS, `${label} evidence`, errors);
      if (!EVIDENCE_PROVIDERS.has(evidence?.provider)) errors.push(`${label} evidence provider is invalid.`);
      if (!SAFE_REFERENCE_PATTERN.test(evidence?.reference ?? '')) errors.push(`${label} evidence reference is invalid.`);
      if (evidenceReferences.has(evidence?.reference)) errors.push(`${label} evidence references must be unique.`);
      evidenceReferences.add(evidence?.reference);
      if (!SHA256_PATTERN.test(evidence?.sha256 ?? '')) errors.push(`${label} evidence SHA-256 is invalid.`);
      if (requirement?.execution === 'hosted' && evidence?.provider !== 'github-actions') {
        errors.push(`${label} must reference GitHub Actions evidence.`);
      } else if (requirement?.execution === 'operator' && evidence?.provider !== 'operator-receipt') {
        errors.push(`${label} must reference an operator receipt.`);
      } else if (requirement) {
        validateResolvedEvidence(record, requirement, evidence, options, label, errors, hostedEvidenceJobs);
      }
    }
  }
  const missing = [...expectedById.keys()].filter((id) => !actualIds.has(id));
  if (missing.length) errors.push(`Release acceptance result is missing requirements: ${missing.join(', ')}.`);
  return errors;
}

function listRegularFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listRegularFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function downloadHostedEvidence(reference, match, options, temporaryRoot) {
  if (options.readHostedArtifact) {
    return options.readHostedArtifact({ reference, runId: match[1], artifactName: match[2] });
  }
  const repository = options.environment?.GITHUB_REPOSITORY?.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must identify the source repository before hosted evidence can be downloaded.');
  }
  const target = path.join(temporaryRoot, sha256(reference).slice(0, 24));
  fs.mkdirSync(target, { recursive: true });
  const result = (options.spawnSync ?? spawnSync)('gh', [
    'run', 'download', match[1], '--repo', repository, '--name', match[2], '--dir', target
  ], {
    cwd: options.repositoryRoot ?? repositoryRoot,
    encoding: 'utf8',
    env: options.environment,
    windowsHide: true
  });
  if (result.error || result.status !== 0) throw new Error(`Unable to download hosted evidence ${reference}.`);
  const files = listRegularFiles(target);
  if (files.length !== 1 || path.extname(files[0]).toLowerCase() !== '.json') {
    throw new Error(`Hosted evidence ${reference} must contain exactly one JSON file.`);
  }
  return fs.readFileSync(files[0]);
}

export function resolveReleaseAcceptanceEvidence(result, options = {}) {
  const contents = new Map();
  const errors = [];
  const temporaryRoot = options.temporaryRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-release-evidence-'));
  const ownsTemporaryRoot = options.temporaryRoot === undefined;
  try {
    for (const record of result?.requirements ?? []) {
      for (const evidence of record?.evidence ?? []) {
        const reference = evidence?.reference;
        if (contents.has(reference)) continue;
        try {
          if (evidence?.provider === 'github-actions') {
            const match = HOSTED_EVIDENCE_REFERENCE_PATTERN.exec(reference ?? '');
            if (!match) throw new Error('Hosted evidence reference must use run:<id>/artifact:<name>.');
            contents.set(reference, downloadHostedEvidence(reference, match, options, temporaryRoot));
          } else if (evidence?.provider === 'operator-receipt') {
            const match = OPERATOR_EVIDENCE_REFERENCE_PATTERN.exec(reference ?? '');
            if (!match) throw new Error('Operator evidence reference must use path:quality/physical-results/<file>.json.');
            const content = options.readOperatorEvidence
              ? options.readOperatorEvidence({ reference, path: match[1] })
              : runGit(options.repositoryRoot ?? repositoryRoot, ['show', `${options.evidenceCommit}:${match[1]}`]);
            contents.set(reference, content);
          }
        } catch (error) {
          errors.push(`Acceptance result requirement ${record?.id ?? 'unknown'} evidence could not be resolved: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  } finally {
    if (ownsTemporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  return { contents, errors };
}

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function evidencePathAllowed(relativePath) {
  return relativePath === RELEASE_ACCEPTANCE_RISK_PATH
    || /^quality\/physical-results\/[a-z0-9][a-z0-9._-]*\.json$/.test(relativePath);
}

export function validateEvidenceChildContext(context) {
  const errors = [];
  if (!COMMIT_PATTERN.test(context?.candidateCommit ?? '')) errors.push('Candidate C must be a lowercase 40-character Git SHA.');
  if (!COMMIT_PATTERN.test(context?.evidenceCommit ?? '')) errors.push('Evidence A must be a lowercase 40-character Git SHA.');
  if (context?.candidateCommit === context?.evidenceCommit) errors.push('Evidence A must be separate from candidate C.');
  if (!Array.isArray(context?.parentCommits)
    || context.parentCommits.length !== 1
    || context.parentCommits[0] !== context.candidateCommit) {
    errors.push('Evidence A must have candidate C as its sole parent.');
  }
  if (context?.checkedOutCommit !== context?.evidenceCommit) errors.push('External-launch verification requires checked-out HEAD to equal evidence A.');
  if (typeof context?.worktreeStatus !== 'string' || context.worktreeStatus.trim()) {
    errors.push('External-launch verification requires a clean worktree and index.');
  }
  if (!Array.isArray(context?.changedPaths) || !context.changedPaths.includes(RELEASE_ACCEPTANCE_RISK_PATH)) {
    errors.push(`Evidence A must change ${RELEASE_ACCEPTANCE_RISK_PATH}.`);
  } else {
    const normalized = context.changedPaths.map(normalizedRepositoryPath);
    if (normalized.some((item) => item === null)) errors.push('Evidence A contains an invalid changed path.');
    const unexpected = normalized.filter((item) => item && !evidencePathAllowed(item));
    if (unexpected.length) errors.push(`Evidence A changes non-evidence paths: ${unexpected.join(', ')}.`);
    if (new Set(normalized).size !== normalized.length) errors.push('Evidence A changed-path list contains duplicates.');
  }
  return errors;
}

export function readReleaseAcceptanceGitContext({
  root = repositoryRoot,
  candidateCommit,
  evidenceCommit
}) {
  if (!COMMIT_PATTERN.test(candidateCommit ?? '') || !COMMIT_PATTERN.test(evidenceCommit ?? '')) {
    throw new Error('Both candidate C and evidence A must be lowercase 40-character Git SHAs.');
  }
  const parentRow = runGit(root, ['rev-list', '--parents', '-n', '1', evidenceCommit]).trim().split(/\s+/);
  const context = {
    candidateCommit,
    evidenceCommit,
    parentCommits: parentRow.slice(1),
    checkedOutCommit: runGit(root, ['rev-parse', 'HEAD']).trim(),
    worktreeStatus: runGit(root, ['status', '--porcelain=v1', '--untracked-files=all']),
    changedPaths: runGit(root, ['diff', '--name-only', candidateCommit, evidenceCommit, '--'])
      .split(/\r?\n/)
      .filter(Boolean),
    planContent: runGit(root, ['show', `${candidateCommit}:${RELEASE_ACCEPTANCE_PLAN_PATH}`]),
    releaseManifestContent: runGit(root, ['show', `${candidateCommit}:shared/release.json`]),
    riskManifestContent: runGit(root, ['show', `${evidenceCommit}:${RELEASE_ACCEPTANCE_RISK_PATH}`])
  };
  return { ...context, errors: validateEvidenceChildContext(context) };
}

export function parseReleaseAcceptanceArgs(argv, environment = process.env) {
  const values = {
    command: argv[0] && !argv[0].startsWith('--') ? argv[0] : 'verify',
    candidate: environment.CALIBRATE_RELEASE_CANDIDATE?.trim() || null,
    evidence: environment.CALIBRATE_RELEASE_EVIDENCE?.trim() || null,
    externalLaunch: false,
    gate: null,
    outcome: null,
    output: null,
    workflow: environment.GITHUB_WORKFLOW?.trim() || null,
    runId: environment.GITHUB_RUN_ID?.trim() || null,
    runAttempt: environment.GITHUB_RUN_ATTEMPT?.trim() || null,
    job: environment.GITHUB_JOB?.trim() || null,
    help: false
  };
  let index = values.command === 'verify' && argv[0]?.startsWith('--') ? 0 : 1;
  for (; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') values.help = true;
    else if (option === '--external-launch') values.externalLaunch = true;
    else if (['--candidate', '--evidence', '--gate', '--outcome', '--output', '--workflow', '--run-id', '--run-attempt', '--job'].includes(option)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
      const key = {
        '--candidate': 'candidate',
        '--evidence': 'evidence',
        '--gate': 'gate',
        '--outcome': 'outcome',
        '--output': 'output',
        '--workflow': 'workflow',
        '--run-id': 'runId',
        '--run-attempt': 'runAttempt',
        '--job': 'job'
      }[option];
      values[key] = value;
      index += 1;
    } else throw new Error(`Unknown release acceptance option: ${option}`);
  }
  return values;
}

function loadPlan(root = repositoryRoot) {
  const content = fs.readFileSync(path.join(root, RELEASE_ACCEPTANCE_PLAN_PATH), 'utf8');
  return { content, plan: JSON.parse(content) };
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/release-acceptance.mjs verify
  node scripts/release-acceptance.mjs verify --external-launch --candidate <C> --evidence <A>
  node scripts/release-acceptance.mjs hosted-result --gate <id> --candidate <C> --outcome <success|failure|cancelled|skipped> --output <json>

Candidate C is the exact pull-request head. Evidence A is supplied externally and must be its evidence-only child.
`);
}

export function runReleaseAcceptanceCli(argv = process.argv.slice(2), options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const args = parseReleaseAcceptanceArgs(argv, options.environment ?? process.env);
  if (args.help) {
    printHelp();
    return { help: true };
  }
  if (!['verify', 'hosted-result'].includes(args.command)) throw new Error(`Unknown release acceptance command: ${args.command}`);
  const loaded = loadPlan(root);
  const planValidation = validateReleaseAcceptancePlan(loaded.plan, { repositoryRoot: root });
  if (planValidation.errors.length) {
    throw new Error(`Release acceptance plan is invalid:\n- ${planValidation.errors.join('\n- ')}`);
  }

  if (args.command === 'hosted-result') {
    for (const [name, value] of Object.entries({ gate: args.gate, candidate: args.candidate, outcome: args.outcome, output: args.output })) {
      if (!value) throw new Error(`hosted-result requires --${name}.`);
    }
    const output = normalizedRepositoryPath(args.output);
    if (!output) throw new Error('Hosted result output must stay within the repository workspace.');
    const result = createHostedReleaseResult({
      gateId: args.gate,
      sourceCommit: args.candidate,
      outcome: args.outcome,
      workflow: args.workflow,
      runId: args.runId,
      runAttempt: args.runAttempt,
      job: args.job
    }, loaded.plan);
    const absoluteOutput = path.join(root, output);
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
    fs.writeFileSync(absoluteOutput, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`Wrote sanitized hosted release result for ${args.candidate}: ${output}\n`);
    return { plan: loaded.plan, result, output };
  }

  if (!args.externalLaunch) {
    const riskManifest = JSON.parse(fs.readFileSync(path.join(root, RELEASE_ACCEPTANCE_RISK_PATH), 'utf8'));
    if (Object.hasOwn(riskManifest, RELEASE_ACCEPTANCE_RESULT_PROPERTY)) {
      throw new Error('Candidate C must not contain release acceptance outcomes; record them only in evidence child A.');
    }
    const deferred = planValidation.operator.map((requirement) => requirement.id);
    process.stdout.write('Release acceptance implementation contract is valid.\n');
    process.stdout.write(`Operator gates deferred until external launch: ${deferred.join(', ')}.\n`);
    return { plan: loaded.plan, deferred };
  }

  if (!args.candidate || !args.evidence) {
    throw new Error('External-launch verification requires --candidate C and --evidence A.');
  }
  const context = readReleaseAcceptanceGitContext({ root, candidateCommit: args.candidate, evidenceCommit: args.evidence });
  const frozenPlan = JSON.parse(context.planContent);
  const frozenPlanValidation = validateReleaseAcceptancePlan(frozenPlan, {
    repositoryRoot: root,
    readFileSync: (file, encoding) => {
      const relative = path.relative(root, file).replaceAll('\\', '/');
      if (relative === RELEASE_ACCEPTANCE_PLAN_PATH) return context.planContent;
      if (relative === frozenPlan.releaseManifestPath) return context.releaseManifestContent;
      return fs.readFileSync(file, encoding);
    }
  });
  const riskManifest = JSON.parse(context.riskManifestContent);
  const result = riskManifest?.[RELEASE_ACCEPTANCE_RESULT_PROPERTY];
  const resolvedEvidence = resolveReleaseAcceptanceEvidence(result, {
    repositoryRoot: root,
    evidenceCommit: args.evidence,
    environment: options.environment ?? process.env,
    spawnSync: options.spawnSync,
    readHostedArtifact: options.readHostedArtifact,
    readOperatorEvidence: options.readOperatorEvidence,
    temporaryRoot: options.temporaryRoot
  });
  const resultErrors = validateReleaseAcceptanceResult(result, {
    plan: frozenPlan,
    candidateCommit: args.candidate,
    planContent: context.planContent,
    releaseManifestContent: context.releaseManifestContent,
    evidenceContentByReference: resolvedEvidence.contents,
    now: options.now ?? new Date()
  });
  const errors = [
    ...context.errors,
    ...frozenPlanValidation.errors,
    ...resolvedEvidence.errors,
    ...resultErrors
  ];
  if (errors.length) throw new Error(`External launch acceptance is invalid:\n- ${errors.join('\n- ')}`);
  process.stdout.write(`External launch evidence is valid for candidate ${args.candidate} via evidence child ${args.evidence}.\n`);
  return { candidate: args.candidate, evidence: args.evidence, result };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runReleaseAcceptanceCli();
  } catch (error) {
    console.error(`[release-acceptance] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
