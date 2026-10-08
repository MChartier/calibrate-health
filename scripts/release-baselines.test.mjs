import assert from 'node:assert/strict';
import test from 'node:test';
import { loadReleaseBaselines } from './release-baselines.mjs';
import { bytes, byteHash, hash } from './release-plan.mjs';

function fixture() {
  const source = 'a'.repeat(40), configuration = { profile: 'production' }, digest = hash(configuration);
  const input = hash('source inputs'), inputs = { server: input, native: { android: input, ios: input }, bundle: { android: input, ios: input } };
  const value = { schema: 1, repository: 'example/app', runId: '42', requestRunId: '41', requestRunAttempt: 1, source, profile: 'production', configuration: digest,
    serverConfiguration: digest, inputs, stages: [{ key: 'native-ios', kind: 'native', platform: 'ios' }, { key: 'server', kind: 'server' }] };
  const plan = { ...value, digest: hash(value) }, result = { key: 'native-ios', id: 'build-1', identity: hash('identity'), receipt: { opaque: 'artifact authority' } };
  const contents = new Map(); const release = { id: 2, tag_name: 'candidate/unified/42', target_commitish: source,
    draft: true, author: { login: 'github-actions[bot]' }, assets: [] };
  function put(name, value) {
    const content = bytes(value), id = release.assets.length + 1;
    release.assets.push({ id, name, size: content.length, digest: `sha256:${byteHash(content)}` }); contents.set(id, content);
  }
  put('plan.json', plan); put('configuration.json', { schema: 1, digest }); put('receipt.native-ios.json', result);
  let verifies = 0;
  const args = { repository: plan.repository, transport: { releases: async () => [release], download: async id => contents.get(id) },
    api: async route => route.endsWith('/runs/42')
      ? { id: 42, repository: { full_name: plan.repository }, head_sha: source, event: 'workflow_run', head_branch: 'master', path: '.github/workflows/unified-release-handler.yml' }
      : { id: 41, run_attempt: 1, repository: { full_name: plan.repository }, head_repository: { full_name: plan.repository },
        head_sha: source, event: 'workflow_dispatch', head_branch: 'master', path: '.github/workflows/unified-release.yml',
        actor: { type: 'User' }, triggering_actor: { type: 'User' }, status: 'completed', conclusion: 'success' },
    snapshot: async () => structuredClone(inputs), verifyWorker: async () => {
      verifies++; return { source, configuration: digest, artifactSha256: hash('exact IPA bytes'), runtime: 'ios-1.2.3-11' };
    } };
  return { args, plan, result, release, contents, put, verifies: () => verifies };
}
test('partial success advances only the verified artifact using recomputed immutable source inputs', async () => {
  const f = fixture(), receipts = await loadReleaseBaselines(f.args);
  assert.equal(receipts.length, 1); assert.equal(receipts[0].kind, 'native'); assert.equal(receipts[0].platform, 'ios');
  assert.equal(receipts[0].sequence, 42001); assert.equal(f.verifies(), 1);
  assert.equal(receipts[0].input, f.plan.inputs.native.ios);
});
test('raw journal JSON cannot bypass worker verification, original input checks or workflow ownership', async () => {
  const f = fixture(); f.args.verifyWorker = async () => { throw Error('signature verification failed'); };
  await assert.rejects(loadReleaseBaselines(f.args), /signature/);
  const g = fixture(); g.args.snapshot = async () => ({ replaced: true });
  await assert.rejects(loadReleaseBaselines(g.args), /immutable source/); assert.equal(g.verifies(), 0);
  const h = fixture(); h.release.author.login = 'someone'; await assert.rejects(loadReleaseBaselines(h.args), /ownership/);
});
test('completed journals with missing stage receipts never masquerade as successful baselines', async () => {
  const f = fixture(); f.release.tag_name = 'completed/unified/42';
  f.put('completion.json', { runId: '42', planDigest: f.plan.digest, results: [f.result, { key: 'server' }] });
  await assert.rejects(loadReleaseBaselines(f.args), /missing/);
});

test('selected OTA native receipt is still independently verified and cannot substitute another worker', async () => {
  const f = fixture();
  f.result.id = '456';
  const asset = f.release.assets.find(value => value.name === 'receipt.native-ios.json');
  const content = bytes(f.result); f.contents.set(asset.id, content); asset.size = content.length; asset.digest = `sha256:${byteHash(content)}`;
  const [receipt] = await loadReleaseBaselines({ ...f.args, receiptId: '2:native-ios:456' });
  assert.equal(receipt.id, '2:native-ios:456'); assert.equal(f.verifies(), 1);
  await assert.rejects(loadReleaseBaselines({ ...f.args, receiptId: '2:native-ios:457' }), /changed/);
  await assert.rejects(loadReleaseBaselines({ ...f.args, receiptId: '3:native-ios:456' }), /missing/);
});
