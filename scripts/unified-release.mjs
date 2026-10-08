import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { protectedReleaseContext, prepareUnifiedPlan, prepareUnifiedSource } from './release-controller.mjs';
import { verifyReleaseRequestArtifact } from './release-request.mjs';
import { reconcileCandidates } from './release-retirement.mjs';
import { runReleasePlan } from './release-runner.mjs';
import { verifyPlan, SHA, hash } from './release-plan.mjs';
import { githubWorkflowProvider, downloadWorkflowReceipt } from './release-providers.mjs';
import { candidateGit } from './release-candidate.mjs';
import { serializeUnifiedAndroidReceipt, parseNativePlayAttestationWorkflowCandidates,
  authorizeNativePlayReceiptWorkflow } from './native-play-receipt.mjs';
import { verifyNativeTagAttestation } from './native-tag-attestation.mjs';
import { verifyPublishedImage } from './release-image.mjs';
import { serverHandoffProvider } from './release-server-handoff.mjs';
import { iosGithubWorker } from './release-ios-worker.mjs';
import { otaGithubWorker } from './release-ota-worker.mjs';
import { externalBuildConfiguration } from './release-build-config.mjs';
import { sourceSnapshots } from './release-snapshot.mjs';
import { loadReleaseBaselines } from './release-baselines.mjs';
import { ReleaseJournal, githubJournalTransport, readAsset } from './release-journal.mjs';
import { releaseGithubApi, githubCandidate, verifyAndroidAllocation } from './release-github.mjs';
import { githubRetirement } from './release-retirement-github.mjs';
import { waitForCi } from './release-ci-gate.mjs';
import { nativeCandidateRequest, verifyExecutionSource } from './release-source.mjs';

/** The maintained paired Android worker remains the sole signing, Play and tag authority. */
export function androidWorkflowIdentity({ plan, source, confirmPlayConsoleClean }) {
  verifyPlan(plan);
  assert(SHA.test(source) && ['production', 'internal'].includes(plan.profile) && plan.stages.some(stage => stage.key === 'native-android'),
    'The paired Android store worker requires a selected build profile.');
  assert(confirmPlayConsoleClean === true, 'The paired Android worker requires the original explicit Play Console acknowledgement.');
  return { source, planDigest: plan.digest, configurationDigest: plan.configuration,
    title: `Unified Android ${source} ${plan.digest}`,
    inputs: { source_commit: source, operation: 'upload-internal', confirm_play_console_clean: true,
      unified_plan_digest: plan.digest, configuration_digest: plan.configuration, build_profile: plan.profile } };
}

