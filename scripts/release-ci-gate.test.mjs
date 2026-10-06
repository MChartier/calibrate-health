import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { REQUIRED_CI, assertIdentity, evaluateRuns, githubApi, inspectCi, waitForCi } from './release-ci-gate.mjs';

const identity = { repository: 'owner/repo', head: 'a'.repeat(40), base: 'b'.repeat(40), branch: 'release/v1.2.3', number: '12' };
function fixture() {
  const repo = { full_name: identity.repository };
  const pull = { state: 'open', merged: false, draft: false,
    head: { sha: identity.head, ref: identity.branch, repo }, base: { sha: identity.base, ref: 'master', repo } };
  const master = { object: { sha: identity.base } };
  const runs = Object.entries(REQUIRED_CI).map(([file, names], index) => ({
    id: index + 1, path: `.github/workflows/${file}`, event: 'pull_request',
    head_sha: identity.head, head_branch: identity.branch, head_repository: repo,
    status: 'completed', conclusion: 'success', run_attempt: 1, html_url: `https://github.com/owner/repo/actions/runs/${index + 1}`,
    jobs: names.map(name => ({ name, status: 'completed', conclusion: 'success' })),
  }));
  const api = async path => {
    if (path.includes('/pulls/')) return pull;
    if (path.endsWith('/git/ref/heads/master')) return master;
    if (path.includes('/actions/runs?')) return structuredClone(runs);
    const id = Number(path.match(/\/runs\/(\d+)/)?.[1]);
    const run = runs.find(item => item.id === id);
    if (path.includes('/jobs?')) return run.jobs;
    if (run) return run;
    throw new Error(`Unexpected request ${path}`);
  };
  return { pull, master, runs, api };
}

test('complete exact-candidate CI permits finalization, with canonical skips only', async () => {
  const f = fixture();
  f.runs[2].jobs.push({ name: 'iOS Build', status: 'completed', conclusion: 'skipped' });
  f.runs[4].jobs.push({ name: 'v0.14.0 Upgrade and Encrypted Rollback', status: 'completed', conclusion: 'skipped' });
  assert.equal((await waitForCi(f.api, identity, { report() {} })).selected.length, 5);
});

for (const conclusion of ['failure', 'cancelled', 'timed_out', 'neutral', 'skipped', 'action_required', null]) {
  test(`${conclusion} CI cannot authorize merge/publication`, async () => {
    const f = fixture();
    f.runs[0].conclusion = conclusion;
    await assert.rejects(inspectCi(f.api, identity), /lint.yml/);
  });
}

test('approval-expired zero-job failure reproduces PR432 and blocks', async () => {
  const f = fixture();
  f.runs.forEach(run => { run.conclusion = 'failure'; run.jobs = []; });
  await assert.rejects(inspectCi(f.api, identity), /approval\/no-job annotations/);
});

test('empty inventory, pending approval and missing workflows time out without a merge', async () => {
  for (const kind of ['empty', 'missing', 'waiting', 'queued', 'in_progress']) {
    const f = fixture();
    if (kind === 'empty') f.runs.length = 0;
    else if (kind === 'missing') f.runs.pop();
    else f.runs[0].status = kind;
    await assert.rejects(waitForCi(f.api, identity, { timeoutMs: 0, report() {} }), /timed out/);
  }
});

test('polling allows approval then success and is bounded when approval never arrives', async () => {
  const f = fixture();
  f.runs[0].status = 'waiting';
  let clock = 0;
  const options = { now: () => clock, timeoutMs: 30_000, report() {}, sleep: async ms => { clock += ms; f.runs[0].status = 'completed'; } };
  assert.equal((await waitForCi(f.api, identity, options)).selected.length, 5);
  assert.equal(clock, 15_000);
  f.runs[0].status = 'waiting';
  await assert.rejects(waitForCi(f.api, identity, { ...options, sleep: async ms => { clock += ms; } }), /timed out/);
});

