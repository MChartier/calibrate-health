import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { easIosBuildProvider, githubWorkflowProvider, downloadWorkflowReceipt } from './release-providers.mjs';
import { inspectIosBuild } from './ios-artifact.mjs';
import { iosBuildRequest } from './ios-release.mjs';
import { hash, bytes, SHA, verifyPlan } from './release-plan.mjs';
import { resolveLockedEasCliInvocation, parseEasEnvironmentFile } from './native-ota-update.mjs';
import { externalBuildConfiguration, verifyResolvedBuildEnvironment } from './release-build-config.mjs';
import { ReleaseJournal, githubJournalTransport, readAsset } from './release-journal.mjs';
import { releaseGithubApi } from './release-github.mjs';
import { verifySelectedWorkerRequest } from './release-controller.mjs';
import { iosReceipt, verifyIosReceipt } from './release-ios-receipt.mjs';

export function iosWorkflowIdentity({ plan, source }) {
  verifyPlan(plan);
  assert(SHA.test(source) && plan.stages.some(stage => stage.key === 'native-ios'), 'Plan did not select an iOS build.');
  return { source, planDigest: plan.digest, configurationDigest: plan.configuration,
    title: `Unified iOS ${plan.runId} ${plan.digest}`,
    inputs: { parent_run_id: plan.runId, plan_digest: plan.digest, source_commit: source, profile: plan.profile } };
}

/** The coordinator receives no Expo/signing credential and trusts only the source-free verifier's attested bytes. */
export function iosGithubWorker({ root, repository, api, plan, assertSource, currentMaster,
  execute = execFileSync, ghPath = 'gh', verifyReceipt = verifyIosReceipt, retainedReceipt }) {
  async function verifyResult(run, identity) {
    const receipt = retainedReceipt ?? downloadWorkflowReceipt({ root, repository, runId: run.id,
      name: 'unified-ios-receipt', fileName: 'ios-receipt.json', encode: value => bytes(iosReceipt(value)), execute, ghPath });
    return verifyReceipt({ root, repository, receipt, ghPath, currentMaster: await currentMaster(),
      expected: { source: identity.source, workflowSha: identity.source, planDigest: plan.digest,
        configuration: plan.configuration, profile: plan.profile, input: plan.inputs.native.ios,
        bundleInput: plan.inputs.bundle.ios, runtime: `ios-${plan.versions.ios.version}-${plan.versions.ios.buildNumber}` } });
  }
  const provider = githubWorkflowProvider({ repository, api, workflow: 'native-ios-release.yml', assertSource, verifyResult });
  return { ...provider, identity: iosWorkflowIdentity };
}

/** Read-only admission precedes both the source build job and the source-free IPA verifier. */
export const verifyIosWorkerRequest = args => verifySelectedWorkerRequest({ ...args,
  workflow: 'native-ios-release.yml', stageKey: 'native-ios', identityFor: iosWorkflowIdentity });

/** Reruns reconcile exact provider identities; an empty inventory after interruption is not permission to spend again. */
export async function runIosBuildAttempt({ worker, identity, runAttempt }) {
  assert(Number.isSafeInteger(runAttempt) && runAttempt > 0, 'Missing exact worker attempt.');
  const ids = await worker.find(identity);
  assert(Array.isArray(ids) && new Set(ids).size === ids.length, 'Incomplete iOS build inventory.');
  const states = await Promise.all(ids.map(async id => ({ id, status: await worker.status(id, identity) })));
  const active = states.filter(value => value.status !== 'failed');
  assert(active.length <= 1, 'Multiple matching iOS builds require reconciliation.');
  if (active.length) return active[0];
  assert(runAttempt === 1 && ids.length === 0 || runAttempt > 1 && ids.length > 0,
    'Unknown iOS build outcome; an empty retry inventory cannot authorize another paid build.');
  return { id: await worker.start(identity), status: 'running' };
}

