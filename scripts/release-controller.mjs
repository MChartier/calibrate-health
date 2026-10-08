import assert from 'node:assert/strict';
import { hash, SHA, planRelease, verifyPlan } from './release-plan.mjs';
import { readAsset } from './release-journal.mjs';
import { nativeCandidateRequest, verifyExecutionSource } from './release-source.mjs';

/** The manual run, not a branch name or a user-supplied source string, owns the plan. */
export function manualReleaseContext(run, repository) {
  assert(run.repository?.full_name === repository && run.head_repository?.full_name === repository &&
    run.event === 'workflow_dispatch' && run.path === '.github/workflows/unified-release.yml' &&
    run.head_branch === 'master' && SHA.test(run.head_sha) && run.actor?.type === 'User' &&
    run.triggering_actor?.type === 'User' && Number.isSafeInteger(run.id) && run.id > 0 &&
    Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'Unified release requires an exact human-dispatched protected-master run.');
  return { runId: String(run.id), repository, source: run.head_sha, createdAt: run.created_at };
}

/** Only the protected workflow_run handler can own mutable release state. */
export function protectedReleaseContext({ request, handler, event, repository, workflowSha }) {
  const manual = manualReleaseContext(request, repository);
  assert(request.status === 'completed' && request.conclusion === 'success' && event.action === 'completed' &&
    event.workflow_run?.id === request.id && event.workflow_run?.run_attempt === request.run_attempt &&
    event.workflow_run?.head_sha === manual.source && event.repository?.full_name === repository &&
    handler.event === 'workflow_run' && handler.path === '.github/workflows/unified-release-handler.yml' &&
    handler.repository?.full_name === repository && handler.head_repository?.full_name === repository &&
    handler.head_branch === 'master' && handler.head_sha === manual.source && workflowSha === manual.source &&
    Number.isSafeInteger(handler.id) && handler.id > 0 && Number.isSafeInteger(handler.run_attempt) && handler.run_attempt > 0,
  'Unified handler is not bound to the exact successful protected manual request.');
  return { ...manual, requestRunId: manual.runId, requestRunAttempt: request.run_attempt,
    runId: String(handler.id), createdAt: handler.created_at };
}

/** Read-only planning and journal recovery. No candidate/provider writes occur in this phase. */
export async function prepareUnifiedPlan({ context, configuration, serverConfiguration, journal, candidates, snapshot,
  readVersions, loadBaselines, bump = 'patch' }) {
  assert(journal.runId === context.runId, 'Manual run and journal differ.');
  const existing = await journal.release();
  if (existing) {
    assert(existing.author?.login === 'github-actions[bot]' && existing.draft && existing.target_commitish === context.source,
      'Existing journal ownership/source differs.');
    const plan = await readAsset(journal.transport, existing, 'plan.json');
    if (plan) {
      verifyPlan(plan);
      assert(plan.runId === context.runId && plan.repository === context.repository && plan.source === context.source &&
        plan.configuration === hash(configuration) && plan.serverConfiguration === hash(serverConfiguration) && plan.serverBump === bump,
      'Retry must retain its original source and configuration.');
      assert.deepEqual(await readAsset(journal.transport, existing, 'configuration.json'), { schema: 1, digest: hash(configuration) },
        'Retained external build configuration differs.');
      assert.deepEqual(await snapshot(plan.source, plan.profile), plan.inputs, 'Retained inputs differ from immutable source objects.');
      return { plan, resumed: true };
    }
    assert(existing.assets.every(asset => asset.name === 'configuration.json') && existing.assets.length <= 1,
      'Interrupted planning has unexplained retained assets.');
    if (existing.assets.length) assert.deepEqual(await readAsset(journal.transport, existing, 'configuration.json'), { schema: 1, digest: hash(configuration) },
      'Interrupted planning must retain its original external configuration.');
  }
  const source = await candidates.master();
  assert.equal(source, context.source, 'Manual source is stale; no new plan or provider request is permitted.');
  const [inputs, versions, receipts] = await Promise.all([snapshot(source, configuration.profile), readVersions(source), loadBaselines()]);
  assert.equal(await candidates.master(), source, 'Protected master advanced during read-only planning.');
  const plan = planRelease({ ...context, currentSource: source, inputs, ...versions, receipts, bump,
    configuration: { profile: configuration.profile, digest: hash(configuration), serverDigest: hash(serverConfiguration) } });
  return { plan, resumed: false };
}

