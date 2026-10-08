import assert from 'node:assert/strict';
import test from 'node:test';
import { serverHandoffIdentity, serverHandoffProvider, verifyServerHandoff } from './release-server-handoff.mjs';
import { hash, bytes, byteHash } from './release-plan.mjs';

function fixture() {
  const source = 'a'.repeat(40), execution = 'b'.repeat(40), repository = { full_name: 'example/app', id: 11 };
  const raw = { schema: 1, runId: '42', requestRunId: '40', requestRunAttempt: 1, repository: repository.full_name,
    source, serverBump: 'patch', serverConfiguration: hash('image'), stages: [{ key: 'native-ios', kind: 'native', platform: 'ios' }, { key: 'server', kind: 'server' }] };
  const plan = { ...raw, digest: hash(raw) }, identity = serverHandoffIdentity({ plan, source: execution });
  const receipt = { artifactSha256: hash('ipa') }, nativeBinding = hash('native');
  const content = new Map([['plan.json', plan], ['merge.json', { source: execution }],
    ['receipt.native-ios.json', { key: 'native-ios', id: 'ios-build', identity: nativeBinding, receipt }]]);
  const release = { target_commitish: source, assets: [...content].map(([name, value]) => ({ id: name, name,
    digest: `sha256:${byteHash(bytes(value))}`, size: bytes(value).length })) };
  const states = { server: { status: 'intent', binding: hash(identity), ids: [] },
    'native-ios': { status: 'complete', binding: nativeBinding, ids: ['ios-build'], result: receipt } };
  const common = { repository, head_repository: repository, head_branch: 'master' };
  const request = { ...common, id: 50, run_attempt: 1, head_sha: execution, event: 'workflow_dispatch',
    path: '.github/workflows/unified-server-request.yml', status: 'completed', conclusion: 'success', display_title: identity.title,
    actor: { login: 'github-actions[bot]' }, triggering_actor: { login: 'github-actions[bot]' } };
  const handler = { ...common, id: 51, run_attempt: 1, head_sha: execution, event: 'workflow_run', path: '.github/workflows/unified-server-handler.yml' };
  const parent = { ...common, id: 42, head_sha: source, event: 'workflow_run', path: '.github/workflows/unified-release-handler.yml', status: 'in_progress' };
  const manual = { ...common, id: 40, run_attempt: 1, head_sha: source, event: 'workflow_dispatch', path: '.github/workflows/unified-release.yml',
    actor: { type: 'User' }, triggering_actor: { type: 'User' }, status: 'completed', conclusion: 'success' };
  const args = { root: '.', repository: repository.full_name, repositoryId: '11', workflowSha: execution, currentMaster: execution,
    event: { action: 'completed', repository, workflow_run: structuredClone(request) }, request, handler,
    inputs: { operation: 'cut-release', selective: true, source_sha: execution, parent_run_id: '42', plan_digest: plan.digest, bump: 'patch' },
    journal: { runId: '42', assertActive: async () => release, operation: async key => states[key],
      transport: { download: async name => bytes(content.get(name)) } },
    api: async route => route.endsWith('/42') ? parent : manual,
    verifySource: async ({ source, merge }) => assert.equal(source, merge.source) };
  return { args, states, plan, parent };
}

test('fresh server handoff preserves exact master while binding the original plan and completed native stage', async () => {
  const f = fixture();
  const result = await verifyServerHandoff(f.args);
  assert.equal(result.source, 'b'.repeat(40)); assert.equal(result.parentRunId, '42'); assert.equal(result.selective, true);
  f.states.server = { ...f.states.server, status: 'running', ids: ['50'] };
  assert.deepEqual(await verifyServerHandoff(f.args), result);
});

test('stale workflow, user dispatch, unrelated parent, missing intent and partial native completion fail closed', async () => {
  const mutations = [f => f.args.workflowSha = f.plan.source, f => f.args.request.actor.login = 'human',
    f => f.parent.path = '.github/workflows/other.yml', f => f.parent.conclusion = 'cancelled',
    f => f.states.server = undefined, f => f.states.server.binding = hash('unrelated'),
    f => f.states.server = { ...f.states.server, status: 'running', ids: ['another-request'] },
    f => f.states['native-ios'].status = 'running', f => f.args.request.run_attempt = 2,
    f => f.args.inputs.bump = 'major', f => f.args.request.display_title = 'unrelated'];
  for (const mutate of mutations) { const f = fixture(); mutate(f); await assert.rejects(verifyServerHandoff(f.args)); }
});

test('an image-free plan cannot request a server handoff', () => {
  const f = fixture(); const { digest, ...plan } = f.plan; plan.stages.pop();
  assert.throws(() => serverHandoffIdentity({ plan: { ...plan, digest: hash(plan) }, source: 'b'.repeat(40) }), /did not select/);
});

test('a successful request cannot count as an image; a failed handler requires independently verified publication', async () => {
  const f = fixture(), identity = serverHandoffIdentity({ plan: f.plan, source: f.args.workflowSha });
  const handlers = []; let verified = false, dispatches = 0;
  const provider = serverHandoffProvider({ repository: 'example/app', assertSource: async () => {},
    api: async (route, field, options) => {
      if (options?.method === 'POST') { dispatches++; return; }
      if (route.includes('/unified-server-handler.yml/')) return handlers;
      if (route.includes('/unified-server-request.yml/')) return [f.args.request];
      return f.args.request;
    }, verifyResult: async () => { assert(verified, 'No verified image receipt'); return { artifactSha256: hash('image') }; } });
  assert.equal(await provider.start(identity), '50'); assert.equal(dispatches, 1);
  assert.equal(await provider.status('50', identity), 'running');
  await assert.rejects(provider.verify('50', identity), /running or absent/);
  handlers.push({ ...f.args.handler, display_title: 'Unified server request 50', status: 'completed', conclusion: 'failure' });
  await assert.rejects(provider.status('50', identity), /No verified image/);
  verified = true;
  assert.equal(await provider.status('50', identity), 'complete');
  assert.deepEqual(await provider.verify('50', identity), { artifactSha256: hash('image') });
  assert.equal(dispatches, 1);
  handlers.push({ ...handlers[0], id: 52 });
  await assert.rejects(provider.verify('50', identity), /Multiple server handlers/);
});
