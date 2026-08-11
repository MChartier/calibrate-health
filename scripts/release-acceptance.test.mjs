/**
 * Exercises release acceptance behavior and regression boundaries.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION,
  RELEASE_ACCEPTANCE_PLAN_PATH,
  createHostedReleaseResult,
  parseReleaseAcceptanceArgs,
  resolveReleaseAcceptanceEvidence,
  validateEvidenceChildContext,
  validateHostedReleaseResult,
  validateReleaseAcceptancePlan,
  validateReleaseAcceptanceResult
} from './release-acceptance.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryPlanContent = fs.readFileSync(path.join(repositoryRoot, RELEASE_ACCEPTANCE_PLAN_PATH), 'utf8');
const repositoryPlan = JSON.parse(repositoryPlanContent);
const manifestContent = fs.readFileSync(path.join(repositoryRoot, 'shared/release.json'), 'utf8');

/** Build deterministic digest for regression coverage. */
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Build deterministic workflow fixture for regression coverage. */
function workflowFixture(plan, workflowPath, pinned = true) {
  const jobs = plan.requirements.filter((requirement) => requirement.workflowPath === workflowPath);
  return `name: fixture
on:
  pull_request:
jobs:
${jobs.map((requirement) => `  ${requirement.jobId}:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${pinned ? RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION : '${{ github.sha }}'}
      - name: Gate
        run: ${requirement.command}
${requirement.retainedArtifact ? `      - name: Record candidate
        run: node scripts/release-acceptance.mjs hosted-result --candidate "${RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION}"
      - name: Upload
        uses: actions/upload-artifact@v4
        with:
          name: ${requirement.retainedArtifact.namePrefix}\${{ github.run_id }}
          retention-days: ${requirement.retainedArtifact.retentionDays}
` : ''}`).join('')}`;
}

/** Build deterministic plan read fixture for regression coverage. */
function planReadFixture(plan, options = {}) {
  const protocolPaths = new Set([
    plan.protocolPath,
    ...plan.requirements.filter((item) => item.execution === 'operator').map((item) => item.protocolPath)
  ]);
  const workflowSources = new Map(
    [...new Set(plan.requirements.filter((item) => item.execution === 'hosted').map((item) => item.workflowPath))]
      .map((workflowPath) => [workflowPath, workflowFixture(plan, workflowPath, options.unpinned !== workflowPath)])
  );
  for (const workflowPath of plan.checkoutWorkflows) {
    if (!workflowSources.has(workflowPath)) {
      workflowSources.set(workflowPath, `name: fixture
on:
  pull_request:
jobs:
  fixture:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${options.unpinned === workflowPath ? '${{ github.sha }}' : RELEASE_ACCEPTANCE_CHECKOUT_EXPRESSION}
`);
    }
  }
  return (absolutePath) => {
    const relative = path.relative(repositoryRoot, absolutePath).replaceAll('\\', '/');
    if (workflowSources.has(relative)) return workflowSources.get(relative);
    if (protocolPaths.has(relative)) return '# Candidate C\n';
    if (relative === plan.releaseManifestPath) return manifestContent;
    if (relative === plan.releaseNotesPath) return '# release notes\n';
    throw Object.assign(new Error(`missing fixture ${relative}`), { code: 'ENOENT' });
  };
}

/** Build deterministic valid plan for regression coverage. */
function validPlan() {
  return structuredClone(repositoryPlan);
}

