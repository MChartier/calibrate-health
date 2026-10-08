import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeCandidateRequest, verifyExecutionSource } from './release-source.mjs';
import { hash } from './release-plan.mjs';

function fixture(stages = [{ key: 'native-ios' }, { key: 'server' }]) {
  const value = { schema: 1, runId: '42', source: 'a'.repeat(40), stages };
  const plan = { ...value, digest: hash(value) }, request = nativeCandidateRequest(plan), source = 'b'.repeat(40);
  const merge = { source, candidate: 'c'.repeat(40), tree: 'd'.repeat(40), requestDigest: hash(request) };
  const git = args => args[0] === 'rev-list' ? `${source} ${plan.source} ${merge.candidate}\n` : `${merge.tree}\n`;
  return { root: '.', plan, source, merge, git, verifyCandidate: async ({ request: observed }) => assert.deepEqual(observed, request) };
}
test('native metadata source transitions leave the server-only canonical candidate to its maintained worker', async () => {
  const f = fixture(); assert.equal(nativeCandidateRequest(f.plan).serverBump, null);
  const identity = await verifyExecutionSource(f); assert.equal(identity.source, f.source); assert.equal(identity.originalSource, f.plan.source);
});
test('changed tree, extra merge parents, marker allocation and unrelated sources reject', async () => {
  const f = fixture(); await assert.rejects(verifyExecutionSource({ ...f, git: () => 'unexpected' }));
  await assert.rejects(verifyExecutionSource({ ...f, merge: { ...f.merge, requestDigest: hash('other plan') } }), /merge identity/);
  await assert.rejects(verifyExecutionSource({ ...f, verifyCandidate: async () => { throw Error('noncanonical metadata'); } }), /noncanonical/);
  const g = fixture([{ key: 'server' }]);
  await assert.rejects(verifyExecutionSource({ ...g, merge: undefined }), /cannot substitute/);
  assert.equal((await verifyExecutionSource({ ...g, source: g.plan.source, merge: undefined })).source, g.plan.source);
});
