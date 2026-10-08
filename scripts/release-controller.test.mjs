import assert from 'node:assert/strict';
import test from 'node:test';
import { manualReleaseContext, protectedReleaseContext, prepareUnifiedPlan, prepareUnifiedSource } from './release-controller.mjs';
import { ReleaseJournal, readAsset } from './release-journal.mjs';
import { hash, byteHash } from './release-plan.mjs';

function fixture() {
  const source = 'a'.repeat(40), configuration = { profile: 'production' }, serverConfiguration = { image: 'synthetic' };
  const context = manualReleaseContext({ id: 42, run_attempt: 1, head_sha: source, head_branch: 'master',
    event: 'workflow_dispatch', path: '.github/workflows/unified-release.yml', repository: { full_name: 'example/app' },
    head_repository: { full_name: 'example/app' }, actor: { type: 'User' }, triggering_actor: { type: 'User' },
    created_at: '2026-10-08T00:00:00Z' }, 'example/app');
  const digest = hash('inputs'), inputs = { server: digest, native: { android: digest, ios: digest }, bundle: { android: digest, ios: digest } };
  const receipts = ['server', 'android', 'ios'].map((platform, index) => ({ schema: 1, id: platform, sequence: index + 1,
    source, profile: 'production', platform, kind: platform === 'server' ? 'server' : 'native', input: digest, bundleInput: digest,
    configuration: hash(platform === 'server' ? serverConfiguration : configuration), runtime: '1.2.3', artifactSha256: digest }));
  const releases = [], contents = new Map(), calls = [], state = { master: source, ci: true, losePlan: false };
  let id = 1;
  const transport = { releases: async () => structuredClone(releases), release: async id => structuredClone(releases.find(r => r.id === id)),
    download: async id => contents.get(id), create: async value => releases.push({ ...value, id: id++, author: { login: 'github-actions[bot]' }, assets: [] }),
    upload: async (releaseId, name, content) => {
      if (name === 'plan.json' && state.losePlan) { state.losePlan = false; throw Error('interrupted before plan upload'); }
      const asset = { id: id++, name, size: content.length, digest: `sha256:${byteHash(content)}` };
      releases.find(r => r.id === releaseId).assets.push(asset); contents.set(asset.id, content);
    } };
  const journal = new ReleaseJournal(transport, context.runId);
  const candidates = { master: async () => state.master,
    prepare: async ({ request }) => { calls.push(request); return { commit: 'b'.repeat(40) }; },
    finalize: async ({ journal }) => {
      assert(state.ci, 'exact candidate CI missing');
      const merge = { source: 'c'.repeat(40) }; await journal.put('merge.json', merge); return merge;
    } };
  const args = { root: '.', context, configuration, serverConfiguration, journal, candidates,
    snapshot: async () => structuredClone(inputs), loadBaselines: async () => receipts,
    readVersions: async () => ({ manifest: { server: { version: '1.2.3' }, android: { mobile: { version_name: '1.2.3', version_code: 11 },
      wear: { version_name: '1.2.3', version_code: 12 } } }, ios: { version: '1.2.3', buildNumber: '11' } }),
    verifySource: async ({ source, merge }) => assert.equal(source, merge?.source ?? context.source) };
  return { args, inputs, receipts, releases, state, calls };
}

test('manual source ownership rejects push, bot, fork and branch-selected requests', () => {
  for (const change of [{ event: 'push' }, { actor: { type: 'Bot' } }, { head_repository: { full_name: 'other/app' } }, { head_branch: 'feature' }]) {
    const f = fixture();
    assert.throws(() => manualReleaseContext({ id: 42, run_attempt: 1, head_sha: f.args.context.source, head_branch: 'master',
      event: 'workflow_dispatch', path: '.github/workflows/unified-release.yml', repository: { full_name: 'example/app' },
      head_repository: { full_name: 'example/app' }, actor: { type: 'User' }, triggering_actor: { type: 'User' }, ...change }, 'example/app'), /human-dispatched/);
  }
});

