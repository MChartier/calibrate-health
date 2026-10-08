import assert from 'node:assert/strict';
import test from 'node:test';
import { bytes, byteHash, hash } from './release-plan.mjs';
import { ReleaseJournal, verifyRetirement } from './release-journal.mjs';
import { runReleaseOperation } from './release-operation.mjs';
import { retireCandidate, reconcileCandidates } from './release-retirement.mjs';

function fixture() {
  let next = 1;
  const releases = [], assets = new Map(), controls = { loseUpload: false, failRename: false, loseRename: false };
  const clone = structuredClone;
  const transport = {
    releases: async () => clone(releases),
    release: async id => clone(releases.find(r => r.id === id)),
    create: async value => { releases.push({ ...value, id: next++, author: { login: 'github-actions[bot]' }, assets: [] }); },
    download: async id => assets.get(id),
    upload: async (id, name, content) => {
      const release = releases.find(r => r.id === id);
      assert(!release.assets.some(a => a.name === name), 'asset already exists');
      const asset = { id: next++, name, digest: `sha256:${byteHash(content)}`, size: content.length };
      release.assets.push(asset); assets.set(asset.id, Buffer.from(content));
      if (controls.loseUpload) { controls.loseUpload = false; throw Error('upload response lost'); }
    },
    rename: async (id, tag) => {
      if (controls.failRename) throw Error('rename refused');
      releases.find(r => r.id === id).tag_name = tag;
      if (controls.loseRename) { controls.loseRename = false; throw Error('rename response lost'); }
    }
  };
  return { transport, releases, assets, controls, store: new ReleaseJournal(transport, '10') };
}
test('foreign journal ownership blocks reads, uploads and completion before mutation', async () => {
  const f = fixture(); await f.store.create('a'.repeat(40));
  f.releases[0].author.login = 'unrelated-user';
  await assert.rejects(f.store.create('a'.repeat(40)), /ownership/);
  await assert.rejects(f.store.put('plan.json', {}), /ownership/);
  await assert.rejects(f.store.finish(hash('plan'), []), /ownership/);
  assert.equal(f.assets.size, 0);
  assert.equal(f.releases[0].tag_name, 'candidate/unified/10');
});
test('append-only journal rejects another writer and survives lost upload response', async () => {
  const f = fixture(); await f.store.create('a'.repeat(40));
  f.controls.loseUpload = true;
  await assert.rejects(f.store.put('plan.json', { source: 'a' }), /lost/);
  await f.store.put('plan.json', { source: 'a' });
  assert.equal(f.assets.size, 1);
  await assert.rejects(f.store.put('plan.json', { source: 'b' }), /conflicts/);
  await assert.rejects(new ReleaseJournal(f.transport, '11').create('b'.repeat(40)), /unresolved/);
  await assert.rejects(f.store.create('b'.repeat(40)), /identity/);
});
test('per-operation sequence is durable and exact-byte asset tampering rejects', async () => {
  const f = fixture(); await f.store.create('a'.repeat(40));
  await f.store.save({ key: 'ios', binding: hash('ios'), status: 'intent', ids: [] });
  await f.store.save({ key: 'android', binding: hash('android'), status: 'intent', ids: [] });
  await f.store.save({ key: 'ios', binding: hash('ios'), status: 'running', ids: ['provider-1'] });
  assert.equal((await f.store.operation('ios')).sequence, 2);
  const asset = f.releases[0].assets[0]; f.assets.set(asset.id, Buffer.concat([f.assets.get(asset.id), Buffer.from('\n')]));
  await assert.rejects(f.store.operation('ios'), /exact-byte/);
});
test('lost provider response reconciles once and completed retries reverify', async () => {
  const f = fixture(); await f.store.create('a'.repeat(40));
  let starts = 0, visible = false, verifies = 0;
  const provider = { find: async () => visible ? ['build-1'] : [],
    start: async () => { starts++; visible = true; throw Error('response lost'); }, status: async () => 'complete',
    verify: async () => { verifies++; return { buildId: 'build-1', digest: hash('ipa') }; } };
  await assert.rejects(runReleaseOperation(f.store, 'ios', { source: 'a' }, provider), /response lost/);
  await runReleaseOperation(f.store, 'ios', { source: 'a' }, provider);
  await runReleaseOperation(f.store, 'ios', { source: 'a' }, provider);
  assert.equal(starts, 1); assert.equal(verifies, 2);
  await assert.rejects(runReleaseOperation(f.store, 'ios', { source: 'changed' }, provider), /identity changed/);
});
test('unobserved intent and ambiguous provider results never duplicate a request', async () => {
  const f = fixture(); await f.store.create('a'.repeat(40));
  let starts = 0;
  const provider = { find: async () => [], start: async () => { starts++; throw Error('network'); } };
  await assert.rejects(runReleaseOperation(f.store, 'ios', {}, provider), /network/);
  await assert.rejects(runReleaseOperation(f.store, 'ios', {}, provider), /Unknown provider outcome/);
  provider.find = async () => ['one', 'two'];
  await assert.rejects(runReleaseOperation(f.store, 'ios', {}, provider), /Ambiguous/);
  assert.equal(starts, 1);
});

