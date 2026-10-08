import assert from 'node:assert/strict';
import test from 'node:test';
import { executeUnifiedRequest, verifiedUnifiedRequest, androidWorkflowIdentity, verifyAndroidWorkerReceipt } from './unified-release.mjs';
import { createUnifiedAndroidReceipt } from './native-play-receipt.mjs';
import { ReleaseJournal } from './release-journal.mjs';
import { hash, byteHash } from './release-plan.mjs';

test('paired Android dispatch binds planned configuration/profile and requires the original Play acknowledgement', () => {
  const value = { profile: 'internal', configuration: hash('configuration'), stages: [{ key: 'native-android' }] };
  const plan = { ...value, digest: hash(value) }, source = 'a'.repeat(40);
  assert.throws(() => androidWorkflowIdentity({ plan, source }), /acknowledgement/);
  const identity = androidWorkflowIdentity({ plan, source, confirmPlayConsoleClean: true });
  assert.equal(identity.inputs.build_profile, 'internal');
  assert.equal(identity.inputs.configuration_digest, plan.configuration);
  assert.equal(identity.inputs.operation, 'upload-internal');
  assert.equal(identity.inputs.unified_plan_digest, plan.digest);
});

test('Android receipt admission requires both the exact published signed tag and protected attestation', async () => {
  const source = 'a'.repeat(40), repository = 'example/app', master = 'b'.repeat(40), object = 'c'.repeat(40);
  const configuration = hash('config'), planDigest = hash('plan');
  const receipt = createUnifiedAndroidReceipt({ planDigest, configurationDigest: configuration, profile: 'production', receipt: {
    repository, applicationId: 'net.darkmachines.healthtracker', sourceCommit: source, nativeTag: 'native-v1.2.3', nativeVersion: '1.2.3',
    releases: { phone: { track: 'qa', versionCode: 11, aabSha256: hash('phone') }, watch: { track: 'wear:qa', versionCode: 12, aabSha256: hash('wear') } }
  } });
  const uri = `https://github.com/${repository}`, workflow = `${uri}/.github/workflows/native-release.yml@refs/heads/master`;
  const certificate = { buildSignerDigest: source, sourceRepositoryDigest: source, buildConfigDigest: source, githubWorkflowSHA: source,
    buildSignerURI: workflow, buildConfigURI: workflow, sourceRepositoryURI: uri, sourceRepositoryRef: 'refs/heads/master', runnerEnvironment: 'github-hosted' };
  const calls = [], args = { root: '.', repository, source, receipt, currentMaster: async () => master,
    plan: { digest: planDigest, configuration, profile: 'production', versions: { android: { mobile: { version_name: '1.2.3', version_code: 11 }, wear: { version_code: 12 } } } },
    api: async () => ({ ref: 'refs/tags/native-v1.2.3', object: { type: 'tag', sha: object } }),
    git: values => { calls.push(values[0]); return values[0] === 'rev-parse' ? object : 'synthetic trust'; },
    authorize: values => { assert.equal(values.trustedMasterCommit, master); calls.push('policy'); },
    verifyTag: values => { assert.equal(values.expectedCommit, source); calls.push('signed-tag'); },
    execute: (_command, values) => { assert(values.includes('--deny-self-hosted-runners')); calls.push('attestation');
      return JSON.stringify([{ verificationResult: { signature: { certificate } } }]); } };
  assert.deepEqual(await verifyAndroidWorkerReceipt(args), receipt);
  assert(calls.indexOf('signed-tag') < calls.indexOf('attestation'));
  await assert.rejects(verifyAndroidWorkerReceipt({ ...args, receipt: { ...receipt, configuration: hash('other') } }), /planned source/);
  certificate.sourceRepositoryRef = 'refs/heads/feature';
  await assert.rejects(verifyAndroidWorkerReceipt(args), /workflow identity/);
  await assert.rejects(verifyAndroidWorkerReceipt({ ...args, verifyTag: () => { throw Error('unsigned tag'); } }), /unsigned tag/);
});