test('only the exact protected handler can own the journal; the request run is retained separately', () => {
  const source = 'a'.repeat(40), repository = 'example/app';
  const request = { id: 40, run_attempt: 2, head_sha: source, head_branch: 'master', event: 'workflow_dispatch',
    path: '.github/workflows/unified-release.yml', repository: { full_name: repository }, head_repository: { full_name: repository },
    actor: { type: 'User' }, triggering_actor: { type: 'User' }, status: 'completed', conclusion: 'success' };
  const handler = { id: 42, run_attempt: 1, head_sha: source, head_branch: 'master', event: 'workflow_run',
    path: '.github/workflows/unified-release-handler.yml', repository: { full_name: repository }, head_repository: { full_name: repository } };
  const args = { request, handler, repository, workflowSha: source,
    event: { action: 'completed', repository: { full_name: repository }, workflow_run: request } };
  assert.deepEqual(protectedReleaseContext(args), { runId: '42', requestRunId: '40', requestRunAttempt: 2,
    repository, source, createdAt: undefined });
  for (const changed of [{ event: 'workflow_dispatch' }, { head_sha: 'b'.repeat(40) }, { path: '.github/workflows/other.yml' }]) {
    assert.throws(() => protectedReleaseContext({ ...args, handler: { ...handler, ...changed } }), /exact successful/);
  }
});

test('no-change manual planning and source preparation have no journal/candidate writes', async () => {
  const f = fixture(), { plan } = await prepareUnifiedPlan(f.args);
  assert.equal(plan.noChange, true);
  assert.equal((await prepareUnifiedSource({ ...f.args, plan })).status, 'no-change');
  assert.deepEqual(f.releases, []); assert.deepEqual(f.calls, []);
});

test('combined plan allocates only native metadata before the separate server worker', async () => {
  const f = fixture(); f.receipts.length = 0;
  const { plan } = await prepareUnifiedPlan(f.args);
  assert.deepEqual(plan.stages.map(stage => stage.key), ['native-android', 'native-ios', 'server']);
  const result = await prepareUnifiedSource({ ...f.args, plan });
  assert.equal(result.source, 'c'.repeat(40)); assert.equal(f.calls[0].serverBump, null);
  assert.equal(f.calls[0].android, true); assert.equal(f.calls[0].ios, true);
});

test('interruption between configuration and plan persistence resumes the same allocation', async () => {
  const f = fixture(); f.inputs.native.ios = hash('changed');
  const { plan } = await prepareUnifiedPlan(f.args); f.state.losePlan = true;
  await assert.rejects(prepareUnifiedSource({ ...f.args, plan }), /interrupted/);
  assert.deepEqual(f.releases[0].assets.map(asset => asset.name), ['configuration.json']);
  const retry = await prepareUnifiedPlan(f.args); assert.deepEqual(retry.plan, plan);
  await prepareUnifiedSource({ ...f.args, plan });
  assert.equal(f.releases.length, 1); assert.equal(f.calls.length, 1);
});

test('durable configuration assets retain only a digest and reject changed external inputs on retry', async () => {
  const f = fixture(); f.receipts.length = 0;
  f.args.configuration = { profile: 'production', projectId: 'synthetic-project-private', serverUrl: 'https://synthetic.invalid' };
  const { plan } = await prepareUnifiedPlan(f.args);
  await prepareUnifiedSource({ ...f.args, plan });
  const retained = await readAsset(f.args.journal.transport, await f.args.journal.release(), 'configuration.json');
  assert.deepEqual(retained, { schema: 1, digest: hash(f.args.configuration) });
  assert.doesNotMatch(JSON.stringify(f.releases), /synthetic-project-private|synthetic\.invalid/);
  assert.equal((await prepareUnifiedPlan(f.args)).resumed, true);
  await assert.rejects(prepareUnifiedPlan({ ...f.args, configuration: { ...f.args.configuration, projectId: 'different' } }), /original source and configuration/);
});

test('missing CI retains the native candidate; changed retry configuration cannot rewrite the plan', async () => {
  const f = fixture(); f.inputs.native.android = hash('changed'); f.state.ci = false;
  const { plan } = await prepareUnifiedPlan(f.args);
  await assert.rejects(prepareUnifiedSource({ ...f.args, plan }), /CI missing/);
  assert.equal((await prepareUnifiedPlan(f.args)).resumed, true);
  await assert.rejects(prepareUnifiedPlan({ ...f.args, bump: 'major' }), /original source and configuration/);
  await assert.rejects(prepareUnifiedPlan({ ...f.args, configuration: { profile: 'internal' } }), /original source and configuration/);
});

test('stale source fails before a new plan or any writes', async () => {
  const f = fixture(); f.state.master = 'd'.repeat(40);
  await assert.rejects(prepareUnifiedPlan(f.args), /stale/); assert.deepEqual(f.releases, []);
});