/** Called only in the candidate writer job, after a validated immutable plan has selected work. */
export async function prepareUnifiedSource({ root, context, plan, configuration, journal, candidates,
  verifySource = verifyExecutionSource }) {
  verifyPlan(plan);
  assert(plan.source === context.source && plan.runId === context.runId && plan.configuration === hash(configuration),
    'Candidate writer received a different manual plan.');
  if (plan.noChange) return { source: plan.source, status: 'no-change' };
  const existing = await journal.release();
  if (existing?.tag_name.startsWith('completed/')) {
    assert.deepEqual(await readAsset(journal.transport, existing, 'plan.json'), plan, 'Completed plan differs.');
  } else {
    await journal.create(plan.source);
    // Retain only its digest: external account/project/endpoint values must not
    // become public journal assets. A retry must supply the same external values.
    await journal.put('configuration.json', { schema: 1, digest: hash(configuration) });
    await journal.put('plan.json', plan);
  }
  const request = nativeCandidateRequest(plan);
  let merge = await readAsset(journal.transport, await journal.release(), 'merge.json');
  if (request && !merge) {
    const candidate = await candidates.prepare({ request, journal, createdAt: context.createdAt });
    merge = await candidates.finalize({ request, candidate, journal });
  }
  const source = merge?.source ?? plan.source;
  await verifySource({ root, plan, source, merge });
  return { source, status: 'prepared', planDigest: plan.digest };
}

/** Exact originating authority shared by the isolated native and OTA worker jobs. */
export async function verifySelectedWorkerRequest({ root, repository, run, workflowSha, inputs, journal, api,
  configuration, workflow, stageKey, identityFor, verifySource = verifyExecutionSource }) {
  assert(['native-ios-release.yml', 'unified-ota-release.yml'].includes(workflow) && typeof identityFor === 'function', 'Unknown selected worker authority.');
  assert(run.path === `.github/workflows/${workflow}` && run.event === 'workflow_dispatch' &&
    run.repository?.full_name === repository && run.head_repository?.full_name === repository &&
    run.head_branch === 'master' && run.head_sha === workflowSha && inputs.source_commit === workflowSha && SHA.test(workflowSha) &&
    run.actor?.login === 'github-actions[bot]' && (run.triggering_actor?.login === 'github-actions[bot]' ||
      run.run_attempt > 1 && run.triggering_actor?.type === 'User'),
  'Selected worker requires an exact Actions-dispatched protected source.');
  assert(inputs.parent_run_id === journal.runId, 'Selected worker journal differs.');
  const release = await journal.assertActive();
  assert(release, 'The originating release journal is missing.');
  const plan = verifyPlan(await readAsset(journal.transport, release, 'plan.json'));
  assert(plan.runId === journal.runId && plan.repository === repository && plan.source === release.target_commitish &&
    plan.digest === inputs.plan_digest && plan.profile === inputs.profile && hash(configuration) === plan.configuration,
  'Selected worker differs from its retained source, profile or external configuration.');
  const prefix = `/repos/${repository}/actions/runs`;
  const parent = await api(`${prefix}/${plan.runId}`);
  assert(parent.path === '.github/workflows/unified-release-handler.yml' && parent.event === 'workflow_run' &&
    parent.repository?.full_name === repository && parent.head_repository?.full_name === repository &&
    parent.head_branch === 'master' && parent.head_sha === plan.source && String(parent.id) === plan.runId &&
    !['cancelled', 'timed_out'].includes(parent.conclusion), 'Originating release handler is unrelated or cancelled.');
  const manual = await api(`${prefix}/${plan.requestRunId}/attempts/${plan.requestRunAttempt}`);
  const authority = manualReleaseContext(manual, repository);
  assert(authority.source === plan.source && authority.runId === plan.requestRunId && manual.run_attempt === plan.requestRunAttempt &&
    manual.status === 'completed' && manual.conclusion === 'success', 'Original manual release authority differs.');
  await verifySource({ root, plan, source: workflowSha, merge: await readAsset(journal.transport, release, 'merge.json') });
  const identity = identityFor({ plan, source: workflowSha });
  const operation = await journal.operation(stageKey);
  assert(run.display_title === identity.title && operation?.binding === hash(identity) &&
    ['intent', 'running'].includes(operation.status) &&
    (operation.status !== 'running' || operation.ids.at(-1) === String(run.id)), 'Selected worker lacks its exact durable originating intent.');
  return { plan, source: workflowSha };
}
