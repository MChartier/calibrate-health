import assert from 'node:assert/strict';
import test from 'node:test';
import { githubRetirement } from './release-retirement-github.mjs';

function fixture() {
  const run = { id: 42, run_attempt: 2, status: 'completed', conclusion: 'cancelled', head_sha: 'a'.repeat(40),
    path: '.github/workflows/unified-release-handler.yml', event: 'workflow_run', repository: { full_name: 'example/app' } };
  const calls = [], jobs = [1, 2].map(attempt => [{ id: attempt, run_id: 42, run_attempt: attempt, name: 'prepare', status: 'completed', conclusion: 'failure' }]);
  const pull = { number: 10, head: { sha: 'b'.repeat(40), ref: 'release/unified-42', repo: { full_name: 'example/app' } },
    base: { ref: 'master', repo: { full_name: 'example/app' } }, state: 'open', merged: false, user: { login: 'github-actions[bot]' } };
  let reads = 0;
  const api = async (route, field, options) => {
    calls.push({ route, field, options });
    if (route.endsWith('/runs/42')) { reads++; return structuredClone(run); }
    const attempt = /\/attempts\/(\d+)(\/jobs)?$/.exec(route);
    if (attempt) return attempt[2] ? structuredClone(jobs[Number(attempt[1]) - 1]) : { ...run, run_attempt: Number(attempt[1]) };
    if (route.includes('/git/ref/')) return undefined;
    if (route.endsWith('/pulls/10')) {
      if (options?.method === 'PATCH') pull.state = options.body.state;
      return structuredClone(pull);
    }
    throw Error(`Unexpected synthetic API route: ${route}`);
  };
  const candidates = { pulls: async () => undefined, master: async () => 'c'.repeat(40) };
  const release = { tag_name: 'candidate/unified/42', assets: [] };
  return { run, calls, jobs, pull, api, candidates, release, adapter: githubRetirement({ repository: 'example/app', api, candidates, transport: {} }), reads: () => reads };
}

test('retirement reads every attempt and rechecks the run before returning evidence', async () => {
  const f = fixture(), result = await f.adapter.inspect(f.release);
  assert.equal(result.jobsTotal, 2); assert.equal(result.candidateRefAbsent, true);
  assert.deepEqual(f.calls.filter(c => c.field === 'jobs').map(c => c.route), [
    '/repos/example/app/actions/runs/42/attempts/1/jobs', '/repos/example/app/actions/runs/42/attempts/2/jobs'
  ]);
  assert.equal(f.reads(), 2);
});
test('missing earlier jobs, changed ownership and active attempts cannot prove retirement safe', async () => {
  const f = fixture(); f.jobs[0] = [];
  await assert.rejects(f.adapter.inspect(f.release), /incomplete/);
  f.jobs[0] = [{ run_id: 42, run_attempt: 1, status: 'in_progress' }];
  await assert.rejects(f.adapter.inspect(f.release), /incomplete/);
  f.run.repository.full_name = 'other/app'; await assert.rejects(f.adapter.inspect(f.release), /ownership/);
});
test('closure binds the original bot-owned unmerged candidate and verifies readback', async () => {
  const f = fixture(); await f.adapter.closePull(10, f.pull.head.sha); assert.equal(f.pull.state, 'closed');
  const next = fixture(); next.pull.auto_merge = {};
  await assert.rejects(next.adapter.closePull(10, next.pull.head.sha), /changed/);
  assert(!next.calls.some(c => c.options?.method === 'PATCH'));
});
