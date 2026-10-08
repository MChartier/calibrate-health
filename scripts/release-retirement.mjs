import assert from 'node:assert/strict';
import { hash, SHA } from './release-plan.mjs';
import { readAsset, putAsset, verifyRetirement } from './release-journal.mjs';

/** Complete known phases plus absence of durable provider intent are both required. */
function retirementReason({ release, run, jobs, jobsTotal, plan, candidate, pull, currentSource, candidateValidated, completionExists, candidateRefAbsent }) {
  assert(release.draft && release.author?.login === 'github-actions[bot]', 'Unverified journal ownership.');
  assert(release.assets.every(a => ['plan.json', 'configuration.json', 'candidate.json', 'retirement.json', 'retirement-complete.json'].includes(a.name)),
    'Provider intent, partial publication or unknown assets must remain recoverable.');
  const source = plan?.source ?? release.target_commitish;
  assert(SHA.test(source) && String(run.id) === release.tag_name.split('/').at(-1) && run.head_sha === source &&
    run.head_branch === 'master' && run.event === 'workflow_run' && run.path === '.github/workflows/unified-release-handler.yml', 'Workflow/source ownership differs.');
  assert(run.status === 'completed' && ['failure', 'cancelled', 'timed_out'].includes(run.conclusion), 'Active or nonterminal run cannot retire.');
  const planJob = 'Inspect immutable inputs and verified successful receipts';
  const executeJob = 'Run only the verified selected stages';
  const terminal = ['success', 'failure', 'cancelled', 'timed_out', 'skipped'];
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 && Array.isArray(jobs) && jobs.length === jobsTotal &&
    jobs.every(j => j.status === 'completed' && Number.isSafeInteger(j.run_attempt) && j.run_attempt >= 1 &&
      j.run_attempt <= run.run_attempt && [planJob, executeJob].includes(j.name) && terminal.includes(j.conclusion)),
  'All-attempt job evidence cannot rule out provider activity.');
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    const phases = jobs.filter(j => j.run_attempt === attempt);
    const planning = phases.find(j => j.name === planJob), execution = phases.find(j => j.name === executeJob);
    assert(phases.length === 2 && planning && execution && execution.conclusion !== 'success' &&
      (execution.conclusion === 'skipped' || planning.conclusion === 'success'),
    'All-attempt job evidence has missing, duplicated or inconsistent phases.');
  }
  // A cancelled execute may have stopped after journal allocation, before plan persistence.
  // It may also have reached a provider: every provider start/adoption must first persist an
  // op.* intent. The asset allowlist above rejects that intent even when no receipt exists.
  // A successful execute without completion is contradictory, not proof of no publication.
  assert(!completionExists, 'Completed publication exists.');
  assert(!pull?.auto_merge, 'Queued merge must be reconciled.');
  if (!plan) {
    assert(candidateRefAbsent === true && !candidate && !pull && release.assets.every(a => ['configuration.json', 'retirement.json', 'retirement-complete.json'].includes(a.name)), 'Missing plan with candidate work or unverified branch absence.');
    return 'Interrupted before immutable plan persistence.';
  }
  assert(plan.runId === String(run.id), 'Plan/run identity differs.');
  if (pull) {
    assert(candidate && candidateValidated && pull.head.sha === candidate.commit && pull.user?.login === 'github-actions[bot]' &&
      pull.head.ref === `release/unified-${plan.runId}` && pull.base.ref === 'master' &&
      pull.head.repo?.full_name === plan.repository && pull.base.repo?.full_name === plan.repository, 'Candidate PR ownership/tree differs.');
    if (pull.merged) return null; // Never retire a merged Calibrate candidate, even after master advances.
    if (pull.state === 'closed') return 'Owned candidate PR closed without merge.';
  }
  if (currentSource !== source) return 'Protected source advanced before publication.';
  if (!pull && run.conclusion === 'cancelled') return 'Cancelled before candidate publication.';
  return null; // CI/review waits and transient failures are retryable, regardless of age.
}

/** Caller holds the workflow-wide lock. Every mutation has exact identity checks and readback. */
export async function retireCandidate(transport, runId, inspect, closePull) {
  assert(/^[1-9]\d*$/.test(runId), 'Invalid retirement run ID.');
  const matches = (await transport.releases()).filter(r => [`candidate/unified/${runId}`, `abandoned/unified/${runId}`].includes(r.tag_name));
  assert(matches.length <= 1, 'Duplicate retirement identity.');
  if (!matches.length) return false;
  let release = matches[0];
  if (release.tag_name.startsWith('abandoned/')) {
    const record = await verifyRetirement(transport, release, false);
    const observation = await inspect(release);
    retirementReason({ ...observation, release });
    assert(!observation.pull?.merged && observation.pull?.state !== 'open', 'Retired candidate PR is not closed and unmerged.');
    await putAsset(transport, release, 'retirement-complete.json', { retirementHash: hash(record) });
    await verifyRetirement(transport, await transport.release(release.id));
    return true;
  }
  let observation = await inspect(release);
  let reason = retirementReason({ ...observation, release });
  let record = await readAsset(transport, release, 'retirement.json');
  if (!reason && !record) return false;
  assert(!observation.pull?.merged, 'Merged candidate cannot complete retirement.');
  for (const a of release.assets) await readAsset(transport, release, a.name);
  record ??= { schema: 1, runId, releaseId: release.id, source: observation.plan?.source ?? release.target_commitish,
    reason, assets: release.assets.map(({ id, name, digest, size }) => ({ id, name, digest, size })) };
  assert(record.runId === runId && record.releaseId === release.id && record.source === (observation.plan?.source ?? release.target_commitish), 'Retirement intent conflicts.');
  await putAsset(transport, release, 'retirement.json', record);
  release = await transport.release(release.id);
  observation = await inspect(release);
  retirementReason({ ...observation, release });
  assert(!observation.pull?.merged, 'Candidate merged after retirement intent; reconcile without cleanup.');
  if (observation.pull?.state === 'open') {
    await closePull(observation.pull.number, observation.candidate.commit);
    const closed = await inspect(await transport.release(release.id));
    assert(closed.pull?.state === 'closed' && !closed.pull.merged && closed.pull.head.sha === observation.candidate.commit,
      'Candidate closure readback is uncertain.');
  }
  release = await transport.release(release.id);
  const finalObservation = await inspect(release);
  retirementReason({ ...finalObservation, release });
  assert(!finalObservation.pull?.merged, 'Candidate merged during cleanup; reconcile without retirement.');
  await transport.rename(release.id, `abandoned/unified/${runId}`);
  release = await transport.release(release.id);
  await verifyRetirement(transport, release, false);
  await putAsset(transport, release, 'retirement-complete.json', { retirementHash: hash(record) });
  await verifyRetirement(transport, await transport.release(release.id));
  assert(!(await transport.releases()).some(r => r.tag_name === `candidate/unified/${runId}`), 'Cleanup still blocks the next run.');
  return true;
}

export async function reconcileCandidates(transport, currentRunId, inspect, closePull) {
  for (const release of await transport.releases()) {
    if (!/^(candidate|abandoned)\/unified\/\d+$/.test(release.tag_name)) continue;
    const runId = release.tag_name.split('/').at(-1);
    if (runId !== currentRunId) assert(await retireCandidate(transport, runId, inspect, closePull), 'A retryable or unresolved candidate blocks this run.');
  }
}
