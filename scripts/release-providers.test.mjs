import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { easIosBuildProvider, githubWorkflowProvider, downloadWorkflowReceipt } from './release-providers.mjs';
import { hash } from './release-plan.mjs';

test('downloaded worker receipts must have exact canonical bytes and no extra files', () => {
  const receipt = { source: 'a'.repeat(40) }, encode = value => JSON.stringify(value) + '\n';
  let directory, extra = false, variant = false;
  const args = { root: '.', repository: 'example/app', runId: '42', name: 'unified-ios-receipt', fileName: 'ios-receipt.json', encode,
    execute: (_command, values) => { directory = values.at(-1); fs.writeFileSync(path.join(directory, 'ios-receipt.json'), encode(receipt) + (variant ? '\n' : ''));
      if (extra) fs.writeFileSync(path.join(directory, 'unexpected.json'), '{}'); } };
  assert.deepEqual(downloadWorkflowReceipt(args), receipt); assert(!fs.existsSync(directory));
  variant = true; assert.throws(() => downloadWorkflowReceipt(args), /not canonical/); assert(!fs.existsSync(directory));
  variant = false; extra = true; assert.throws(() => downloadWorkflowReceipt(args), /Unexpected/); assert(!fs.existsSync(directory));
});

function fixture() {
  const id = '11111111-1111-4111-8111-111111111111', source = 'a'.repeat(40);
  const identity = { source, planDigest: hash('plan'), profile: 'production',
    version: { schemaVersion: 1, version: '1.2.3', buildNumber: '11', minimumSupportedVersion: '1.0.0' },
    configuration: { profile: 'production', channel: 'production', environment: 'production', projectId: id, serverUrl: 'https://synthetic.invalid' } };
  const build = { id, platform: 'IOS', app: { id }, gitCommitHash: source, buildProfile: 'production', appVersion: '1.2.3',
    appBuildVersion: '11', runtime: { version: 'ios-1.2.3-11' }, updateChannel: { name: 'production' }, distribution: 'STORE',
    message: `calibrate:${source}:${identity.planDigest}`, status: 'FINISHED', isForIosSimulator: false,
    artifacts: { buildUrl: 'https://synthetic.invalid/build.ipa' } };
  const calls = [], receipt = { source, buildId: id, artifactSha256: hash('ipa') };
  const provider = easIosBuildProvider({
    execute: async args => { calls.push(args); return args[0] === 'build:view' ? structuredClone(build) :
      args[0] === 'build:list' && !args.includes('--git-commit-hash') ? [] : [structuredClone(build)]; },
    assertSource: async () => calls.push(['source-checked']), verifyArtifact: async () => { calls.push(['ipa-inspected']); return receipt; }
  });
  return { id, identity, build, calls, receipt, provider };
}

test('iOS provider binds exact locked CLI fields and verifies IPA bytes before receipt', async () => {
  const f = fixture();
  assert.deepEqual(await f.provider.find(f.identity), [f.id]);
  assert.equal(await f.provider.start(f.identity), f.id);
  assert.equal(await f.provider.status(f.id, f.identity), 'complete');
  assert.deepEqual(await f.provider.verify(f.id, f.identity), f.receipt);
  const args = f.calls.find(a => a[0] === 'build');
  assert(args.includes('--freeze-credentials')); assert(!args.includes('--auto-submit'));
  assert(f.calls.findIndex(a => a[0] === 'source-checked') < f.calls.findIndex(a => a[0] === 'build'));
  assert(f.calls.some(a => a[0] === 'ipa-inspected'));
});

test('iOS provider rejects project, source, runtime, profile, channel and simulator drift', async () => {
  for (const change of [{ app: { id: 'wrong' } }, { gitCommitHash: 'b'.repeat(40) }, { runtime: { version: '1' } },
    { buildProfile: 'internal' }, { updateChannel: { name: 'internal' } }, { isForIosSimulator: true }, { appBuildVersion: '12' }]) {
    const f = fixture(); Object.assign(f.build, change);
    await assert.rejects(f.provider.verify(f.id, f.identity), /identity differs/);
    assert(!f.calls.some(a => a[0] === 'ipa-inspected'));
  }
});

test('iOS provider refuses unknown status and incomplete inventories', async () => {
  const f = fixture(); f.build.status = 'UNKNOWN';
  await assert.rejects(f.provider.status(f.id, f.identity), /Unknown/);
  const provider = easIosBuildProvider({ execute: async () => ({ builds: [] }) });
  await assert.rejects(provider.find(f.identity), /inventory/);
});

test('iOS allocation inventory blocks duplicate or newer provider builds before a paid request', async () => {
  const f = fixture(); let starts = 0;
  const provider = easIosBuildProvider({ assertSource: async () => {}, verifyArtifact: async () => f.receipt,
    execute: async args => { if (args[0] === 'build') starts++; return [structuredClone(f.build)]; } });
  await assert.rejects(provider.start(f.identity), /collides/); assert.equal(starts, 0);
  f.build.status = 'ERRORED'; assert.equal(await provider.start(f.identity), f.id); assert.equal(starts, 1);
  f.build.appBuildVersion = '12'; await assert.rejects(provider.start(f.identity), /collides/); assert.equal(starts, 1);
});

test('workflow dispatch is exact-source and uncertain/partial completion cannot become retryable absence', async () => {
  const source = 'a'.repeat(40), identity = { source, title: 'Native upload-internal from ' + source, inputs: { source_commit: source, operation: 'upload-internal' } };
  let visible = false, dispatches = 0, conclusion = 'success';
  const run = () => ({ id: 42, path: '.github/workflows/native-release.yml', event: 'workflow_dispatch', head_sha: source,
    head_branch: 'master', repository: { full_name: 'example/app' }, display_title: identity.title, status: 'completed', conclusion });
  const provider = githubWorkflowProvider({ repository: 'example/app', workflow: 'native-release.yml', assertSource: async () => {},
    api: async (url, _field, options) => {
      if (options) { dispatches++; return undefined; }
      return url.endsWith('/42') ? run() : visible ? [run()] : [];
    }, verifyResult: async () => ({ verified: true }) });
  await assert.rejects(provider.start(identity), /not yet a singleton/); assert.equal(dispatches, 1);
  visible = true; assert.deepEqual(await provider.find(identity), ['42']);
  assert.equal(await provider.status('42', identity), 'complete');
  conclusion = 'failure'; await assert.rejects(provider.status('42', identity), /retained run/);
  await assert.rejects(provider.verify('42', identity), /not completed successfully/);
});
