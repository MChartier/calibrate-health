import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { planRelease, hash } from './release-plan.mjs';
import { otaWorkflowIdentity, bindOtaBaseline, otaPublicationIntent, publishOtaAttempt, otaGithubWorker } from './release-ota-worker.mjs';
import { otaReceipt, verifyOtaReceipt } from './release-ios-receipt.mjs';

function fixture(platform = 'ios') {
  const source = 'a'.repeat(40), input = hash('native'), bundle = hash('new bundle');
  const configuration = { profile: 'production', environment: 'production', channel: 'production',
    projectId: '11111111-1111-4111-8111-111111111111', serverUrl: 'https://synthetic.invalid' };
  const inputs = { server: input, native: { android: input, ios: input }, bundle: { android: input, ios: input } };
  inputs.bundle[platform] = bundle;
  const receipts = ['server', 'android', 'ios'].map((p, i) => ({ schema: 1, id: `123:native-${p}:456`, sequence: i + 1,
    source, kind: p === 'server' ? 'server' : 'native', platform: p, profile: 'production', input,
    bundleInput: input, configuration: hash(configuration), artifactSha256: hash('artifact'), runtime: p === 'ios' ? 'ios-1.2.3-11' : '1.2.3' }));
  const plan = planRelease({ runId: '100', repository: 'example/app', source, currentSource: source, inputs, receipts,
    configuration: { profile: 'production', digest: hash(configuration), serverDigest: hash(configuration) },
    manifest: { server: { version: '1.2.3' }, android: { mobile: { version_name: '1.2.3', version_code: 11 }, wear: { version_name: '1.2.3', version_code: 12 } } },
    ios: { version: '1.2.3', buildNumber: '11' } });
  const stage = plan.stages[0], baseline = receipts.find(value => value.platform === platform);
  const channelBinding = { channelId: 'channel', branchId: 'branch', branch: 'production', mapping: hash('mapping') };
  const exportDigest = hash('exact exported metadata/files');
  const identity = { source, planDigest: plan.digest, exportDigest, configuration, configurationDigest: hash(configuration),
    runtime: stage.runtime, platform, channelBinding };
  const intent = otaPublicationIntent({ plan, stage, source, workerRunId: '500', exportDigest, channelBinding });
  return { source, configuration, inputs, plan, stage, baseline, identity, intent };
}

for (const platform of ['android', 'ios']) test(`${platform} OTA binds selected source/profile/runtime and independently verified native inputs`, () => {
  const f = fixture(platform), args = { ...f, sourceInputs: f.inputs };
  assert.equal(bindOtaBaseline(args), f.baseline);
  assert.equal(otaWorkflowIdentity(f).inputs.stage, f.stage.key);
  for (const key of ['configuration', 'input', 'runtime', 'id', 'profile']) {
    assert.throws(() => bindOtaBaseline({ ...args, baseline: { ...f.baseline, [key]: 'unrelated' } }), /incompatible/);
  }
  assert.throws(() => otaWorkflowIdentity({ ...f, stage: { ...f.stage, runtime: '9.9.9' } }), /not selected/);
  assert.throws(() => bindOtaBaseline({ ...args, sourceInputs: { ...f.inputs, native: { ...f.inputs.native, [platform]: hash('native drift') } } }), /incompatible/);
});

test('lost OTA response is adopted exactly once; repeated or empty retry results cannot republish', async () => {
  const f = fixture(); let starts = 0, visible = [];
  const provider = { find: async () => visible, start: async () => { starts++; visible = ['group']; throw Error('lost response'); },
    verify: async id => ({ id, verified: true }) };
  const args = { provider, identity: f.identity, intent: f.intent, workerRunId: '500', runAttempt: 1 };
  await assert.rejects(publishOtaAttempt(args), /lost response/);
  for (const runAttempt of [2, 3]) assert.deepEqual(await publishOtaAttempt({ ...args, runAttempt }), { id: 'group', verified: true });
  assert.equal(starts, 1);
  visible = []; await assert.rejects(publishOtaAttempt({ ...args, runAttempt: 4 }), /empty retry/);
  visible = ['one', 'two']; await assert.rejects(publishOtaAttempt({ ...args, runAttempt: 5 }), /Ambiguous/);
  assert.equal(starts, 1);
});

