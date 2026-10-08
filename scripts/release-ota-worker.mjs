import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { hash, bytes, SHA, verifyPlan } from './release-plan.mjs';
import { githubWorkflowProvider, downloadWorkflowReceipt } from './release-providers.mjs';
import { otaReceipt, verifyOtaReceipt } from './release-ios-receipt.mjs';
import { verifySelectedWorkerRequest } from './release-controller.mjs';
import { ReleaseJournal, githubJournalTransport, readAsset } from './release-journal.mjs';
import { releaseGithubApi } from './release-github.mjs';
import { externalBuildConfiguration } from './release-build-config.mjs';
import { sourceSnapshots, snapshotEnvironment } from './release-snapshot.mjs';
import { candidateGit } from './release-candidate.mjs';
import { loadReleaseBaselines } from './release-baselines.mjs';
import { easExecutor, verifyEasBuildEnvironment } from './release-ios-worker.mjs';
import { resolveOtaChannel, easOtaProvider } from './release-ota-provider.mjs';
import { createEnvironmentArtifact, verifyEnvironmentArtifact, createEnvironmentPublisherProject,
  createUpdateArtifact, verifyUpdateArtifact, createUpdatePublisherProject, listFiles, validateExpoExport } from './expo-ota-artifact.mjs';
import { createIosOtaArtifact, verifyIosOtaArtifact, createIosOtaPublisher } from './ios-ota-artifact.mjs';

export function otaWorkflowIdentity({ plan, stage, source }) {
  verifyPlan(plan);
  assert(SHA.test(source) && stage?.kind === 'ota' && plan.stages.some(value => hash(value) === hash(stage)), 'OTA stage is not selected by this plan.');
  return { source, planDigest: plan.digest, configurationDigest: plan.configuration,
    title: `Unified OTA ${plan.runId} ${stage.key} ${plan.digest}`,
    inputs: { parent_run_id: plan.runId, plan_digest: plan.digest, source_commit: source, profile: plan.profile, stage: stage.key } };
}

export function otaGithubWorker({ root, repository, api, plan, stage, assertSource, currentMaster, retainedReceipt,
  ghPath = 'gh', execute = execFileSync, verifyReceipt = verifyOtaReceipt }) {
  const provider = githubWorkflowProvider({ repository, api, workflow: 'unified-ota-release.yml', assertSource,
    verifyResult: async (run, identity) => {
      const receipt = retainedReceipt ?? downloadWorkflowReceipt({ root, repository, runId: run.id, name: 'unified-ota-receipt',
        fileName: 'ota-receipt.json', encode: value => bytes(otaReceipt(value)), execute, ghPath });
      const master = await currentMaster();
      await verifyReceipt({ root, repository, receipt, currentMaster: master, ghPath, execute,
        expected: { source: identity.source, workflowSha: identity.source, planDigest: plan.digest, configuration: plan.configuration,
          profile: plan.profile, platform: stage.platform, runtime: stage.runtime, baseline: stage.baseline,
          input: plan.inputs.native[stage.platform], bundleInput: plan.inputs.bundle[stage.platform] } });
      assert.equal(await currentMaster(), master, 'OTA receipt trust policy changed during verification.');
      return receipt;
    } });
  return { ...provider, identity: args => otaWorkflowIdentity({ ...args, stage }) };
}

export function bindOtaBaseline({ plan, stage, baseline, sourceInputs, configuration }) {
  assert(stage.kind === 'ota' && baseline.kind === 'native' && baseline.id === stage.baseline && baseline.platform === stage.platform &&
    baseline.profile === plan.profile && baseline.runtime === stage.runtime && baseline.configuration === plan.configuration &&
    plan.configuration === hash(configuration) && baseline.input === plan.inputs.native[stage.platform] &&
    sourceInputs.native[stage.platform] === baseline.input && sourceInputs.bundle[stage.platform] === plan.inputs.bundle[stage.platform],
  'OTA source, native fingerprint, runtime or external configuration is incompatible with its verified native receipt.');
  return baseline;
}

/** The separate GitHub writer stores this before the source-free Expo publisher receives credentials. */
export function otaPublicationIntent({ plan, stage, source, workerRunId, exportDigest, channelBinding }) {
  otaWorkflowIdentity({ plan, stage, source });
  assert(/^[1-9]\d*$/.test(workerRunId) && /^[a-f0-9]{64}$/.test(exportDigest), 'Missing exact OTA export identity.');
  return { schema: 1, source, planDigest: plan.digest, stage: stage.key, workerRunId, exportDigest,
    channelDigest: hash(channelBinding), configuration: plan.configuration };
}

export async function publishOtaAttempt({ provider, identity, runAttempt, intent, workerRunId }) {
  assert(intent.source === identity.source && intent.planDigest === identity.planDigest && intent.exportDigest === identity.exportDigest &&
    intent.configuration === identity.configurationDigest && intent.channelDigest === hash(identity.channelBinding), 'Durable OTA publication intent differs.');
  const ids = await provider.find(identity);
  assert(Array.isArray(ids) && ids.length <= 1 && new Set(ids).size === ids.length, 'Ambiguous OTA publication requires reconciliation.');
  if (!ids.length) assert(runAttempt === 1 && intent.workerRunId === workerRunId,
    'Unknown OTA publication outcome; an empty retry inventory cannot authorize another update.');
  const id = ids[0] ?? await provider.start(identity);
  return provider.verify(id, identity);
}

