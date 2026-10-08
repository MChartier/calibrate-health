import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { planRelease, hash, byteHash } from './release-447/scripts/release-plan.mjs';
import { releasePlanSummary, androidWorkflowIdentity, executeUnifiedRequest } from './release-447/scripts/unified-release.mjs';
import { iosWorkflowIdentity } from './release-447/scripts/release-ios-worker.mjs';
import { otaWorkflowIdentity, otaPublicationIntent, publishOtaAttempt } from './release-447/scripts/release-ota-worker.mjs';
import { iosBuildRequest, iosSubmitRequest } from './release-447/scripts/ios-release.mjs';
import { ReleaseJournal } from './release-447/scripts/release-journal.mjs';
import { runReleaseOperation } from './release-447/scripts/release-operation.mjs';

const root = path.resolve('release-447'), output = path.resolve('release-447-published-evidence');
fs.mkdirSync(output, { recursive: true });
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const raw = args => execFileSync('git', args, { cwd: root });
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
const head = git(['rev-parse', 'HEAD']), parent = '0c26cea12e3ecdbc962eebaeb140af35f54ab95a';
assert.equal(git(['status', '--porcelain']), '');
const configuration = { profile: 'production', environment: 'production', channel: 'production',
  projectId: '11111111-1111-4111-8111-111111111111', serverUrl: 'https://synthetic.invalid' };
const serverConfiguration = { image: 'synthetic-image' }, digest = hash('unchanged input'), source = 'a'.repeat(40);
const manifest = { server: { version: '1.2.3' }, android: { mobile: { version_name: '0.2.7', version_code: 11 }, wear: { version_name: '0.2.7', version_code: 12 } } };
const ios = { schemaVersion: 1, version: '0.2.7', buildNumber: '11', minimumSupportedVersion: '0.2.7' };
function fixture() {
  return { runId: '100', requestRunId: '99', requestRunAttempt: 1, repository: 'synthetic/calibrate', source, currentSource: source,
    configuration: { profile: configuration.profile, digest: hash(configuration), serverDigest: hash(serverConfiguration) }, manifest, ios,
    inputs: { server: digest, native: { android: digest, ios: digest }, bundle: { android: digest, ios: digest } },
    receipts: ['server', 'android', 'ios'].map((platform, index) => ({ schema: 1, id: `123:native-${platform}:456`, sequence: index + 1,
      source, kind: platform === 'server' ? 'server' : 'native', platform, profile: 'production', input: digest, bundleInput: digest,
      configuration: hash(platform === 'server' ? serverConfiguration : configuration), artifactSha256: hash('exact fixture artifact'),
      runtime: platform === 'ios' ? 'ios-0.2.7-11' : '0.2.7' })) };
}
const scenarios = [];
for (const scenario of ['no-change', 'server', 'android-native', 'ios-native', 'android-ota', 'ios-ota', 'combined']) {
  const args = fixture();
  if (scenario === 'server' || scenario === 'combined') args.inputs.server = hash('changed image');
  for (const platform of ['android', 'ios']) {
    if (scenario === `${platform}-native` || scenario === 'combined') args.inputs.native[platform] = hash('changed native');
    if (scenario === `${platform}-ota`) args.inputs.bundle[platform] = hash('changed bundle');
  }
  const plan = planRelease(args), summary = releasePlanSummary(plan, 'plan-only');
  const expected = scenario === 'no-change' ? [] : scenario === 'combined' ? ['native-android', 'native-ios', 'server'] :
    scenario === 'server' ? ['server'] : scenario.endsWith('-native') ? [`native-${scenario.split('-')[0]}`] :
      [`ota-${scenario.split('-')[0]}-${scenario.startsWith('ios') ? 'ios-0.2.7-11' : '0.2.7'}`];
  assert.deepEqual(summary.stages.map(stage => stage.key), expected);
  const workerArguments = plan.stages.filter(stage => stage.kind !== 'server').map(stage => stage.kind === 'ota' ?
    otaWorkflowIdentity({ plan, stage, source }).inputs : stage.platform === 'android' ?
      androidWorkflowIdentity({ plan, source, confirmPlayConsoleClean: true }).inputs : iosWorkflowIdentity({ plan, source }).inputs);
  scenarios.push({ scenario, expected, observed: summary, workerArguments });
}
const unchanged = fixture();
let writes = 0;
const noChange = await executeUnifiedRequest({ root, context: { runId: '100', repository: unchanged.repository, source },
  options: { operation: 'unified-release', profile: 'production', plan_only: false, server_bump: 'patch' }, configuration, serverConfiguration,
  journal: { runId: '100', release: async () => undefined, create: async () => { writes++; } }, candidates: { master: async () => source },
  snapshot: async () => unchanged.inputs, readVersions: async () => ({ manifest, ios }), loadBaselines: async () => unchanged.receipts });