/** Build deterministic valid external fixture for regression coverage. */
function validExternalFixture(plan = validPlan()) {
  const evidenceContentByReference = new Map();
  const requirements = plan.requirements.map((requirement) => {
    const requiredResults = requirement.execution === 'hosted'
      ? requirement.retainedArtifact.requiredResults
      : 1;
    const evidence = Array.from({ length: requiredResults }, (_, index) => {
      const isHosted = requirement.execution === 'hosted';
      const matrixName = requiredResults > 1 ? (index === 0 ? 'root-' : 'backend-') : '';
      const artifactSeparator = requirement.retainedArtifact?.namePrefix.endsWith('-') ? '' : '-';
      const reference = isHosted
        ? `run:123/artifact:${requirement.retainedArtifact.namePrefix}${artifactSeparator}${matrixName}123-1`
        : `path:quality/physical-results/${requirement.id}.json`;
      const payload = isHosted
        ? createHostedReleaseResult({
            gateId: requirement.id,
            sourceCommit: 'a'.repeat(40),
            outcome: 'success',
            workflow: path.basename(requirement.workflowPath, path.extname(requirement.workflowPath)),
            runId: '123',
            runAttempt: '1',
            job: requiredResults > 1 ? `${requirement.jobId}-${matrixName.slice(0, -1)}` : requirement.jobId
          }, plan)
        : {
            requirementId: requirement.id,
            sourceCommit: 'a'.repeat(40),
            status: 'passed'
          };
      const content = `${JSON.stringify(payload)}\n`;
      evidenceContentByReference.set(reference, content);
      return {
        provider: isHosted ? 'github-actions' : 'operator-receipt',
        reference,
        sha256: digest(content)
      };
    });
    return { id: requirement.id, outcome: 'passed', evidence };
  });
  return {
    result: {
      schemaVersion: 1,
      sourceCommit: 'a'.repeat(40),
      completedOn: '2026-08-09',
      plan: {
        path: RELEASE_ACCEPTANCE_PLAN_PATH,
        sha256: digest(repositoryPlanContent)
      },
      releaseManifest: {
        path: plan.releaseManifestPath,
        sha256: digest(manifestContent)
      },
      requirements
    },
    evidenceContentByReference
  };
}

/** Build deterministic external validation options for regression coverage. */
function externalValidationOptions(plan, evidenceContentByReference, now = '2026-08-10T00:00:00.000Z') {
  return {
    plan,
    candidateCommit: 'a'.repeat(40),
    planContent: repositoryPlanContent,
    releaseManifestContent: manifestContent,
    evidenceContentByReference,
    now: new Date(now)
  };
}

test('static plan contains requirements without concrete commits or outcomes', () => {
  const plan = validPlan();
  const result = validateReleaseAcceptancePlan(plan, {
    repositoryRoot,
    readFileSync: planReadFixture(plan)
  });

  assert.deepEqual(result.errors, []);
  assert.ok(result.hosted.length > 0);
  assert.ok(result.operator.length > 0);
  assert.ok(result.operator.every((item) => !item.blocksImplementation && item.blocksExternalLaunch));
});

test('static plan rejects self-referential candidate data and result fields', () => {
  const plan = validPlan();
  plan.candidateCommit = 'a'.repeat(40);
  plan.requirements[0].outcome = 'passed';

  const result = validateReleaseAcceptancePlan(plan, {
    repositoryRoot,
    readFileSync: planReadFixture(plan)
  });

  assert.ok(result.errors.some((error) => error.includes('unexpected fields: candidateCommit')));
  assert.ok(result.errors.some((error) => error.includes('result field outcome is forbidden')));
  assert.ok(result.errors.some((error) => error.includes('concrete candidate or evidence commit')));
});

test('operator intervention remains non-blocking for implementation and blocking for launch', () => {
  const plan = validPlan();
  const operator = plan.requirements.find((item) => item.execution === 'operator');
  operator.blocksImplementation = true;
  operator.blocksExternalLaunch = false;

  const result = validateReleaseAcceptancePlan(plan, {
    repositoryRoot,
    readFileSync: planReadFixture(plan)
  });

  assert.ok(result.errors.some((error) => error.includes('must not block implementation')));
  assert.ok(result.errors.some((error) => error.includes('must block external launch')));
});

test('every checkout in a declared pull-request workflow must pin candidate C', () => {
  const plan = validPlan();
  const unpinned = plan.checkoutWorkflows[0];
  const result = validateReleaseAcceptancePlan(plan, {
    repositoryRoot,
    readFileSync: planReadFixture(plan, { unpinned })
  });

  assert.ok(result.errors.includes(`${unpinned} has a checkout that is not pinned to candidate C.`));
});

test('hosted summaries bind a reviewed gate to exact candidate C without raw output', () => {
  const plan = validPlan();
  const hosted = plan.requirements.find((item) => item.execution === 'hosted');
  const result = createHostedReleaseResult({
    gateId: hosted.id,
    sourceCommit: 'a'.repeat(40),
    outcome: 'success',
    workflow: 'Builds',
    runId: '123',
    runAttempt: '2',
    job: hosted.jobId
  }, plan);

  assert.equal(result.sourceCommit, 'a'.repeat(40));
  assert.deepEqual(validateHostedReleaseResult(result, plan), []);
  assert.equal(JSON.stringify(result).includes(repositoryRoot), false);

  result.sourceCommit = 'short';
  assert.ok(validateHostedReleaseResult(result, plan).some((error) => error.includes('candidate C')));
});