test('changed export, channel or source cannot use retained publication intent', async () => {
  const f = fixture(); const provider = { find: async () => { throw Error('must not contact provider'); } };
  for (const identity of [{ ...f.identity, exportDigest: hash('rebuilt differently') }, { ...f.identity, source: 'b'.repeat(40) },
    { ...f.identity, channelBinding: { branch: 'remapped' } }]) {
    await assert.rejects(publishOtaAttempt({ provider, identity, intent: f.intent, workerRunId: '500', runAttempt: 1 }), /intent differs/);
  }
  assert(!JSON.stringify(f.intent).includes(f.configuration.projectId));
  assert(!JSON.stringify(f.intent).includes(f.configuration.serverUrl));
});

test('OTA receipt requires the specific protected OTA signer and canonical source/configuration fields', async () => {
  const f = fixture(), uuid = '11111111-1111-4111-8111-111111111111';
  const receipt = otaReceipt({ schema: 1, kind: 'ota', platform: 'ios', source: f.source, workflowSha: f.source,
    planDigest: f.plan.digest, configuration: f.plan.configuration, input: f.baseline.input, bundleInput: f.inputs.bundle.ios,
    artifactSha256: hash('manifest bytes'), profile: 'production', runtime: f.stage.runtime, baseline: f.baseline.id,
    exportDigest: f.intent.exportDigest, group: uuid, updateId: uuid });
  const uri = 'https://github.com/example/app';
  const certificate = { buildSignerDigest: f.source, sourceRepositoryDigest: f.source, buildConfigDigest: f.source,
    githubWorkflowSHA: f.source, buildSignerURI: `${uri}/.github/workflows/unified-ota-release.yml@refs/heads/master`,
    sourceRepositoryURI: uri, sourceRepositoryRef: 'refs/heads/master', buildTrigger: 'workflow_dispatch', runnerEnvironment: 'github-hosted' };
  certificate.buildConfigURI = certificate.buildSignerURI;
  const args = { root: '.', repository: 'example/app', receipt, expected: { configuration: f.plan.configuration }, currentMaster: f.source,
    git: values => values[0] === 'show' ? '' : 'c'.repeat(40), execute: (_command, values) => {
      assert(values.includes('example/app/.github/workflows/unified-ota-release.yml'));
      return JSON.stringify([{ verificationResult: { signature: { certificate } } }]);
    } };
  assert.deepEqual(await verifyOtaReceipt(args), receipt);
  certificate.buildSignerURI = `${uri}/.github/workflows/native-ios-release.yml@refs/heads/master`;
  await assert.rejects(verifyOtaReceipt(args), /unrelated/);
  assert.throws(() => otaReceipt({ ...receipt, projectId: uuid }), /Unexpected/);
});

test('Android runtime override is limited to an explicit OTA export and cannot affect a native build', () => {
  const config = createRequire(import.meta.url)('../mobile/app.config.js');
  const base = { version: '1.2.4', android: { versionCode: 13 } };
  assert.equal(config({ config: base }, { CALIBRATE_ANDROID_OTA_RUNTIME: '1.2.3', CALIBRATE_ANDROID_OTA_EXPORT: '1' }).version, '1.2.3');
  for (const extra of [{}, { CALIBRATE_ANDROID_OTA_EXPORT: '1', EAS_BUILD: 'true' }]) {
    assert.throws(() => config({ config: base }, { CALIBRATE_ANDROID_OTA_RUNTIME: '1.2.3', ...extra }), /never a native build/);
  }
});