assert.equal(noChange.status, 'no-change'); assert.equal(writes, 0);
const releases = [], contents = new Map(); let assetId = 1;
const transport = { releases: async () => structuredClone(releases), release: async id => structuredClone(releases.find(value => value.id === id)),
  create: async value => releases.push({ ...value, id: 1, author: { login: 'github-actions[bot]' }, assets: [] }), download: async id => contents.get(id),
  upload: async (id, name, value) => { const asset = { id: assetId++, name, size: value.length, digest: `sha256:${byteHash(value)}` };
    releases.find(value => value.id === id).assets.push(asset); contents.set(asset.id, value); } };
const journal = new ReleaseJournal(transport, '100'); await journal.create(source);
let starts = 0, visible = [], lost;
const provider = { find: async () => visible, start: async () => { starts++; visible = ['fixture-run-1']; throw Error('synthetic lost response'); },
  status: async () => 'complete', verify: async id => ({ id, artifactSha256: hash('verified fixture bytes') }) };
try { await runReleaseOperation(journal, 'native-ios', { source }, provider); } catch (error) { lost = error.message; }
const intentState = await journal.operation('native-ios');
await runReleaseOperation(journal, 'native-ios', { source }, provider);
await runReleaseOperation(journal, 'native-ios', { source }, provider);
assert.equal(starts, 1);
const completed = await journal.operation('native-ios'); assert.equal(intentState.status, 'intent'); assert.equal(completed.status, 'complete');
const otaArgs = fixture(); otaArgs.inputs.bundle.ios = hash('OTA change');
const otaPlan = planRelease(otaArgs), stage = otaPlan.stages[0], channelBinding = { branch: 'fixture', mapping: hash('mapping') };
const identity = { source, planDigest: otaPlan.digest, exportDigest: hash('export'), configurationDigest: hash(configuration), channelBinding };
const intent = otaPublicationIntent({ plan: otaPlan, stage, source, workerRunId: '500', exportDigest: identity.exportDigest, channelBinding });
let emptyRetry;
try { await publishOtaAttempt({ provider: { find: async () => [], start: async () => { throw Error('must not start'); } }, identity, intent, workerRunId: '500', runAttempt: 2 }); }
catch (error) { emptyRetry = error.message; }
assert.match(emptyRetry, /empty retry inventory/);
const build = iosBuildRequest({ source, configuration, version: ios, planDigest: hash('plan') });
const upload = iosSubmitRequest({ buildId: configuration.projectId, buildReceipt: { buildId: configuration.projectId, platform: 'ios',
  distribution: 'store', source, artifactSha256: hash('fixture IPA') }, appStoreConnectId: '123456' });
write('behavior.json', { schema: 1, sourceHead: head, parent, synthetic: true, externalOperations: 0,
  before: { source: parent, unifiedPlannerExists: spawnSync('git', ['cat-file', '-e', `${parent}:scripts/unified-release.mjs`], { cwd: root }).status === 0,
    behavior: 'Separate manual server chooser and native/OTA operations; no selective cross-artifact planner or durable per-artifact journal.' },
  scenarios, noChange: { status: noChange.status, writes },
  interruption: { firstResponse: lost, retained: intentState, final: completed, providerStartsAfterThreeCalls: starts, emptyOtaRetry: emptyRetry },
  ios: { buildArguments: build.args, uploadArguments: upload.args, uploadStage: upload.binding.stage, performed: false } });

const paths = git(['diff', '--name-only', parent, head]).split('\n');
const commits = git(['rev-list', '--reverse', `${parent}..${head}`]).split('\n');
const classify = file => file.endsWith('.md') ? 'Maintained operator guide' : /\.test\./.test(file) ? 'Maintained release safety regression' :
  /workflows|trusted-workflow/.test(file) ? 'Selected-stage workflow authority and receipt policy' :
    /mobile|native-config|native-internal|native-eas|native\.test/.test(file) ? 'External build-time configuration and local-build compatibility' :
      'Selective artifact planning, version/candidate/CI, provider verification or durable recovery';