test('external launch requires resolved, content-addressed results for every frozen requirement', () => {
  const plan = validPlan();
  const { result, evidenceContentByReference } = validExternalFixture(plan);

  assert.deepEqual(validateReleaseAcceptanceResult(
    result,
    externalValidationOptions(plan, evidenceContentByReference)
  ), []);

  result.requirements.pop();
  assert.ok(validateReleaseAcceptanceResult(
    result,
    externalValidationOptions(plan, evidenceContentByReference)
  ).some((error) => error.includes('missing requirements')));
});

test('external launch accepts evidence completed on the verifier UTC date', () => {
  const plan = validPlan();
  const { result, evidenceContentByReference } = validExternalFixture(plan);

  assert.deepEqual(validateReleaseAcceptanceResult(
    result,
    externalValidationOptions(plan, evidenceContentByReference, '2026-08-09T00:00:01.000Z')
  ), []);
});

test('external launch rejects normalized impossible completion dates', () => {
  const plan = validPlan();
  const { result, evidenceContentByReference } = validExternalFixture(plan);
  result.completedOn = '2026-02-31';

  const errors = validateReleaseAcceptanceResult(
    result,
    externalValidationOptions(plan, evidenceContentByReference)
  );

  assert.ok(errors.some((error) => error.includes('exact calendar date')));
});

test('operator results cannot be substituted with hosted evidence', () => {
  const plan = validPlan();
  const { result, evidenceContentByReference } = validExternalFixture(plan);
  const operator = result.requirements.find((record) => (
    plan.requirements.find((requirement) => requirement.id === record.id)?.execution === 'operator'
  ));
  operator.evidence[0].provider = 'github-actions';

  const errors = validateReleaseAcceptanceResult(
    result,
    externalValidationOptions(plan, evidenceContentByReference)
  );

  assert.ok(errors.some((error) => error.includes('operator receipt')));
});

test('external launch rejects missing, tampered, and candidate-mismatched evidence bytes', () => {
  const plan = validPlan();
  const missing = validExternalFixture(plan);
  const hosted = missing.result.requirements.find((record) => record.id === 'hosted-exported-web-e2e');
  missing.evidenceContentByReference.delete(hosted.evidence[0].reference);
  assert.ok(validateReleaseAcceptanceResult(
    missing.result,
    externalValidationOptions(plan, missing.evidenceContentByReference)
  ).some((error) => error.includes('could not be resolved')));

  const tampered = validExternalFixture(plan);
  const tamperedHosted = tampered.result.requirements.find((record) => record.id === 'hosted-exported-web-e2e');
  tampered.evidenceContentByReference.set(tamperedHosted.evidence[0].reference, '{}\n');
  assert.ok(validateReleaseAcceptanceResult(
    tampered.result,
    externalValidationOptions(plan, tampered.evidenceContentByReference)
  ).some((error) => error.includes('SHA-256 does not match')));

  const mismatched = validExternalFixture(plan);
  const mismatchedHosted = mismatched.result.requirements.find((record) => record.id === 'hosted-exported-web-e2e');
  const reference = mismatchedHosted.evidence[0].reference;
  const payload = JSON.parse(mismatched.evidenceContentByReference.get(reference));
  payload.sourceCommit = 'c'.repeat(40);
  const content = `${JSON.stringify(payload)}\n`;
  mismatched.evidenceContentByReference.set(reference, content);
  mismatchedHosted.evidence[0].sha256 = digest(content);
  assert.ok(validateReleaseAcceptanceResult(
    mismatched.result,
    externalValidationOptions(plan, mismatched.evidenceContentByReference)
  ).some((error) => error.includes('sourceCommit must equal candidate C')));

  const wrongRun = validExternalFixture(plan);
  const wrongRunHosted = wrongRun.result.requirements.find((record) => record.id === 'hosted-exported-web-e2e');
  const wrongRunReference = wrongRunHosted.evidence[0].reference;
  const wrongRunPayload = JSON.parse(wrongRun.evidenceContentByReference.get(wrongRunReference));
  wrongRunPayload.runId = '456';
  const wrongRunContent = `${JSON.stringify(wrongRunPayload)}\n`;
  wrongRun.evidenceContentByReference.set(wrongRunReference, wrongRunContent);
  wrongRunHosted.evidence[0].sha256 = digest(wrongRunContent);
  assert.ok(validateReleaseAcceptanceResult(
    wrongRun.result,
    externalValidationOptions(plan, wrongRun.evidenceContentByReference)
  ).some((error) => error.includes('runId must match its reference')));
});