function fixture(changes = []) {
  const source = 'a'.repeat(40), input = hash('original');
  const configuration = { profile: 'production', serverUrl: 'https://synthetic.invalid', projectId: 'private-project' };
  const serverConfiguration = { image: 'synthetic' }, calls = [], releases = [], assets = new Map();
  const inputs = { server: input, native: { android: input, ios: input }, bundle: { android: input, ios: input } };
  for (const change of changes) {
    if (change === 'server') inputs.server = hash('changed');
    else { const [kind, platform] = change.split('-'); inputs[kind === 'ota' ? 'bundle' : 'native'][platform] = hash('changed'); }
  }
  let nextId = 1;
  const transport = {
    releases: async () => structuredClone(releases), release: async id => structuredClone(releases.find(r => r.id === id)),
    create: async value => { calls.push('journal'); releases.push({ ...value, id: nextId++, author: { login: 'github-actions[bot]' }, assets: [] }); },
    upload: async (id, name, content) => {
      const release = releases.find(r => r.id === id); assert(!release.assets.some(a => a.name === name));
      const asset = { id: nextId++, name, size: content.length, digest: `sha256:${byteHash(content)}` };
      release.assets.push(asset); assets.set(asset.id, content);
    },
    download: async id => assets.get(id),
    rename: async (id, tag) => { releases.find(r => r.id === id).tag_name = tag; }
  };
  const receipts = ['server', 'android', 'ios'].map((platform, index) => ({ schema: 1, id: platform, sequence: index + 1,
    source, profile: 'production', platform, kind: platform === 'server' ? 'server' : 'native', input, bundleInput: input,
    configuration: hash(platform === 'server' ? serverConfiguration : configuration), runtime: '1.2.3', artifactSha256: input }));
  const state = { ci: true, failBeforeProvider: false };
  const args = { root: '.', context: { source, runId: '42', repository: 'example/app', createdAt: '2026-10-08T00:00:00Z' },
    options: { operation: 'unified-release', plan_only: false, profile: 'production', server_bump: 'patch', confirm_play_console_clean: false },
    configuration, serverConfiguration, journal: new ReleaseJournal(transport, '42'),
    candidates: { master: async () => source,
      prepare: async ({ request }) => { calls.push('candidate'); assert.equal(request.serverBump, null); return {}; },
      finalize: async ({ journal }) => { assert(state.ci, 'exact candidate CI pending');
        const merge = { source: 'b'.repeat(40) }; await journal.put('merge.json', merge); return merge; } },
    snapshot: async () => structuredClone(inputs), loadBaselines: async () => receipts,
    readVersions: async () => ({ manifest: { server: { version: '1.2.3' }, android: { mobile: { version_name: '1.2.3', version_code: 11 },
      wear: { version_name: '1.2.3', version_code: 12 } } }, ios: { version: '1.2.3', buildNumber: '11' } }),
    verifySource: async () => {}, assertSource: async () => {},
    retirement: { inspect: async () => { throw Error('No old journal expected'); }, closePull: async () => { throw Error('No old PR expected'); } },
    preflight: async () => { calls.push('preflight'); assert(!state.failBeforeProvider, 'adapter unavailable'); },
    workersForSource: async () => Object.fromEntries(['server', 'native-android', 'native-ios', 'ota-android', 'ota-ios'].map(key => [key, {
      identity: ({ plan, source, stage }) => ({ source, planDigest: plan.digest, stage: stage.key,
        configurationDigest: key === 'server' ? plan.serverConfiguration : plan.configuration }),
      find: async () => [], start: async () => { calls.push(key); return `${key}-1`; }, status: async () => 'complete',
      verify: async id => ({ artifactSha256: hash(id) })
    }])) };
  return { args, calls, releases, state };
}

test('read-only planning cannot call candidate, retirement or provider mutation adapters', async () => {
  const f = fixture(['native-ios', 'server']); f.args.options.plan_only = true;
  f.args.preflight = undefined; f.args.retirement = undefined; f.args.workersForSource = undefined;
  const result = await executeUnifiedRequest(f.args);
  assert.equal(result.status, 'planned'); assert.deepEqual(f.calls, []); assert.deepEqual(f.releases, []);
  assert(!JSON.stringify(result).includes('synthetic.invalid')); assert(!JSON.stringify(result).includes('private-project'));
});

test('a verified no-change plan allocates nothing', async () => {
  const f = fixture(); const result = await executeUnifiedRequest(f.args);
  assert.equal(result.status, 'no-change'); assert.deepEqual(f.calls, []); assert.deepEqual(f.releases, []);
});

for (const selected of [['server'], ['native-android'], ['native-ios'], ['ota-android'], ['ota-ios'],
  ['native-android', 'native-ios', 'server']]) test(`protected orchestration selects only ${selected.join(', ')}`, async () => {
  const f = fixture(selected); const result = await executeUnifiedRequest(f.args);
  assert.equal(result.status, 'complete');
  assert.deepEqual(f.calls.filter(call => /^(server|native-|ota-)/.test(call)), selected);
  assert.equal(f.calls.includes('candidate'), selected.some(stage => stage.startsWith('native-')));
  assert.equal(f.releases[0].tag_name, 'completed/unified/42');
  const before = [...f.calls]; await executeUnifiedRequest(f.args);
  assert.deepEqual(f.calls.filter(call => call !== 'preflight'), before.filter(call => call !== 'preflight'));
});

test('unavailable adapter stops before candidate writes; missing CI retains candidate without provider calls', async () => {
  const f = fixture(['native-android']); f.state.failBeforeProvider = true;
  await assert.rejects(executeUnifiedRequest(f.args), /unavailable/); assert.deepEqual(f.releases, []);
  f.state.failBeforeProvider = false; f.state.ci = false;
  await assert.rejects(executeUnifiedRequest(f.args), /CI pending/);
  assert.equal(f.releases[0].tag_name, 'candidate/unified/42');
  assert(!f.calls.includes('native-android'));
});

test('the request artifact is admitted only after exact repository and run-attempt API verification', async () => {
  const source = 'a'.repeat(40), repository = { full_name: 'example/app', id: 11 };
  const request = { id: 40, run_attempt: 2, repository, head_repository: repository, head_sha: source, head_branch: 'master',
    path: '.github/workflows/unified-release.yml', event: 'workflow_dispatch', actor: { type: 'User' }, triggering_actor: { type: 'User' },
    status: 'completed', conclusion: 'success' };
  const handler = { id: 42, run_attempt: 1, repository, head_repository: repository, head_sha: source, head_branch: 'master',
    path: '.github/workflows/unified-release-handler.yml', event: 'workflow_run' };
  const calls = [];
  const args = { repository: repository.full_name, repositoryId: '11', runId: '42', runAttempt: '1', workflowSha: source,
    event: { action: 'completed', repository, workflow_run: request }, artifactDirectory: 'synthetic',
    api: async route => route.endsWith('/40/attempts/2') ? request : handler,
    verifyArtifact: expected => { calls.push(expected); return { plan_only: true }; } };
  const result = await verifiedUnifiedRequest(args);
  assert.equal(result.context.runId, '42'); assert.equal(result.context.requestRunId, '40');
  assert.equal(calls[0].runAttempt, '2');
  handler.run_attempt = 2;
  await assert.rejects(verifiedUnifiedRequest(args), /attempt differs/); assert.equal(calls.length, 1);
});