write('published-scope.json', { schema: 1, repository: 'MChartier/calibrate-health', head, target: 'mchartier/release-entrypoints-recovery',
  targetSha: parent, parentPr: 441, parentState: 'open/unmerged', ultimateTarget: 'master', ultimateTargetSha: git(['rev-parse', 'origin/master']),
  sourceMergeBase: git(['merge-base', head, 'origin/master']), parentRelativeMergeBase: git(['merge-base', parent, head]),
  commits: commits.map(sha => ({ sha, parents: git(['show', '-s', '--format=%P', sha]).split(' '), subject: git(['show', '-s', '--format=%s', sha]),
    paths: git(['diff-tree', '--no-commit-id', '--name-status', '-r', sha]).split('\n') })),
  inventory: paths.map(file => ({ path: file, purpose: classify(file), sha256: byteHash(raw(['show', `${head}:${file}`])) })),
  files: paths.length, reservedUnchanged: ['README.md', 'docs/deployment.md', 'mobile/README.md'].every(file => !paths.includes(file)),
  productHistoryContainsDevelopmentEvidence: false });

const lint = process.env.CALIBRATE_ACTIONLINT || 'actionlint';
const workflowPaths = paths.filter(file => file.startsWith('.github/workflows/'));
const lintRuns = {};
for (const [name, revision] of [['parent', parent], ['head', head]]) {
  const directory = path.join(output, `lint-input-${name}`); fs.mkdirSync(path.join(directory, '.github/workflows'), { recursive: true });
  const names = [];
  for (const file of workflowPaths) {
    if (spawnSync('git', ['cat-file', '-e', `${revision}:${file}`], { cwd: root }).status !== 0) continue;
    fs.writeFileSync(path.join(directory, file), raw(['show', `${revision}:${file}`])); names.push(file);
  }
  const result = spawnSync(lint, ['-shellcheck=', '-pyflakes=', '-format', '{{json .}}', ...names], { cwd: directory, encoding: 'utf8' });
  assert([0, 1].includes(result.status));
  fs.writeFileSync(path.join(output, `actionlint-${name}.json`), result.stdout);
  lintRuns[name] = { exit: result.status, diagnostics: JSON.parse(result.stdout) };
  // Exact input bytes are already bound by source commits; no copied product sources are retained in evidence.
  assert(path.dirname(directory) === output); fs.rmSync(directory, { recursive: true });
}
const signature = row => JSON.stringify([row.filepath.replaceAll('\\', '/'), row.kind, row.message, row.snippet.split('\n')[0].trim()]);
const counts = rows => rows.reduce((value, row) => (value[signature(row)] = (value[signature(row)] ?? 0) + 1, value), {});
const before = counts(lintRuns.parent.diagnostics), after = counts(lintRuns.head.diagnostics);
const added = Object.keys(after).filter(key => after[key] > (before[key] ?? 0)).map(key => ({ diagnostic: JSON.parse(key), count: after[key] - (before[key] ?? 0) }));
for (const { diagnostic: [file, kind, message, snippet] } of added) {
  assert(['.github/workflows/unified-release-handler.yml', '.github/workflows/unified-server-handler.yml', '.github/workflows/native-ios-release.yml', '.github/workflows/unified-ota-release.yml'].includes(file));
  assert(kind === 'syntax-check' && message.startsWith('unexpected key "queue"') && snippet === 'queue: max' ||
    kind === 'expression' && message.startsWith('property "workflow_sha"') && snippet.includes('job.workflow_sha'));
}
write('actionlint-compatibility.json', { tool: 'actionlint 1.7.12', parent, head, parentExit: lintRuns.parent.exit, headExit: lintRuns.head.exit,
  parentDiagnostics: lintRuns.parent.diagnostics.length, headDiagnostics: lintRuns.head.diagnostics.length, added,
  result: 'Raw lint fails. Every added diagnostic is an exact documented GitHub Cloud feature unsupported by the latest released schema; no broad suppression or clean-lint claim.',
  sources: ['https://github.com/rhysd/actionlint/releases/tag/v1.7.12', 'https://docs.github.com/en/actions/reference/workflows-and-actions/contexts',
    'https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency'] });
for (const file of fs.readdirSync('.').filter(file => /^release-447-final-.*\.log$/.test(file))) fs.copyFileSync(file, path.join(output, file));
fs.copyFileSync(new URL(import.meta.url), path.join(output, 'reproduce.mjs'));
write('manifest.json', { schema: 1, checkedAtUtc: new Date().toISOString(), head, parent, owner: 'issue447 implementation owner',
  purpose: 'Retained nonmerged synthetic behavior, full published scope and validation evidence. Never merge this evidence ref into product branches.',
  files: fs.readdirSync(output).filter(file => file !== 'manifest.json').sort().map(file => ({ path: file, sha256: byteHash(fs.readFileSync(path.join(output, file))) })) });
console.log(JSON.stringify({ head, parent, files: paths.length, commits: commits.length, evidence: output,
  manifestSha256: byteHash(fs.readFileSync(path.join(output, 'manifest.json'))), lint: { parent: lintRuns.parent.diagnostics.length, head: lintRuns.head.diagnostics.length } }));
