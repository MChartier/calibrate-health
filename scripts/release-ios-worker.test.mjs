import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { iosBuildWorker, verifyEasBuildEnvironment, runIosBuildAttempt, iosWorkflowIdentity, verifyIosWorkerRequest } from './release-ios-worker.mjs';
import { hash } from './release-plan.mjs';

const projectId = '11111111-1111-4111-8111-111111111111';
const configuration = { profile: 'production', environment: 'production', channel: 'production', projectId, serverUrl: 'https://synthetic.invalid' };
function environmentFile(args, serverUrl = configuration.serverUrl) {
  const file = args[args.indexOf('--path') + 1];
  fs.writeFileSync(file, `EXPO_PUBLIC_CALIBRATE_SERVER_URL=${serverUrl}\nEXPO_PUBLIC_EAS_PROJECT_ID=${projectId}\nEXPO_UPDATES_CHANNEL=production\nPRIVATE_CREDENTIAL=must-not-retain\n`);
  return file;
}
test('remote environment validation erases raw private values and rejects endpoint drift before a build', async () => {
  let file;
  const execute = async args => { file = environmentFile(args); };
  assert.equal((await verifyEasBuildEnvironment(execute, configuration)).configurationDigest, hash(configuration));
  assert(!fs.existsSync(file));
  await assert.rejects(verifyEasBuildEnvironment(async args => { file = environmentFile(args, 'https://other.invalid'); }, configuration), /differs/);
  assert(!fs.existsSync(file));
});

test('worker interruption reconciles a singleton build and never spends again on an empty retry response', async () => {
  const state = { ids: [], status: 'running', starts: 0 };
  const worker = { find: async () => state.ids, status: async () => state.status,
    start: async () => { state.starts++; return projectId; } };
  assert.equal((await runIosBuildAttempt({ worker, identity: {}, runAttempt: 1 })).id, projectId);
  await assert.rejects(runIosBuildAttempt({ worker, identity: {}, runAttempt: 2 }), /Unknown iOS build outcome/);
  state.ids = [projectId];
  assert.equal((await runIosBuildAttempt({ worker, identity: {}, runAttempt: 2 })).id, projectId);
  assert.equal(state.starts, 1);
  state.status = 'failed';
  await runIosBuildAttempt({ worker, identity: {}, runAttempt: 2 }); assert.equal(state.starts, 2);
  state.ids.push('22222222-2222-4222-8222-222222222222'); state.status = 'complete';
  await assert.rejects(runIosBuildAttempt({ worker, identity: {}, runAttempt: 3 }), /Multiple matching/);
});

test('iOS provider job needs the original manual authority, exact selected intent and configuration', async () => {
  const source = 'a'.repeat(40), original = 'b'.repeat(40), repository = 'example/app';
  const value = { schema: 1, runId: '42', requestRunId: '40', requestRunAttempt: 1, repository, source: original,
    configuration: hash(configuration), profile: 'production', stages: [{ key: 'native-ios', kind: 'native', platform: 'ios' }] };
  const plan = { ...value, digest: hash(value) }, identity = iosWorkflowIdentity({ plan, source });
  const content = Buffer.from(JSON.stringify(plan));
  const { byteHash } = await import('./release-plan.mjs');
  const release = { target_commitish: original, assets: [{ name: 'plan.json', id: 1, size: content.length, digest: `sha256:${byteHash(content)}` }] };
  const run = { id: 99, run_attempt: 1, path: '.github/workflows/native-ios-release.yml', event: 'workflow_dispatch',
    repository: { full_name: repository }, head_repository: { full_name: repository }, head_branch: 'master', head_sha: source,
    actor: { login: 'github-actions[bot]' }, triggering_actor: { login: 'github-actions[bot]' }, display_title: identity.title };
  const args = { root: '.', repository, run, workflowSha: source, inputs: identity.inputs, configuration,
    journal: { runId: '42', assertActive: async () => release, transport: { download: async () => content },
      operation: async () => ({ status: 'intent', ids: [], binding: hash(identity) }) }, verifySource: async () => {},
    api: async route => route.endsWith('/42') ? { id: 42, path: '.github/workflows/unified-release-handler.yml', event: 'workflow_run',
      repository: { full_name: repository }, head_repository: { full_name: repository }, head_branch: 'master', head_sha: original }
      : { id: 40, run_attempt: 1, path: '.github/workflows/unified-release.yml', event: 'workflow_dispatch',
        repository: { full_name: repository }, head_repository: { full_name: repository }, head_branch: 'master', head_sha: original,
        actor: { type: 'User' }, triggering_actor: { type: 'User' }, status: 'completed', conclusion: 'success' } };
  assert.equal((await verifyIosWorkerRequest(args)).source, source);
  await assert.rejects(verifyIosWorkerRequest({ ...args, configuration: { ...configuration, serverUrl: 'https://other.invalid' } }), /external configuration/);
  await assert.rejects(verifyIosWorkerRequest({ ...args, run: { ...run, actor: { login: 'someone' } } }), /Actions-dispatched/);
  args.journal.operation = async () => ({ status: 'running', ids: ['98'], binding: hash(identity) });
  await assert.rejects(verifyIosWorkerRequest(args), /durable originating intent/);
});
test('concrete iOS worker checks source and EAS environment before signing, then verifies the downloaded IPA', async () => {
  const source = 'a'.repeat(40), plan = { digest: hash('plan'), configuration: hash(configuration),
    versions: { ios: { schemaVersion: 1, version: '1.2.3', buildNumber: '11', minimumSupportedVersion: '1.0.0' } } };
  const calls = [], build = { id: projectId, platform: 'IOS', app: { id: projectId }, gitCommitHash: source, buildProfile: 'production',
    appVersion: '1.2.3', appBuildVersion: '11', runtime: { version: 'ios-1.2.3-11' }, updateChannel: { name: 'production' },
    distribution: 'STORE', message: `calibrate:${source}:${plan.digest}`, isForIosSimulator: false, status: 'FINISHED',
    artifacts: { buildUrl: 'https://synthetic.invalid/ipa' } };
  const worker = iosBuildWorker({ configuration, teamId: 'ABCDEFGHIJ', assertSource: async () => calls.push('source'),
    execute: async args => { calls.push(args[0]); if (args[0] === 'env:pull') return environmentFile(args);
      return args[0] === 'build:view' ? build : args[0] === 'build:list' ? [] : [build]; },
    inspect: async (observed, expected, options) => {
      calls.push('inspect'); assert.equal(observed.id, expected.buildId); assert.equal(expected.configuration, hash(configuration));
      assert.equal(options.teamId, 'ABCDEFGHIJ'); assert.equal(expected.serverUrl, configuration.serverUrl);
      return { source, buildId: observed.id, artifactSha256: hash('exact IPA'), configuration: expected.configuration };
    } });
  const identity = worker.identity({ plan, source });
  await worker.start(identity); await worker.verify(projectId, identity);
  assert.deepEqual(calls, ['source', 'env:pull', 'source', 'build:list', 'source', 'env:pull', 'source', 'build', 'build:view', 'inspect']);
});