export async function verifyAndroidWorkerReceipt({ root, repository, plan, source, receipt, api, currentMaster,
  execute = execFileSync, ghPath = 'gh', git = candidateGit(root), verifyTag = verifyNativeTagAttestation,
  authorize = authorizeNativePlayReceiptWorkflow }) {
  const content = serializeUnifiedAndroidReceipt(receipt);
  assert.deepEqual(JSON.parse(content), receipt, 'Unexpected Android receipt fields or identity.');
  assert(receipt.source === source && receipt.planDigest === plan.digest && receipt.configuration === plan.configuration &&
    receipt.profile === plan.profile && receipt.runtime === plan.versions.android.mobile.version_name &&
    receipt.pairedReceipt.repository === repository &&
    receipt.pairedReceipt.releases.phone.version_code === plan.versions.android.mobile.version_code &&
    receipt.pairedReceipt.releases.watch.version_code === plan.versions.android.wear.version_code,
  'Paired Android receipt differs from its planned source, configuration or allocation.');
  const master = await currentMaster();
  authorize({ repositoryRoot: root, trustSet: git(['show', `${master}:.github/native-play-attestation-trusted-workflow-shas`]),
    candidateWorkflowRevision: source, currentWorkflowRevision: master, trustedMasterCommit: master, sourceCommit: source });
  const tag = receipt.pairedReceipt.native_release_tag, route = `/repos/${repository}/git/ref/tags/${tag}`;
  const remote = await api(route);
  assert(remote.ref === `refs/tags/${tag}` && remote.object?.type === 'tag' && SHA.test(remote.object.sha), 'Published signed native tag is missing.');
  git(['fetch', '--no-tags', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);
  assert.equal(git(['rev-parse', `refs/tags/${tag}^{tag}`]).trim(), remote.object.sha, 'Local and remote native tag objects differ.');
  verifyTag({ repositoryRoot: root, tag, expectedCommit: source,
    allowedSigners: git(['show', `${master}:.github/native-release-tag-allowed-signers`]) });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-android-receipt-'));
  try {
    const file = path.join(directory, 'receipt.json'); fs.writeFileSync(file, content, { mode: 0o600 });
    let verified;
    try {
      verified = execute(ghPath, ['attestation', 'verify', file, '--repo', repository,
        '--signer-workflow', `${repository}/.github/workflows/native-release.yml`, '--signer-digest', source, '--source-digest', source,
        '--source-ref', 'refs/heads/master', '--predicate-type', 'https://slsa.dev/provenance/v1', '--limit', '100',
        '--deny-self-hosted-runners', '--format', 'json'],
      { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { throw Error('Paired Android receipt attestation failed; no native baseline admitted.'); }
    parseNativePlayAttestationWorkflowCandidates(verified, repository, source);
    assert.equal((await api(route)).object.sha, remote.object.sha, 'Native tag changed during receipt verification.');
    assert.equal(await currentMaster(), master, 'Native receipt trust policy changed during verification.');
    return receipt;
  } finally {
    assert(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('calibrate-android-receipt-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export function androidGithubWorker({ root, repository, api, plan, confirmPlayConsoleClean, assertSource, currentMaster,
  execute = execFileSync, ghPath = 'gh', retainedReceipt, verifyReceipt = verifyAndroidWorkerReceipt }) {
  const provider = githubWorkflowProvider({ repository, api, workflow: 'native-release.yml', assertSource,
    verifyResult: async (run, identity) => {
      const receipt = retainedReceipt ?? downloadWorkflowReceipt({ root, repository, runId: run.id, name: 'unified-android-receipt',
        fileName: 'unified-android-receipt.json', encode: serializeUnifiedAndroidReceipt, execute, ghPath });
      return verifyReceipt({ root, repository, plan, source: identity.source, receipt, api, currentMaster, execute, ghPath });
    } });
  return { ...provider, identity: args => androidWorkflowIdentity({ ...args, confirmPlayConsoleClean }) };
}

export function imageGithubWorker({ root, repository, api, plan, assertSource, currentMaster, retainedReceipt,
  execute = execFileSync, ghPath = 'gh', git = candidateGit(root), verifyImage = verifyPublishedImage }) {
  return serverHandoffProvider({ repository, api, assertSource, verifyResult: async (_run, identity) => {
    const releaseTag = `v${plan.versions.server}`;
    const ref = await api(`/repos/${repository}/git/ref/tags/${releaseTag}`);
    assert(ref.ref === `refs/tags/${releaseTag}` && ref.object?.type === 'tag' && SHA.test(ref.object.sha), 'Expected annotated server tag is missing.');
    const tag = await api(`/repos/${repository}/git/tags/${ref.object.sha}`);
    assert(tag.tag === releaseTag && tag.object?.type === 'commit' && SHA.test(tag.object.sha), 'Server tag target differs.');
    const releaseCommit = tag.object.sha;
    const candidate = await api(`/repos/${repository}/git/commits/${releaseCommit}`);
    assert(candidate.parents?.length === 1 && candidate.parents[0].sha === identity.source,
      'Server candidate is not the exact child of this selected execution source.');
    git(['fetch', '--no-tags', 'origin', releaseCommit]);
    const master = await currentMaster();
    let digest = retainedReceipt ? `sha256:${retainedReceipt.artifactSha256}` : undefined;
    if (!digest) {
      try { digest = execute('docker', ['buildx', 'imagetools', 'inspect', '--format', '{{.Manifest.Digest}}',
        `ghcr.io/${repository.split('/')[0].toLowerCase()}/calibratehealth:${releaseTag}`],
      { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
      catch { throw Error('Selected image digest is unavailable; preserve the server operation for reconciliation.'); }
    }
    const receipt = await verifyImage({ root, repository, releaseCommit, releaseTag, expectedDigest: digest,
      currentWorkflowRevision: master, trustedMasterCommit: master, execute, ghPath });
    assert.equal(await currentMaster(), master, 'Image trust policy changed during verification.');
    return { ...receipt, configuration: plan.serverConfiguration };
  } });
}

/** Fixed maintained worker factories; no executable configuration or arbitrary provider plug-ins. */
export function unifiedWorkerFactories({ root, repository, api, currentMaster, configuration, options,
  ghPath = 'gh', otaWorkerFactory = otaGithubWorker }) {
  const assertSource = async ({ source }) => assert.equal(await currentMaster(), source,
    'Protected master advanced; no new provider request is permitted.');
  const workerFor = ({ plan, stage, retainedReceipt, forReceipt = false }) => {
    const common = { root, repository, api, plan, assertSource, currentMaster, ghPath, retainedReceipt };
    if (stage.kind === 'server') return imageGithubWorker(common);
    if (stage.kind === 'native' && stage.platform === 'android') return androidGithubWorker({ ...common,
      confirmPlayConsoleClean: forReceipt ? true : options.confirm_play_console_clean });
    if (stage.kind === 'native' && stage.platform === 'ios') return iosGithubWorker(common);
    assert(stage.kind === 'ota' && typeof otaWorkerFactory === 'function', 'Selected OTA worker is not available; no candidate may be allocated.');
    return otaWorkerFactory({ ...common, configuration, stage });
  };
  return { assertSource, workerFor,
    preflight: async ({ plan }) => {
      for (const stage of plan.stages) {
        const worker = workerFor({ plan, stage });
        // Verify the complete identity before candidate writes or provider dispatch.
        worker.identity({ plan, stage, source: plan.source });
        const workflow = stage.kind === 'server' ? 'unified-server-request.yml' :
          stage.kind === 'ota' ? 'unified-ota-release.yml' : stage.platform === 'ios' ? 'native-ios-release.yml' : 'native-release.yml';
        const selected = await api(`/repos/${repository}/actions/workflows/${workflow}`);
        assert(selected.state === 'active' && selected.path === `.github/workflows/${workflow}`, 'A selected maintained worker is unavailable.');
      }
    }
  };
}

/** Old attempts may reconcile after ordinary source changes, but never after the protected release tooling changes. */
export async function verifyUnifiedTooling({ repository, workflowSha, master, api }) {
  assert(SHA.test(workflowSha) && SHA.test(master), 'Missing protected tooling identity.');
  if (workflowSha === master) return;
  const prefix = `/repos/${repository}`;
  const identity = async revision => {
    const tree = await api(`${prefix}/git/trees/${revision}`);
    assert(tree.truncated === false && Array.isArray(tree.tree), 'Protected tooling tree is incomplete.');
    const scripts = tree.tree.filter(entry => entry.path === 'scripts' && entry.type === 'tree');
    const workflow = await api(`${prefix}/contents/.github/workflows/unified-release-handler.yml?ref=${revision}`);
    assert(scripts.length === 1 && SHA.test(scripts[0].sha) && workflow.type === 'file' && SHA.test(workflow.sha), 'Protected tooling is missing.');
    return { scripts: scripts[0].sha, workflow: workflow.sha };
  };
  assert.deepEqual(await identity(workflowSha), await identity(master),
    'Protected release tooling changed; this old attempt cannot receive mutation authority. Reconcile with current reviewed tooling.');
}

export async function runUnifiedReleaseCli(argv = process.argv.slice(2), environment = process.env) {
  assert(argv.length === 1 && ['request', 'plan', 'execute'].includes(argv[0]), 'Usage: unified-release.mjs request|plan|execute');
  const root = process.cwd(), repository = environment.GITHUB_REPOSITORY, token = environment.GITHUB_TOKEN;
  const api = releaseGithubApi({ repository, token });
  const { context, options } = await verifiedUnifiedRequest({ repository, repositoryId: environment.GITHUB_REPOSITORY_ID,
    runId: environment.GITHUB_RUN_ID, runAttempt: environment.GITHUB_RUN_ATTEMPT, workflowSha: environment.WORKFLOW_SHA,
    event: JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, 'utf8')), artifactDirectory: environment.REQUEST_DIRECTORY, api });
  if (argv[0] === 'request') {
    fs.appendFileSync(environment.GITHUB_OUTPUT, `profile=${options.profile}\n`);
    return { source: context.source, profile: options.profile, planOnly: options.plan_only };
  }
  assert(argv[0] !== 'execute' || options.plan_only === false, 'The operator requested planning only.');
  const configuration = externalBuildConfiguration(root, options.profile, environment);
  const serverConfiguration = { image: `ghcr.io/${repository.split('/')[0].toLowerCase()}/calibratehealth`,
    platform: 'linux/amd64', dockerfile: 'Dockerfile.app' };
  const git = candidateGit(root), fetched = new Set();
  const fetchSource = source => {
    assert(SHA.test(source), 'Missing exact remote source.');
    if (!fetched.has(source)) { git(['fetch', '--no-tags', 'origin', source]); fetched.add(source); }
    return source;
  };
  const currentMaster = async () => fetchSource((await api(`/repos/${repository}/git/ref/heads/master`)).object.sha);
  await verifyUnifiedTooling({ repository, workflowSha: environment.WORKFLOW_SHA, master: await currentMaster(), api });
  const transport = githubJournalTransport({ repository, token }), journal = new ReleaseJournal(transport, context.runId);
  const candidates = githubCandidate({ root, repository, api, waitCi: waitForCi });
  const snapshots = sourceSnapshots({ root, environment });
  const factories = unifiedWorkerFactories({ root, repository, api, currentMaster, configuration, options, ghPath: environment.GH_CLI ?? 'gh' });
  try {
    const loadBaselines = () => loadReleaseBaselines({ repository, transport, api,
      snapshot: (source, profile) => snapshots.snapshot(fetchSource(source), profile),
      verifyWorker: async ({ stage, result, plan }) => {
        const worker = factories.workerFor({ plan, stage, retainedReceipt: result.receipt, forReceipt: true });
        const source = stage.kind === 'server' ? (await api(`/repos/${repository}/actions/runs/${result.id}`)).head_sha : result.receipt.source;
        fetchSource(source);
        const identity = worker.identity({ plan, stage, source });
        assert.equal(hash(identity), result.identity, 'Retained worker identity differs from its planned request.');
        return worker.verify(result.id, identity);
      } });
    if (argv[0] === 'execute') assert(/^[a-f0-9]{64}$/.test(environment.EXPECTED_PLAN_DIGEST ?? ''), 'The preceding read-only plan identity is required.');
    const result = await executeUnifiedRequest({ root, context, configuration, serverConfiguration, journal, candidates,
      expectedPlanDigest: argv[0] === 'execute' ? environment.EXPECTED_PLAN_DIGEST : undefined,
      options: { ...options, plan_only: argv[0] === 'plan' || options.plan_only },
      snapshot: (source, profile) => snapshots.snapshot(fetchSource(source), profile), loadBaselines,
      readVersions: async source => ({ manifest: JSON.parse(git(['show', `${source}:shared/release.json`])),
        ios: JSON.parse(git(['show', `${source}:shared/ios-release.json`])) }),
      retirement: githubRetirement({ repository, api, transport, candidates }),
      preflight: async args => {
        await factories.preflight(args);
        const request = nativeCandidateRequest(args.plan);
        if (request) await verifyAndroidAllocation({ root, request });
      },
      verifySource: async args => { fetchSource(args.source); return verifyExecutionSource(args); },
      workersForSource: async ({ plan }) => {
        const workers = {};
        for (const stage of plan.stages) {
          const retained = await readAsset(transport, await journal.release(), `receipt.${stage.key}.json`);
          workers[stage.key] = factories.workerFor({ plan, stage, retainedReceipt: retained?.receipt });
        }
        return workers;
      },
      assertSource: factories.assertSource, polls: 180, pause: () => new Promise(resolve => setTimeout(resolve, 30_000)) });
    console.log(JSON.stringify(result.summary));
    if (environment.GITHUB_OUTPUT) fs.appendFileSync(environment.GITHUB_OUTPUT,
      `execute=${argv[0] === 'plan' && !options.plan_only && !result.summary.noChange}\nprofile=${options.profile}\nplan_digest=${result.summary.planDigest}\n`);
    if (environment.GITHUB_STEP_SUMMARY) fs.appendFileSync(environment.GITHUB_STEP_SUMMARY,
      `## ${result.status}\n\n\`\`\`json\n${JSON.stringify(result.summary, null, 2)}\n\`\`\`\n`);
    return result;
  } finally { snapshots.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUnifiedReleaseCli().catch(() => { console.error('Unified release rejected; retain its run and reconcile the exact request, source, configuration, CI and journal before retrying.'); process.exitCode = 1; });
}

/** Resolve both run attempts through GitHub before trusting a downloaded request. */
export async function verifiedUnifiedRequest({ repository, repositoryId, runId, runAttempt, workflowSha,
  event, artifactDirectory, api, verifyArtifact = verifyReleaseRequestArtifact }) {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository) && /^[1-9]\d*$/.test(String(repositoryId)) &&
    /^[1-9]\d*$/.test(String(runId)) && /^[1-9]\d*$/.test(String(runAttempt)), 'Missing protected handler identity.');
  const requested = event.workflow_run;
  assert(Number.isSafeInteger(requested?.id) && requested.id > 0 &&
    Number.isSafeInteger(requested.run_attempt) && requested.run_attempt > 0, 'Missing exact request attempt.');
  const prefix = `/repos/${repository}/actions/runs`;
  const [request, handler] = await Promise.all([
    api(`${prefix}/${requested.id}/attempts/${requested.run_attempt}`),
    api(`${prefix}/${runId}/attempts/${runAttempt}`)
  ]);
  assert(String(handler.id) === String(runId) && handler.run_attempt === Number(runAttempt) &&
    String(request.repository?.id) === String(repositoryId) && String(handler.repository?.id) === String(repositoryId) &&
    String(event.repository?.id) === String(repositoryId), 'Request or handler repository/attempt differs.');
  const context = protectedReleaseContext({ request, handler, event, repository, workflowSha });
  const options = verifyArtifact({ artifactDirectory, operation: 'unified-release', repository,
    repositoryId: String(repositoryId), runId: String(request.id), runAttempt: String(request.run_attempt),
    headBranch: request.head_branch, headSha: request.head_sha });
  return { context, options };
}

/** Public plan output excludes endpoint, project, team and signing configuration values. */
export function releasePlanSummary(plan, mode) {
  verifyPlan(plan);
  assert(['plan-only', 'execute'].includes(mode), 'Unknown release mode.');
  return { schema: 1, mode, source: plan.source, planDigest: plan.digest, profile: plan.profile,
    configurationDigest: plan.configuration, serverConfigurationDigest: plan.serverConfiguration,
    noChange: plan.noChange, versions: plan.versions,
    stages: plan.stages.map(({ key, kind, platform, runtime, reason }) => ({ key, kind,
      ...(platform ? { platform } : {}), ...(runtime ? { runtime } : {}), reason })) };
}

/** The handler supplies separately scoped transports; planning never calls mutation adapters. */
export async function executeUnifiedRequest({ options, retirement, preflight, workersForSource, expectedPlanDigest,
  assertSource, polls, pause, ...planning }) {
  assert(options.operation === 'unified-release' && typeof options.plan_only === 'boolean' &&
    options.profile === planning.configuration.profile, 'Protected request and build profile differ.');
  const { plan, resumed } = await prepareUnifiedPlan({ ...planning, bump: options.server_bump });
  if (expectedPlanDigest !== undefined) assert.equal(plan.digest, expectedPlanDigest,
    'The read-only plan changed before execution; no candidate or provider request was sent.');
  const summary = releasePlanSummary(plan, options.plan_only ? 'plan-only' : 'execute');
  if (options.plan_only || plan.noChange) return { status: plan.noChange ? 'no-change' : 'planned', summary, resumed };
  assert(typeof preflight === 'function' && typeof workersForSource === 'function' && typeof assertSource === 'function' &&
    retirement && typeof retirement.inspect === 'function' && typeof retirement.closePull === 'function',
  'Required release authority adapters are missing; no candidate or provider request was sent.');
  // Validate selected worker availability, allocation authority and operator inputs
  // before writing version metadata. Preflight has no provider-write capability.
  await preflight({ plan, configuration: planning.configuration, options });
  await reconcileCandidates(planning.journal.transport, plan.runId, retirement.inspect, retirement.closePull);
  const execution = await prepareUnifiedSource({ ...planning, plan });
  const workers = await workersForSource({ plan, source: execution.source });
  const result = await runReleasePlan({ plan, journal: planning.journal, workers, source: execution.source,
    assertSource, polls, pause });
  return { ...result, summary, resumed, source: execution.source };
}