test('newer failed run or rerun cannot fall back to historical green CI', async () => {
  const f = fixture();
  f.runs.push({ ...f.runs[0], id: 100, conclusion: 'failure' });
  await assert.rejects(inspectCi(f.api, identity), /failure/);
  f.runs.pop();
  await assert.rejects(inspectCi(async path => {
    const result = await f.api(path);
    return path.endsWith('/runs/1') ? { ...result, run_attempt: 2 } : result;
  }, identity), /attempt changed/);
});

test('wrong event, source, repository, branch or workflow never supplies required success', () => {
  for (const [field, value] of Object.entries({ event: 'workflow_dispatch', head_sha: 'c'.repeat(40), head_repository: { full_name: 'attacker/repo' }, head_branch: 'other', path: '.github/workflows/other.yml' })) {
    const f = fixture();
    f.runs[0][field] = value;
    assert.equal(evaluateRuns(f.runs, identity).pending.length, 1);
  }
});

test('zero jobs, missing required success, unexpected skips and failing jobs fail closed', () => {
  for (const jobs of [[], [{ name: REQUIRED_CI['lint.yml'][0], status: 'completed', conclusion: 'skipped' }],
    [...fixture().runs[0].jobs, { name: 'Unexpected', status: 'completed', conclusion: 'skipped' }],
    [...fixture().runs[0].jobs, { name: 'Unexpected', status: 'completed', conclusion: 'failure' }]]) {
    const f = fixture(); f.runs[0].jobs = jobs;
    assert.throws(() => evaluateRuns(f.runs, identity), /job/);
  }
});

test('moved head/base/master, closed or draft PR cannot merge', () => {
  for (const mutate of [f => f.pull.head.sha = 'c'.repeat(40), f => f.pull.base.sha = 'c'.repeat(40),
    f => f.master.object.sha = 'c'.repeat(40), f => f.pull.state = 'closed', f => f.pull.draft = true,
    f => f.pull.head.ref = 'other', f => f.pull.head.repo = { full_name: 'other/repo' }]) {
    const f = fixture(); mutate(f);
    assert.throws(() => assertIdentity(f, identity), /changed/);
  }
});

test('complete pagination, API denial and truncated inventory are handled explicitly', async () => {
  const responses = [{ total_count: 2, jobs: [{ id: 1 }] }, { total_count: 2, jobs: [{ id: 2 }] }];
  const urls = [];
  const api = githubApi({ token: 'synthetic', fetchImpl: async url => { urls.push(url); return { ok: true, json: async () => responses.shift() }; } });
  assert.deepEqual(await api('/jobs?per_page=100', 'jobs'), [{ id: 1 }, { id: 2 }]);
  assert.match(urls[1], /page=2$/);
  await assert.rejects(githubApi({ token: 'synthetic', fetchImpl: async () => ({ ok: false, status: 403 }) })('/jobs'), /403/);
  await assert.rejects(githubApi({ token: 'synthetic', fetchImpl: async () => ({ ok: true, json: async () => ({ total_count: 1, jobs: [] }) }) })('/jobs?per_page=100', 'jobs'), /truncated/);
});

test('workflow gates merge twice, retains blocked candidates and preserves explicit publication dependency', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cut-release.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('Open or reuse the exact release pull request') < workflow.indexOf('Wait for exact release PR CI'));
  assert.ok(workflow.indexOf('Wait for exact release PR CI') < workflow.indexOf('Merge the exact release pull request through GitHub'));
  assert.ok(workflow.indexOf('release-ci-gate.mjs --once') < workflow.indexOf('MERGE_RESPONSE='));
  assert.match(workflow, /needs\.release-validation\.result != 'success'/);
  assert.match(workflow, /publish:\n[\s\S]*needs: \[prepare, finalize\]/);
  assert.match(workflow, /release_status:\n[\s\S]*if: \$\{\{ always\(\) \}\}/);
  assert.doesNotMatch(workflow, /pull_request_target|actions: write|checks: write/);
});
