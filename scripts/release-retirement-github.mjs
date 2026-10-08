import assert from 'node:assert/strict';
import { readAsset } from './release-journal.mjs';
import { verifyPlan, SHA } from './release-plan.mjs';
import { nativeCandidateRequest } from './release-source.mjs';

/** Read every job attempt before allowing the separate retirement policy to act. */
export function githubRetirement({ repository, api, transport, candidates }) {
  const prefix = `/repos/${repository}`;
  async function inspect(release) {
    const runId = release.tag_name.split('/').at(-1);
    assert(/^[1-9]\d*$/.test(runId), 'Unknown candidate run identity.');
    const run = await api(`${prefix}/actions/runs/${runId}`);
    assert(run.repository?.full_name === repository && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 && run.run_attempt <= 1000,
      'Incomplete workflow ownership/attempt inventory.');
    const jobs = [];
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const attemptRun = await api(`${prefix}/actions/runs/${runId}/attempts/${attempt}`);
      assert(attemptRun.id === run.id && attemptRun.run_attempt === attempt && attemptRun.status === 'completed' &&
        attemptRun.head_sha === run.head_sha && attemptRun.path === run.path && attemptRun.event === run.event,
      'An earlier workflow attempt is incomplete or unrelated.');
      const rows = await api(`${prefix}/actions/runs/${runId}/attempts/${attempt}/jobs`, 'jobs');
      assert(rows.length > 0 && rows.every(job => job.run_id === run.id && job.run_attempt === attempt && job.status === 'completed'),
        'All-attempt job evidence is incomplete.');
      jobs.push(...rows);
    }
    const plan = await readAsset(transport, release, 'plan.json');
    if (plan) { verifyPlan(plan); assert.equal(plan.repository, repository, 'Candidate plan repository differs.'); }
    const candidate = await readAsset(transport, release, 'candidate.json');
    const request = plan && nativeCandidateRequest(plan);
    const branch = await api(`${prefix}/git/ref/heads/release/unified-${runId}`, null, { allowMissing: true });
    const pullSummary = await candidates.pulls(runId);
    const pull = pullSummary && await api(`${prefix}/pulls/${pullSummary.number}`);
    let candidateValidated = false;
    if (candidate) {
      assert(request && branch?.object?.sha === candidate.commit, 'Candidate branch changed or disappeared.');
      await candidates.verify(candidate, request); candidateValidated = true;
    } else assert(!branch && !pull, 'Candidate publication was interrupted without a verified retained identity.');
    const currentSource = await candidates.master();
    assert(SHA.test(currentSource), 'Protected master identity is unavailable.');
    // Fail if a concurrent attempt began while the complete inventory was read.
    const freshRun = await api(`${prefix}/actions/runs/${runId}`);
    assert(freshRun.run_attempt === run.run_attempt && freshRun.status === run.status && freshRun.conclusion === run.conclusion,
      'Workflow changed during retirement inspection.');
    return { run, jobs, jobsTotal: jobs.length, plan, candidate, pull, currentSource, candidateValidated,
      completionExists: release.assets.some(asset => asset.name === 'completion.json'), candidateRefAbsent: !branch };
  }
  async function closePull(number, commit) {
    const pull = await api(`${prefix}/pulls/${number}`);
    assert(pull.head?.sha === commit && pull.user?.login === 'github-actions[bot]' && pull.head?.repo?.full_name === repository &&
      pull.base?.repo?.full_name === repository && pull.base.ref === 'master' && /^release\/unified-[1-9]\d*$/.test(pull.head.ref) &&
      pull.state === 'open' && !pull.merged && !pull.auto_merge, 'Candidate PR changed before retirement closure.');
    await api(`${prefix}/pulls/${number}`, null, { method: 'PATCH', body: { state: 'closed' } });
    const closed = await api(`${prefix}/pulls/${number}`);
    assert(closed.state === 'closed' && !closed.merged && closed.head.sha === commit, 'Candidate closure readback failed.');
  }
  return { inspect, closePull };
}
