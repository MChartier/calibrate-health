import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { githubRetirement } from './release-retirement-github.mjs';
import { ReleaseJournal, verifyRetirement } from './release-journal.mjs';
import { reconcileCandidates } from './release-retirement.mjs';
import { runReleaseOperation } from './release-operation.mjs';
import { byteHash } from './release-plan.mjs';

const handler = readFileSync(new URL('../.github/workflows/unified-release-handler.yml', import.meta.url), 'utf8');
const handlerNames = [...handler.matchAll(/^    name: (.+)$/gm)].map(match => match[1].trim());

async function cancellationFixture() {
  const source = 'a'.repeat(40), repository = 'example/app', releases = [], data = new Map(), controls = {}; let next = 1;
  const transport = {
    releases: async () => structuredClone(releases), release: async id => structuredClone(releases.find(r => r.id === id)),
    create: async r => releases.push({ ...r, id: next++, author: { login: 'github-actions[bot]' }, assets: [] }),
    download: async id => data.get(id),
    upload: async (id, name, content) => { const asset = { id: next++, name, size: content.length, digest: `sha256:${byteHash(content)}` };
      releases.find(r => r.id === id).assets.push(asset); data.set(asset.id, content); },
    rename: async (id, tag_name) => {
      if (controls.failRename) throw Error('cleanup refused');
      releases.find(r => r.id === id).tag_name = tag_name;
      if (controls.loseRename) { controls.loseRename = false; throw Error('cleanup response lost'); }
    }
  };
  const run = { id: 42, run_attempt: 2, status: 'completed', conclusion: 'cancelled', head_sha: source, head_branch: 'master',
    event: 'workflow_run', path: '.github/workflows/unified-release-handler.yml', repository: { full_name: repository } };
  const attempts = [1, 2].map(attempt => handlerNames.map((name, index) => ({ id: attempt * 10 + index, run_id: 42,
    run_attempt: attempt, name, status: 'completed', conclusion: index ? 'cancelled' : 'success' })));
  const api = async route => {
    if (route.includes('/git/ref/')) return undefined;
    const match = /\/attempts\/(\d+)(\/jobs)?$/.exec(route);
    if (match) return match[2] ? structuredClone(attempts[Number(match[1]) - 1]) : { ...run, run_attempt: Number(match[1]) };
    return structuredClone(run);
  };
  const candidates = { pulls: async () => undefined, master: async () => source };
  const adapter = githubRetirement({ repository, api, transport, candidates });
  const store = new ReleaseJournal(transport, '42'); await store.create(source);
  return { transport, releases, run, attempts, store, adapter, source, controls };
}

test('actual handler cancellation before plan persistence retires through the GitHub adapter and unblocks allocation', async () => {
  const f = await cancellationFixture();
  await reconcileCandidates(f.transport, '43', f.adapter.inspect, f.adapter.closePull);
  await verifyRetirement(f.transport, f.releases[0]);
  assert.equal(f.releases[0].tag_name, 'abandoned/unified/42');
  await new ReleaseJournal(f.transport, '43').create(f.source);
});

test('actual cancelled execute cannot retire a lost provider response with retained durable intent', async () => {
  const f = await cancellationFixture(); let starts = 0;
  await assert.rejects(runReleaseOperation(f.store, 'native-ios', { source: f.source }, {
    find: async () => [], start: async () => { starts++; throw Error('lost provider response'); }
  }), /lost provider response/);
  const original = structuredClone(f.releases[0].assets);
  await assert.rejects(reconcileCandidates(f.transport, '43', f.adapter.inspect, f.adapter.closePull), /partial publication/);
  assert.equal(starts, 1); assert.deepEqual(f.releases[0].assets, original);
  await assert.rejects(new ReleaseJournal(f.transport, '43').create(f.source), /unresolved/);
});

for (const interruption of ['failRename', 'loseRename']) test(`actual-job retirement resumes ${interruption} with original assets retained`, async () => {
  const f = await cancellationFixture(); await f.store.put('configuration.json', { digest: byteHash('synthetic configuration') });
  const original = structuredClone(f.releases[0].assets); f.controls[interruption] = true;
  await assert.rejects(reconcileCandidates(f.transport, '43', f.adapter.inspect, f.adapter.closePull), /cleanup/);
  await assert.rejects(new ReleaseJournal(f.transport, '43').create(f.source), /unresolved|incomplete/);
  f.controls[interruption] = false;
  await reconcileCandidates(f.transport, '43', f.adapter.inspect, f.adapter.closePull);
  await verifyRetirement(f.transport, f.releases[0]);
  assert.deepEqual(f.releases[0].assets.slice(0, original.length), original);
  await new ReleaseJournal(f.transport, '43').create(f.source);
});

test('actual-job retirement rejects missing phases, unknown jobs and a successful earlier execute', async () => {
  for (const change of [f => f.attempts[0].pop(), f => f.attempts[0][1].name = 'unrecognized worker',
    f => f.attempts[0][1].conclusion = 'success', f => f.attempts[0][0].conclusion = 'failure']) {
    const f = await cancellationFixture(); change(f);
    await assert.rejects(reconcileCandidates(f.transport, '43', f.adapter.inspect, f.adapter.closePull), /job evidence/);
    assert.equal(f.releases[0].tag_name, 'candidate/unified/42'); assert.equal(f.releases[0].assets.length, 0);
  }
});

function fixture() {
  const run = { id: 42, run_attempt: 2, status: 'completed', conclusion: 'cancelled', head_sha: 'a'.repeat(40),
    path: '.github/workflows/unified-release-handler.yml', event: 'workflow_run', repository: { full_name: 'example/app' } };
  const calls = [], jobs = [1, 2].map(attempt => handlerNames.map((name, index) => ({ id: attempt * 10 + index,
    run_id: 42, run_attempt: attempt, name, status: 'completed', conclusion: index ? 'cancelled' : 'success' })));
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
  assert.equal(result.jobsTotal, 4); assert.equal(result.candidateRefAbsent, true);
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