test('matrix-hosted requirements retain every reviewed result exactly once', () => {
  const plan = validPlan();
  const { result, evidenceContentByReference } = validExternalFixture(plan);
  const dependency = result.requirements.find((record) => record.id === 'hosted-dependency-audit');
  dependency.evidence.pop();

  const errors = validateReleaseAcceptanceResult(
    result,
    externalValidationOptions(plan, evidenceContentByReference)
  );
  assert.ok(errors.some((error) => error.includes('exactly 2 evidence result')));

  const duplicateJob = validExternalFixture(plan);
  const duplicateDependency = duplicateJob.result.requirements.find((record) => record.id === 'hosted-dependency-audit');
  const [rootEvidence, backendEvidence] = duplicateDependency.evidence;
  const rootPayload = duplicateJob.evidenceContentByReference.get(rootEvidence.reference);
  duplicateJob.evidenceContentByReference.set(backendEvidence.reference, rootPayload);
  backendEvidence.sha256 = digest(rootPayload);
  assert.ok(validateReleaseAcceptanceResult(
    duplicateJob.result,
    externalValidationOptions(plan, duplicateJob.evidenceContentByReference)
  ).some((error) => error.includes('hosted evidence jobs must be unique')));
});

test('evidence resolver retrieves exact hosted artifacts and evidence-child JSON paths', () => {
  const plan = validPlan();
  const { result, evidenceContentByReference } = validExternalFixture(plan);
  const hostedReferences = [];
  const operatorPaths = [];
  const resolved = resolveReleaseAcceptanceEvidence(result, {
    evidenceCommit: 'b'.repeat(40),
    temporaryRoot: repositoryRoot,
    readHostedArtifact: ({ reference }) => {
      hostedReferences.push(reference);
      return evidenceContentByReference.get(reference);
    },
    readOperatorEvidence: ({ reference, path: evidencePath }) => {
      operatorPaths.push(evidencePath);
      return evidenceContentByReference.get(reference);
    }
  });

  assert.deepEqual(resolved.errors, []);
  assert.equal(resolved.contents.size, evidenceContentByReference.size);
  assert.equal(hostedReferences.length, plan.requirements.filter((item) => item.execution === 'hosted')
    .reduce((count, item) => count + item.retainedArtifact.requiredResults, 0));
  assert.ok(operatorPaths.every((evidencePath) => evidencePath.startsWith('quality/physical-results/')));
});

test('evidence A must be a clean evidence-only child whose sole parent is C', () => {
  const valid = {
    candidateCommit: 'a'.repeat(40),
    evidenceCommit: 'b'.repeat(40),
    parentCommits: ['a'.repeat(40)],
    checkedOutCommit: 'b'.repeat(40),
    worktreeStatus: '',
    changedPaths: ['quality/risk-evidence.json', 'quality/physical-results/galaxy.json']
  };
  assert.deepEqual(validateEvidenceChildContext(valid), []);

  const invalid = {
    ...valid,
    parentCommits: ['c'.repeat(40), 'a'.repeat(40)],
    worktreeStatus: ' M package.json',
    changedPaths: [...valid.changedPaths, 'mobile/app.json']
  };
  const errors = validateEvidenceChildContext(invalid);
  assert.ok(errors.some((error) => error.includes('sole parent')));
  assert.ok(errors.some((error) => error.includes('clean worktree')));
  assert.ok(errors.some((error) => error.includes('non-evidence paths')));
});

test('CLI parsing keeps candidate C and evidence A external', () => {
  assert.deepEqual(parseReleaseAcceptanceArgs([
    'verify',
    '--external-launch',
    '--candidate', 'a'.repeat(40),
    '--evidence', 'b'.repeat(40)
  ], {}), {
    command: 'verify',
    candidate: 'a'.repeat(40),
    evidence: 'b'.repeat(40),
    externalLaunch: true,
    gate: null,
    outcome: null,
    output: null,
    workflow: null,
    runId: null,
    runAttempt: null,
    job: null,
    help: false
  });
});