test('a singleton exact provider discovery is journaled before adoption without another request', async () => {
  const f = fixture(); await f.store.create('a'.repeat(40));
  const provider = { find: async () => ['build-existing'], start: async () => { throw Error('must not start'); },
    status: async () => 'complete', verify: async id => ({ id, digest: hash('existing artifact') }) };
  await runReleaseOperation(f.store, 'ios', { source: 'a' }, provider);
  assert.equal((await f.store.operation('ios')).status, 'complete');
  assert.equal(f.releases[0].assets.length, 3);
});
async function retiredFixture() {
  const f = fixture(); const source = 'a'.repeat(40);
  await f.store.create(source);
  const plan = { schema: 1, runId: '10', repository: 'example/app', source };
  await f.store.put('plan.json', plan);
  const observation = { plan, run: { id: 10, run_attempt: 1, head_sha: source, head_branch: 'master', event: 'workflow_run',
    path: '.github/workflows/unified-release-handler.yml', status: 'completed', conclusion: 'cancelled' },
    jobs: [{ name: 'Inspect immutable inputs and verified successful receipts', run_attempt: 1, status: 'completed', conclusion: 'success' },
      { name: 'Run only the verified selected stages', run_attempt: 1, status: 'completed', conclusion: 'cancelled' }], jobsTotal: 2,
    currentSource: 'b'.repeat(40), completionExists: false, candidateRefAbsent: true };
  return { ...f, observation, inspect: async () => structuredClone(observation), close: async () => { throw Error('No PR should be closed'); } };
}
test('retirement retains exact original assets, blocks old ID and resumes lost cleanup response', async () => {
  const f = await retiredFixture(), original = structuredClone(f.releases[0].assets);
  f.controls.loseRename = true;
  await assert.rejects(retireCandidate(f.transport, '10', f.inspect, f.close), /response lost/);
  await assert.rejects(new ReleaseJournal(f.transport, '11').create('b'.repeat(40)), /incomplete/);
  await reconcileCandidates(f.transport, '11', f.inspect, f.close);
  await verifyRetirement(f.transport, f.releases[0]);
  assert.deepEqual(f.releases[0].assets.slice(0, 1), original);
  await assert.rejects(f.store.create('a'.repeat(40)), /abandoned/);
  await new ReleaseJournal(f.transport, '11').create('b'.repeat(40));
});
test('cleanup failure retains a blocking tombstone and subsequent run finishes it', async () => {
  const f = await retiredFixture(); f.controls.failRename = true;
  await assert.rejects(retireCandidate(f.transport, '10', f.inspect, f.close), /refused/);
  await assert.rejects(f.store.put('anything.json', {}), /retiring/);
  await assert.rejects(new ReleaseJournal(f.transport, '11').create('b'.repeat(40)), /unresolved/);
  f.controls.failRename = false;
  await reconcileCandidates(f.transport, '11', f.inspect, f.close);
  await verifyRetirement(f.transport, f.releases[0]);
});
for (const status of ['intent', 'running', 'failed', 'complete']) test(`retirement preserves provider ${status}`, async () => {
  const f = await retiredFixture(); await f.store.put('op.ios.000001.json', { key: 'ios', binding: hash({}), status, ids: [] });
  await assert.rejects(retireCandidate(f.transport, '10', f.inspect, f.close), /partial publication/);
});

test('operation history rejects skipped intent, changed bindings and lost provider IDs', async () => {
  const f = fixture(); await f.store.create('a'.repeat(40));
  await assert.rejects(f.store.save({ key: 'ios', binding: hash('ios'), status: 'running', ids: ['id'] }), /durable intent/);
  await f.store.save({ key: 'ios', binding: hash('ios'), status: 'intent', ids: [] });
  await assert.rejects(f.store.save({ key: 'ios', binding: hash('changed'), status: 'running', ids: ['id'] }), /binding/);
  await f.store.save({ key: 'ios', binding: hash('ios'), status: 'running', ids: ['id'] });
  await assert.rejects(f.store.save({ key: 'ios', binding: hash('ios'), status: 'failed', ids: [] }), /retained/);
});
test('all attempts, active runs, incomplete job inventories and unknown assets block retirement', async () => {
  for (const mutate of [o => o.run.status = 'in_progress', o => o.jobs.push({ name: 'native', conclusion: 'cancelled' }),
    o => o.jobsTotal = 3, o => o.completionExists = true]) {
    const f = await retiredFixture(); mutate(f.observation);
    await assert.rejects(retireCandidate(f.transport, '10', f.inspect, f.close));
    assert.equal(f.releases[0].assets.length, 1);
  }
});
test('runner interruption before plan upload is reconciled without deleting a journal', async () => {
  const f = await retiredFixture(); f.releases[0].assets = []; f.observation.plan = undefined;
  await reconcileCandidates(f.transport, '11', f.inspect, f.close);
  assert.equal(f.releases.length, 1); await verifyRetirement(f.transport, f.releases[0]);
});

test('post-rename interruption rechecks provider absence before completing cleanup', async () => {
  const f = await retiredFixture(); f.controls.loseRename = true;
  await assert.rejects(retireCandidate(f.transport, '10', f.inspect, f.close), /response lost/);
  f.observation.completionExists = true;
  await assert.rejects(reconcileCandidates(f.transport, '11', f.inspect, f.close), /Completed publication/);
  assert(!f.releases[0].assets.some(a => a.name === 'retirement-complete.json'));
});

test('missing plan requires verified candidate branch absence', async () => {
  const f = await retiredFixture(); f.releases[0].assets = []; f.observation.plan = undefined;
  f.observation.candidateRefAbsent = false;
  await assert.rejects(retireCandidate(f.transport, '10', f.inspect, f.close), /unverified branch absence/);
  assert.equal(f.releases[0].assets.length, 0);
});
