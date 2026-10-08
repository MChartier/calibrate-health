import assert from 'node:assert/strict';
import test from 'node:test';
import { ReleaseJournal } from './release-journal.mjs';
import { runReleasePlan } from './release-runner.mjs';
import { hash, byteHash } from './release-plan.mjs';

function fixture(stages = [{ key: 'native-ios', kind: 'native', platform: 'ios' }]) {
  const source = 'a'.repeat(40), configuration = hash('configuration');
  const value = { schema: 1, runId: '10', source, configuration, serverConfiguration: configuration, stages, noChange: !stages.length };
  const plan = { ...value, digest: hash(value) }, releases = [], assets = new Map();
  let next = 1;
  const calls = [], controls = { loseRename: false, failAndroid: false };
  const transport = {
    releases: async () => structuredClone(releases), release: async id => structuredClone(releases.find(r => r.id === id)),
    create: async r => releases.push({ ...r, id: next++, author: { login: 'github-actions[bot]' }, assets: [] }), download: async id => assets.get(id),
    upload: async (id, name, content) => {
      const r = releases.find(r => r.id === id); assert(!r.assets.some(a => a.name === name));
      const asset = { id: next++, name, size: content.length, digest: `sha256:${byteHash(content)}` }; r.assets.push(asset); assets.set(asset.id, content);
    },
    rename: async (id, tag) => { releases.find(r => r.id === id).tag_name = tag; if (controls.loseRename) { controls.loseRename = false; throw Error('rename response lost'); } }
  };
  const journal = new ReleaseJournal(transport, '10');
  const workers = Object.fromEntries(['server', 'native-ios', 'native-android'].map(key => [key, {
    identity: ({ plan, source }) => ({ source, planDigest: plan.digest, configurationDigest: configuration, key }),
    find: async () => [], start: async () => { calls.push(`start:${key}`); return `${key}-1`; },
    status: async () => key === 'native-android' && controls.failAndroid ? 'running' : 'complete',
    verify: async id => { calls.push(`verify:${key}`); return { id, artifactSha256: hash(key) }; }
  }]));
  const assertSource = async () => calls.push('source-checked');
  return { source, plan, journal, workers, assertSource, calls, controls, releases };
}

test('no-change plans do not create journals or invoke providers', async () => {
  const f = fixture([]), result = await runReleasePlan(f);
  assert.equal(result.status, 'no-change'); assert.deepEqual(f.releases, []); assert.deepEqual(f.calls, []);
});

test('only selected workers run; completed retries verify receipts without another build', async () => {
  const f = fixture(); const result = await runReleasePlan(f);
  assert.equal(result.status, 'complete'); assert.deepEqual(f.calls.filter(v => v.startsWith('start:')), ['start:native-ios']);
  await runReleasePlan(f);
  assert.deepEqual(f.calls.filter(v => v.startsWith('start:')), ['start:native-ios']);
  await assert.rejects(f.journal.create(f.source), /completed/);
});

test('partial completion retains each success and resumes the running provider ID', async () => {
  const f = fixture([{ key: 'native-ios', kind: 'native', platform: 'ios' }, { key: 'native-android', kind: 'native', platform: 'android' }]);
  f.controls.failAndroid = true;
  await assert.rejects(runReleasePlan(f), /still running/);
  f.controls.failAndroid = false; await runReleasePlan(f);
  assert.deepEqual(f.calls.filter(v => v.startsWith('start:')), ['start:native-ios', 'start:native-android']);
  assert.equal(f.releases[0].tag_name, 'completed/unified/10');
});

test('lost completion rename reconciles without provider duplication', async () => {
  const f = fixture(); f.controls.loseRename = true;
  await assert.rejects(runReleasePlan(f), /response lost/);
  await runReleasePlan(f);
  assert.equal(f.calls.filter(v => v.startsWith('start:')).length, 1);
});

test('missing adapters and stale source fail before any journal or provider mutation', async () => {
  const f = fixture(); delete f.workers['native-ios'];
  await assert.rejects(runReleasePlan(f), /unavailable/); assert.deepEqual(f.releases, []);
  const g = fixture(); g.assertSource = async () => { throw Error('stale source'); };
  await assert.rejects(runReleasePlan(g), /stale source/); assert.deepEqual(g.releases, []);
});

test('master advancement permits reconciliation of retained operations but no new provider request', async () => {
  const stages = [{ key: 'native-ios', kind: 'native', platform: 'ios' }, { key: 'native-android', kind: 'native', platform: 'android' }];
  const f = fixture(stages); f.controls.failAndroid = true;
  await assert.rejects(runReleasePlan(f), /still running/);
  f.assertSource = async () => { throw Error('master advanced'); };
  f.controls.failAndroid = false;
  assert.equal((await runReleasePlan(f)).status, 'complete');
  assert.equal(f.calls.filter(v => v.startsWith('start:')).length, 2);

  const g = fixture(stages);
  const original = g.workers['native-ios'].verify;
  g.workers['native-ios'].verify = async id => {
    g.assertSource = async () => { throw Error('master advanced'); };
    return original(id);
  };
  // The guard is passed as a stable callback that reads the current simulated source.
  const check = () => g.assertSource();
  await assert.rejects(runReleasePlan({ ...g, assertSource: check }), /master advanced/);
  assert.deepEqual(g.calls.filter(v => v.startsWith('start:')), ['start:native-ios']);
  await assert.rejects(runReleasePlan({ ...g, assertSource: check }), /Unknown provider outcome/);
  assert.deepEqual(g.calls.filter(v => v.startsWith('start:')), ['start:native-ios']);
});