/** All CLI output stays private. The caller prints only sanitized plans, identities and status. */
export function easExecutor({ root, directory = path.join(root, 'mobile'), environment, execute = execFileSync }) {
  assert(environment.EXPO_TOKEN && environment.EXPO_PUBLIC_EAS_PROJECT_ID, 'Existing Expo authentication and project configuration are required.');
  return async (args, overrides = {}, json = true) => {
    const invocation = resolveLockedEasCliInvocation(root, args);
    let output;
    try {
      output = execute(invocation.command, invocation.args, { cwd: directory, encoding: 'utf8', windowsHide: true,
        env: { ...environment, ...overrides, EXPO_NO_DOTENV: '1', CI: '1' }, maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      throw Error(`EAS ${args[0]} failed (exit ${Number.isInteger(error.status) ? error.status : 'unknown'}); retain the operation for reconciliation.`);
    }
    if (!json) return;
    try { return JSON.parse(output); } catch { throw Error('EAS returned incomplete JSON; retain the operation for reconciliation.'); }
  };
}

/** Resolve the selected EAS environment without copying private variables into an artifact or log. */
export async function verifyEasBuildEnvironment(execute, configuration) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-eas-environment-'));
  try {
    const file = path.join(directory, 'environment.env');
    await execute(['env:pull', '--environment', configuration.environment, '--path', file, '--non-interactive'], {}, false);
    assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'EAS environment output is not a regular file.');
    return verifyResolvedBuildEnvironment(configuration, parseEasEnvironmentFile(fs.readFileSync(file, 'utf8')));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

/** Build signing is frozen; submission uses a separate request/runner and is never an implicit side effect. */
export function iosBuildWorker({ configuration, execute, assertSource, teamId, inspect = inspectIosBuild }) {
  const provider = easIosBuildProvider({ execute,
    assertSource: async identity => {
      await assertSource(identity);
      await verifyEasBuildEnvironment(execute, configuration);
      await assertSource(identity);
    },
    verifyArtifact: (build, binding) => inspect(build, {
      source: binding.source, buildId: build.id, configuration: hash(configuration),
      bundleIdentifier: 'app.calibratehealth.mobile', version: binding.version, buildNumber: binding.buildNumber,
      runtime: binding.runtime, projectId: configuration.projectId, channel: configuration.channel,
      serverUrl: configuration.serverUrl, distribution: configuration.profile === 'production' ? 'store' : 'internal'
    }, { teamId })
  });
  return { ...provider,
    identity: ({ plan, source }) => {
      assert.equal(plan.configuration, hash(configuration), 'Worker configuration differs from the immutable plan.');
      const identity = { source, planDigest: plan.digest, configuration, configurationDigest: hash(configuration),
        profile: configuration.profile, version: plan.versions.ios };
      iosBuildRequest(identity); return identity;
    }
  };
}

export async function runIosWorkerCli(argv = process.argv.slice(2), environment = process.env) {
  assert(argv.length === 1 && ['verify', 'build', 'receipt'].includes(argv[0]), 'Usage: release-ios-worker.mjs verify|build|receipt');
  const root = process.cwd(), repository = environment.GITHUB_REPOSITORY;
  const { GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: attempt, WORKFLOW_SHA: workflowSha } = environment;
  assert(/^[1-9]\d*$/.test(runId) && /^[1-9]\d*$/.test(attempt), 'Missing iOS worker run identity.');
  const event = JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, 'utf8'));
  const inputs = event.inputs;
  assert(inputs && /^[1-9]\d*$/.test(inputs.parent_run_id), 'Missing originating release run.');
  const api = releaseGithubApi({ repository, token: environment.GITHUB_TOKEN });
  const run = await api(`/repos/${repository}/actions/runs/${runId}/attempts/${attempt}`);
  assert(String(run.id) === runId && run.run_attempt === Number(attempt), 'iOS worker attempt differs.');
  const journal = new ReleaseJournal(githubJournalTransport({ repository, token: environment.GITHUB_TOKEN }), inputs.parent_run_id);
  const configuration = externalBuildConfiguration(root, inputs.profile, environment);
  assert(/^[A-Z0-9]{10}$/.test(environment.APPLE_TEAM_ID ?? ''), 'The existing external Apple team identity is required before any paid build.');
  const { plan, source } = await verifyIosWorkerRequest({ root, repository, run, workflowSha, inputs, journal, api, configuration });
  if (argv[0] === 'verify') return { source, planDigest: plan.digest, configurationDigest: plan.configuration };
  const assertSource = async () => assert.equal((await api(`/repos/${repository}/git/ref/heads/master`)).object.sha,
    source, 'Protected source advanced; no new iOS build is permitted.');
  let inert;
  try {
    // The attester never evaluates the application's config, hooks or dependencies.
    // Only the source build job runs EAS from mobile/ and that job has no write/OIDC authority.
    if (argv[0] === 'receipt') {
      inert = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ios-inspection-'));
      fs.writeFileSync(path.join(inert, 'app.json'), bytes({ expo: { name: 'Calibrate', slug: 'calibrate-health-app',
        extra: { eas: { projectId: configuration.projectId } } } }), { mode: 0o600 });
      fs.writeFileSync(path.join(inert, 'package.json'), bytes({ private: true, name: 'calibrate-ios-inspection', version: '0.0.0' }));
    }
    const execute = easExecutor({ root, directory: inert ?? path.join(root, 'mobile'), environment });
    const worker = iosBuildWorker({ configuration, execute, assertSource, teamId: environment.APPLE_TEAM_ID });
    const identity = worker.identity({ plan, source });
    if (argv[0] === 'build') {
      const result = await runIosBuildAttempt({ worker, identity, runAttempt: Number(attempt) });
      for (let poll = 0; poll < 160; poll++) {
        const status = await worker.status(result.id, identity);
        assert(status !== 'failed', 'iOS build failed; retain its ID and explicitly rerun only after reconciliation.');
        if (status === 'complete') {
          fs.appendFileSync(environment.GITHUB_OUTPUT, `build_id=${result.id}\n`);
          return { buildId: result.id, status: 'built-awaiting-verification' };
        }
        await new Promise(resolve => setTimeout(resolve, 30_000));
      }
      throw Error('iOS build is still running; rerun this retained worker after provider completion.');
    }
    const buildId = environment.IOS_BUILD_ID;
    assert((await worker.find(identity)).includes(buildId), 'IPA verifier could not reconcile the exact requested build.');
    const observed = await worker.verify(buildId, identity);
    const receipt = iosReceipt({ schema: 1, kind: 'native', platform: 'ios', source, workflowSha,
      planDigest: plan.digest, configuration: plan.configuration, input: plan.inputs.native.ios,
      bundleInput: plan.inputs.bundle.ios, artifactSha256: observed.artifactSha256, buildId, profile: plan.profile, runtime: observed.runtime });
    fs.writeFileSync(environment.IOS_RECEIPT_FILE, bytes(receipt), { flag: 'wx', mode: 0o600 });
    return { buildId, source, artifactSha256: receipt.artifactSha256, status: 'verified-awaiting-attestation' };
  } finally {
    if (inert) {
      assert(path.dirname(inert) === os.tmpdir() && path.basename(inert).startsWith('calibrate-ios-inspection-'));
      fs.rmSync(inert, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runIosWorkerCli().then(value => console.log(JSON.stringify(value))).catch(error => {
    // Avoid the assert inspector and provider output, which can include external account configuration.
    console.error('Selected iOS worker failed; reconcile its exact source, configuration, retained run and provider build before retrying.'); process.exitCode = 1;
  });
}