export async function runOtaWorkerCli(argv = process.argv.slice(2), environment = process.env) {
  assert(argv.length === 1 && ['verify', 'environment', 'export', 'intent', 'publish'].includes(argv[0]), 'Usage: release-ota-worker.mjs verify|environment|export|intent|publish');
  const root = process.cwd(), repository = environment.GITHUB_REPOSITORY, runId = environment.GITHUB_RUN_ID;
  const attempt = Number(environment.GITHUB_RUN_ATTEMPT), source = environment.WORKFLOW_SHA;
  assert(/^[1-9]\d*$/.test(runId) && Number.isSafeInteger(attempt) && attempt > 0 && SHA.test(source), 'Missing OTA worker identity.');
  const inputs = JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, 'utf8')).inputs;
  const api = releaseGithubApi({ repository, token: environment.GITHUB_TOKEN });
  const transport = githubJournalTransport({ repository, token: environment.GITHUB_TOKEN });
  const journal = new ReleaseJournal(transport, inputs.parent_run_id);
  const configuration = externalBuildConfiguration(root, inputs.profile, environment);
  const run = await api(`/repos/${repository}/actions/runs/${runId}/attempts/${attempt}`);
  assert(String(run.id) === runId && run.run_attempt === attempt, 'OTA worker attempt differs.');
  let stage;
  const { plan } = await verifySelectedWorkerRequest({ root, repository, run, workflowSha: source, inputs, journal, api, configuration,
    workflow: 'unified-ota-release.yml', stageKey: inputs.stage,
    identityFor: ({ plan, source }) => {
      stage = plan.stages.find(value => value.key === inputs.stage);
      return otaWorkflowIdentity({ plan, stage, source });
    } });
  const git = candidateGit(root);
  const currentMaster = async () => {
    const master = (await api(`/repos/${repository}/git/ref/heads/master`)).object.sha;
    assert(SHA.test(master)); git(['fetch', '--no-tags', 'origin', master]); return master;
  };
  const snapshots = sourceSnapshots({ root, environment });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ota-worker-'));
  try {
    const { unifiedWorkerFactories } = await import('./unified-release.mjs');
    const factories = unifiedWorkerFactories({ root, repository, api, currentMaster, configuration, options: {}, ghPath: environment.GH_CLI ?? 'gh' });
    const snapshot = async (revision, profile) => { git(['fetch', '--no-tags', 'origin', revision]); return snapshots.snapshot(revision, profile); };
    const [baseline] = await loadReleaseBaselines({ repository, transport, api, snapshot, receiptId: stage.baseline,
      verifyWorker: async ({ stage, result, plan }) => {
        const worker = factories.workerFor({ plan, stage, retainedReceipt: result.receipt, forReceipt: true });
        git(['fetch', '--no-tags', 'origin', result.receipt.source]);
        const identity = worker.identity({ plan, stage, source: result.receipt.source });
        assert.equal(hash(identity), result.identity, 'Native baseline worker identity differs.');
        return worker.verify(result.id, identity);
      } });
    bindOtaBaseline({ plan, stage, baseline, sourceInputs: await snapshot(source, plan.profile), configuration });
    git(['merge-base', '--is-ancestor', baseline.source, source]);
    if (argv[0] === 'verify') return { source, stage: stage.key, baseline: baseline.id, configurationDigest: plan.configuration };
    const envFile = environment.OTA_ENVIRONMENT_FILE, channelFile = environment.OTA_CHANNEL_FILE;
    const artifactRoot = environment.OTA_ARTIFACT_DIRECTORY;
    const envTarget = { sourceCommit: source, channel: configuration.channel, environment: configuration.environment, projectId: configuration.projectId };
    const assertSource = async () => assert.equal(await currentMaster(), source, 'Protected source advanced; no new OTA publication is permitted.');
    if (argv[0] === 'environment') {
      const directory = path.join(temporary, 'environment');
      createEnvironmentPublisherProject({ outputDir: directory, projectId: configuration.projectId });
      const execute = easExecutor({ root, directory, environment });
      await verifyEasBuildEnvironment(execute, configuration);
      const values = { EXPO_PUBLIC_EAS_PROJECT_ID: configuration.projectId, EXPO_UPDATES_CHANNEL: configuration.channel,
        EXPO_PUBLIC_CALIBRATE_SERVER_URL: configuration.serverUrl };
      const raw = path.join(temporary, 'public.env');
      fs.writeFileSync(raw, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
      createEnvironmentArtifact({ environmentFile: raw, outputFile: envFile, ...envTarget });
      fs.writeFileSync(channelFile, bytes(await resolveOtaChannel(execute, configuration.channel)), { flag: 'wx', mode: 0o600 });
      return { status: 'verified-public-environment', configurationDigest: plan.configuration };
    }
    const publicEnvironment = verifyEnvironmentArtifact({ artifactFile: envFile, ...envTarget }).values;
    assert.equal(publicEnvironment.EXPO_PUBLIC_CALIBRATE_SERVER_URL, configuration.serverUrl, 'OTA endpoint drifted.');
    const lock = JSON.parse(git(['show', `${source}:package-lock.json`]));
    const target = { source, configuration, nativeFingerprint: baseline.input,
      sdkVersion: `${lock.packages['node_modules/expo'].version.split('.')[0]}.0.0`, expoUpdatesVersion: lock.packages['node_modules/expo-updates'].version };
    const android = { ...envTarget, nativeBuildRef: `native-v${baseline.runtime}` };
    if (argv[0] === 'export') {
      const output = path.join(temporary, 'export'), publicConfigFile = path.join(temporary, 'public.json');
      const env = { ...snapshotEnvironment(environment), ...publicEnvironment, EXPO_NO_DOTENV: '1', EXPO_NO_METRO_WORKSPACE_ROOT: '1', NODE_ENV: 'production',
        [`CALIBRATE_${stage.platform.toUpperCase()}_OTA_RUNTIME`]: baseline.runtime, [`CALIBRATE_${stage.platform.toUpperCase()}_OTA_EXPORT`]: '1' };
      const expo = path.join(root, 'node_modules/expo/bin/cli');
      const execute = args => execFileSync(process.execPath, [expo, ...args], { cwd: path.join(root, 'mobile'), env, encoding: 'utf8',
        windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      const config = JSON.parse(execute(['config', '--type', 'public', '--json']));
      execute(['export', '--platform', stage.platform, '--output-dir', output]);
      fs.writeFileSync(publicConfigFile, bytes(config));
      if (stage.platform === 'ios') createIosOtaArtifact({ inputDir: output, outputDir: artifactRoot, publicConfig: config,
        environmentArtifact: envFile, target, baseline });
      else createUpdateArtifact({ inputDir: output, outputDir: artifactRoot, publicConfigFile,
        packageLockFile: path.join(root, 'package-lock.json'), environmentArtifactFile: envFile, ...android });
      return { source, stage: stage.key, status: 'exported-without-provider-credentials' };
    }
    const verifyExport = () => {
      if (stage.platform === 'ios') verifyIosOtaArtifact({ artifactRoot, target, baseline });
      else assert.equal(verifyUpdateArtifact({ artifactRoot, ...android }).serverUrl, configuration.serverUrl, 'Android OTA endpoint differs.');
      const bundle = path.join(artifactRoot, 'bundle');
      return { metadata: validateExpoExport(bundle, stage.platform), files: listFiles(bundle) };
    };
    const exported = verifyExport(), channelBinding = JSON.parse(fs.readFileSync(channelFile, 'utf8'));
    const exportDigest = hash(exported), intentName = `ota-intent.${stage.key}.json`;
    const intent = otaPublicationIntent({ plan, stage, source, workerRunId: runId, exportDigest, channelBinding });
    if (argv[0] === 'intent') {
      await journal.put(intentName, intent);
      return { stage: stage.key, exportDigest, status: 'durable-publication-intent' };
    }
    assert.deepEqual(await readAsset(transport, await journal.assertActive(), intentName), intent, 'Missing or changed durable publication intent.');
    const directory = path.join(temporary, 'publisher');
    if (stage.platform === 'ios') createIosOtaPublisher({ outputDir: directory, artifactRoot, target, baseline });
    else createUpdatePublisherProject({ outputDir: directory, artifactRoot, ...android });
    const execute = easExecutor({ root, directory, environment });
    await verifyEasBuildEnvironment(execute, configuration);
    const provider = easOtaProvider({ execute, verifyExport, assertSource, inputDirectory: path.join(artifactRoot, 'bundle') });
    const identity = { source, planDigest: plan.digest, exportDigest, configuration, configurationDigest: plan.configuration,
      channelBinding, runtime: stage.runtime, platform: stage.platform };
    const observed = await publishOtaAttempt({ provider, identity, runAttempt: attempt, intent, workerRunId: runId });
    const receipt = otaReceipt({ schema: 1, kind: 'ota', platform: stage.platform, source, workflowSha: source,
      planDigest: plan.digest, configuration: plan.configuration, profile: plan.profile, runtime: stage.runtime, baseline: stage.baseline,
      input: baseline.input, bundleInput: plan.inputs.bundle[stage.platform], artifactSha256: observed.artifactSha256,
      exportDigest, group: observed.group, updateId: observed.updateId });
    fs.writeFileSync(environment.OTA_RECEIPT_FILE, bytes(receipt), { flag: 'wx', mode: 0o600 });
    return { source, stage: stage.key, exportDigest, status: 'verified-awaiting-attestation' };
  } finally {
    snapshots.close();
    assert(path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('calibrate-ota-worker-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOtaWorkerCli().then(value => console.log(JSON.stringify(value))).catch(() => {
    console.error('Selected OTA worker failed; retain the exact run and reconcile its source, native receipt, export and provider identity.'); process.exitCode = 1;
  });
}
