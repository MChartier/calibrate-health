import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDirectory = path.join(repositoryRoot, '.github', 'workflows');
const readWorkflow = (name) => readFileSync(path.join(workflowsDirectory, name), 'utf8')
  .replaceAll('\r\n', '\n');

const reviewedReleaseActionPins = new Map([
  ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
  ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
  ['actions/setup-java', 'cf277c60eb25467037889841efdb72551f06f6c3'],
  ['actions/github-script', '3a2844b7e9c422d3c10d287c895573f7108da1b3'],
  ['actions/upload-artifact', 'ea165f8d65b6e75b540449e92b4886f43607fa02'],
  ['actions/download-artifact', 'd3f86a106a0bac45b974a628896c90dbdf5c8093'],
  ['actions/create-github-app-token', 'fee1f7d63c2ff003460e3d139729b119787bc349'],
  ['actions/attest', '508db95dd578ae2727ebd6217d5ba78e4fbda05d'],
  ['android-actions/setup-android', '9fc6c4e9069bf8d3d10b2204b1fb8f6ef7065407'],
  ['docker/setup-buildx-action', 'e468171a9de216ec08956ac3ada2f0791b6bd435'],
  ['docker/login-action', '184bdaa0721073962dff0199f1fb9940f07167d1'],
  ['docker/build-push-action', '263435318d21b8e681c14492fe198d362a7d2c83'],
  ['dorny/paths-filter', '0e4a8c6effa4802afeda77dc8d303f8176d7dfad']
]);

function assertReviewedReleaseActionPins(workflowName) {
  const workflow = readWorkflow(workflowName);
  for (const match of workflow.matchAll(/^\s*uses:\s+(\S+)/gm)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    const parsed = /^([^@\s]+)@([^@\s]+)$/.exec(reference);
    assert.ok(parsed, `${workflowName} external action must include an immutable reference: ${reference}`);
    const [, action, revision] = parsed;
    assert.match(revision, /^[0-9a-f]{40}$/, `${workflowName} must pin ${action} to a full commit SHA`);
    assert.equal(
      revision,
      reviewedReleaseActionPins.get(action),
      `${workflowName} must use the reviewed commit for ${action}`
    );
  }
}

function workflowJobBlock(workflow, jobName) {
  assert.match(jobName, /^[a-z0-9_-]+$/, 'workflow job selector must be a literal safe identifier');
  const match = workflow.match(new RegExp(`\\n  ${jobName}:\\n[\\s\\S]*?(?=\\n  [a-z0-9_-]+:|$)`));
  assert.ok(match, `workflow must define one ${jobName} job`);
  return match[0];
}

function workflowPathFilterBlock(job, filterName) {
  assert.match(filterName, /^[a-z_]+$/, 'workflow path filter selector must be a literal safe identifier');
  const match = job.match(
    new RegExp(`\\n            ${filterName}:\\n[\\s\\S]*?(?=\\n            [a-z_]+:|\\n\\n|$)`)
  );
  assert.ok(match, `workflow must define one ${filterName} path filter`);
  return match[0];
}

function workflowPathFilterPaths(job, filterName) {
  return [...workflowPathFilterBlock(job, filterName).matchAll(/- '([^']+)'/g)]
    .map((match) => match[1]);
}

function pathFilterPatternMatches(pattern, candidatePath) {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replaceAll('**', '\0')
    .replaceAll('*', '[^/]*')
    .replaceAll('\0', '.*');
  return new RegExp(`^${escaped}$`).test(candidatePath);
}

function pathFilterMatches(job, filterName, candidatePath, predicateQuantifier = 'some') {
  const matches = workflowPathFilterPaths(job, filterName).map((pattern) => {
    const excluded = pattern.startsWith('!');
    const patternMatches = pathFilterPatternMatches(excluded ? pattern.slice(1) : pattern, candidatePath);
    return excluded ? !patternMatches : patternMatches;
  });
  if (predicateQuantifier === 'every') {
    return matches.every(Boolean);
  }
  assert.equal(predicateQuantifier, 'some');
  return matches.some(Boolean);
}

function assertPathFilterOutputs(job, outputNames, stepId = 'filter', revision = 'v3') {
  assert.match(job, /pull-requests: read/);
  assert.ok(job.includes(`uses: dorny/paths-filter@${revision}`));
  for (const outputName of outputNames) {
    assert.match(outputName, /^[a-z_]+$/);
    const expression = outputName + ': ' + '${{ steps.' + stepId + '.outputs.' + outputName + ' }}';
    assert.ok(job.includes(expression), `classifier must publish ${expression}`);
  }
}

test('credentialed release workflows pin external actions and the EAS CLI immutably', () => {
  for (const workflowName of [
    'cut-release.yml',
    'publish-release.yml',
    'container.yml',
    'cut-release-request.yml',
    'cut-release-handler.yml',
    'publish-release-request.yml',
    'publish-release-handler.yml',
    'container-request.yml',
    'container-handler.yml',
    'expo-ota-update.yml',
    'native-release.yml',
    'dependency-audit.yml'
  ]) {
    assertReviewedReleaseActionPins(workflowName);
  }
  const credentialedWorkflows = [
    'cut-release.yml',
    'publish-release.yml',
    'container.yml',
    'expo-ota-update.yml',
    'native-release.yml'
  ].map(readWorkflow).join('\n');
  assert.doesNotMatch(
    credentialedWorkflows,
    /echo\s+"Native tag trust set:[^"\r\n]*`/,
    'trust-set summaries must not execute Markdown backticks as Bash command substitutions'
  );
  const ota = readWorkflow('expo-ota-update.yml');
  const publishRelease = readWorkflow('publish-release.yml');
  const cutRelease = readWorkflow('cut-release.yml');
  const easToolPackage = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'tools', 'eas-cli', 'package.json'), 'utf8')
  );
  const easToolLock = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'tools', 'eas-cli', 'package-lock.json'), 'utf8')
  );
  assert.deepEqual(easToolPackage.devDependencies, { 'eas-cli': '22.4.0' });
  assert.deepEqual(easToolPackage.overrides, {
    'minimatch@5.1.2': '5.1.8',
    'nanoid@3.3.8': '3.3.18',
    'tar@7.5.19': '7.5.21'
  });
  assert.equal(easToolLock.lockfileVersion, 3);
  assert.equal(easToolLock.packages[''].devDependencies['eas-cli'], '22.4.0');
  assert.equal(easToolLock.packages['node_modules/eas-cli'].version, '22.4.0');
  assert.equal(easToolLock.packages['node_modules/minimatch'].version, '5.1.8');
  assert.equal(easToolLock.packages['node_modules/nanoid'].version, '3.3.18');
  assert.equal(easToolLock.packages['node_modules/tar'].version, '7.5.21');
  assert.match(easToolLock.packages['node_modules/eas-cli'].integrity, /^sha512-/);
  for (const [packagePath, record] of Object.entries(easToolLock.packages)) {
    if (!packagePath || record.link) continue;
    assert.equal(typeof record.version, 'string', `${packagePath} must resolve an exact version`);
    assert.match(record.integrity, /^sha512-/, `${packagePath} must carry a registry integrity hash`);
  }
  assert.doesNotMatch(ota, /expo\/expo-github-action|eas-version:|\bnpx\b|\byarn\b/);
  assert.equal(
    (ota.match(/npm ci --prefix \.release-tooling\/tools\/eas-cli --include=dev --no-audit --fund=false/g) ?? []).length,
    4
  );
  assert.equal(
    (ota.match(/\.release-tooling\/tools\/eas-cli\/node_modules\/\.bin\/eas/g) ?? []).length,
    4
  );
  const releaseEasSources = [
    readFileSync(path.join(repositoryRoot, 'scripts', 'native-ota-update.mjs'), 'utf8'),
    readFileSync(path.join(repositoryRoot, 'docs', 'mobile-release.md'), 'utf8'),
    ...['expo-ota-update.yml', 'publish-release.yml', 'cut-release.yml', 'native-release.yml']
      .map(readWorkflow)
  ].join('\n');
  assert.doesNotMatch(releaseEasSources, /eas-cli@latest/i);
  assert.doesNotMatch(releaseEasSources, /^\s*npx(?:\.cmd)?\b[^\r\n]*\beas(?:-cli)?\b/gmi);
  const mobileReleaseDocs = readFileSync(
    path.join(repositoryRoot, 'docs', 'mobile-release.md'),
    'utf8'
  );
  assert.match(
    mobileReleaseDocs,
    /npm\.cmd ci --prefix tools\/eas-cli --include=dev --no-audit --fund=false/
  );
  assert.match(mobileReleaseDocs, /\.\.\\tools\\eas-cli\\node_modules\\\.bin\\eas\.cmd login/);
  assert.match(mobileReleaseDocs, /\.\.\\tools\\eas-cli\\node_modules\\\.bin\\eas\.cmd project:info/);
  assert.doesNotMatch(mobileReleaseDocs, /^\s*eas(?:\.cmd)?\s+(?:login|project:info)\b/gm);
  assert.doesNotMatch(publishRelease, /workflow_call:[\s\S]*secrets:[\s\S]*EXPO_TOKEN/);
  assert.doesNotMatch(publishRelease, /publish_ota:[\s\S]*secrets: inherit/);
  assert.doesNotMatch(cutRelease, /uses: \.\/\.github\/workflows\/publish-release\.yml[\s\S]*secrets: inherit/);
  assert.match(mobileReleaseDocs, /GitHub `expo-publication` environment/);
  assert.match(mobileReleaseDocs, /never store it at repository or organization\s+scope/i);
  assert.match(mobileReleaseDocs, /restrict it to the selected deployment branch `master` only/i);
  assert.match(mobileReleaseDocs, /does not provide a channel-scoped update role/i);
  assert.match(mobileReleaseDocs, /EXPO_RELEASE_TOKEN/);
});

test('server publication accepts read-only master requests through protected default-branch handlers', () => {
  const cases = [
    {
      request: 'cut-release-request.yml',
      handler: 'cut-release-handler.yml',
      staticName: 'Cut release',
      path: '.github/workflows/cut-release-request.yml',
      artifact: 'cut-release-request',
      operation: 'cut-release',
      worker: 'cut-release.yml'
    },
    {
      request: 'publish-release-request.yml',
      handler: 'publish-release-handler.yml',
      staticName: 'Publish prepared release',
      path: '.github/workflows/publish-release-request.yml',
      artifact: 'publish-prepared-release-request',
      operation: 'publish-prepared-release',
      worker: 'publish-release.yml'
    },
    {
      request: 'container-request.yml',
      handler: 'container-handler.yml',
      staticName: 'Build Release Image',
      path: '.github/workflows/container-request.yml',
      artifact: 'build-release-image-request',
      operation: 'build-release-image',
      worker: 'container.yml'
    }
  ];

  for (const entry of cases) {
    const request = readWorkflow(entry.request);
    const handler = readWorkflow(entry.handler);
    const worker = readWorkflow(entry.worker);

    assert.match(request, /\n  workflow_dispatch:/);
    assert.doesNotMatch(request, /workflow_run:|workflow_call:|\n\s+push:|\n\s+pull_request:/);
    assert.match(request, /permissions:\s*\n\s+contents: read/);
    assert.doesNotMatch(request, /^\s{0,8}(?:contents|packages|pull-requests|actions): write\s*$/gm);
    assert.doesNotMatch(request, /environment:|secrets\.|secrets: inherit|uses: \.\//);
    assert.doesNotMatch(request, /actions\/checkout|actions\/create-github-app-token|docker\/login-action/);
    assert.match(request, /GITHUB_REF.*refs\/heads\/master/);
    assert.match(request, new RegExp(`--arg operation ${entry.operation}`));
    assert.match(request, new RegExp(`name: ${entry.artifact}`));
    assert.match(request, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
    assert.match(request, /overwrite: true/);

    assert.match(handler, new RegExp(`workflows:\\s*\\n\\s+- ${entry.staticName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(handler, /types:\s*\n\s+- completed[\s\S]*branches:\s*\n\s+- master/);
    assert.match(handler, /permissions:\s*\n\s+actions: read\s*\n\s+contents: read/);
    if (entry.worker === 'cut-release.yml') assert.match(handler, /pull-requests: read/);
    assert.doesNotMatch(handler, /^\s{0,8}(?:contents|packages|pull-requests|actions): write\s*$/gm);
    assert.doesNotMatch(handler, /environment:|secrets\.|secrets: inherit/);
    const handlerFreshness = handler.match(
      /\n      - name: Require current protected master handler\n[\s\S]*?(?=\n      - name:)/
    )?.[0];
    assert.ok(handlerFreshness);
    assert.match(handlerFreshness, /WORKFLOW_SHA: \$\{\{ job\.workflow_sha \}\}/);
    assert.match(handlerFreshness, /git\/ref\/heads\/master/);
    assert.match(handlerFreshness, /CURRENT_MASTER_SHA.*WORKFLOW_SHA/s);
    assert.ok(
      handler.indexOf('Require current protected master handler') <
        handler.indexOf('release-request.mjs verify') &&
        handler.indexOf('Require current protected master handler') <
          handler.indexOf(`uses: ./.github/workflows/${entry.worker}`)
    );
    assert.match(handler, /release-handler-event\.mjs verify/);
    assert.match(handler, new RegExp(`--workflow-path ${entry.path.replaceAll('.', '\\.')}`));
    assert.match(handler, /--event-file "\$\{GITHUB_EVENT_PATH\}"/);
    assert.match(handler, /--repository "\$\{\{ github\.repository \}\}"/);
    assert.match(handler, /--repository-id "\$\{\{ github\.repository_id \}\}"/);
    assert.match(handler, /--handler-ref "\$\{\{ github\.ref \}\}"/);
    assert.match(handler, /--handler-sha "\$\{\{ job\.workflow_sha \}\}"/);
    assert.doesNotMatch(
      handler,
      /REQUEST_WORKFLOW_NAME|github\.event\.workflow_run\.name/,
      'dynamic run names such as Cut minor release from master must not replace the static trigger authority'
    );
    assert.match(handler, /ref: \$\{\{ job\.workflow_sha \}\}[\s\S]*persist-credentials: false/);
    assert.match(handler, new RegExp(`name: ${entry.artifact}`));
    assert.match(handler, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
    assert.match(handler, /github-token: \$\{\{ github\.token \}\}/);
    assert.match(handler, new RegExp(`--operation ${entry.operation}`));
    assert.match(handler, new RegExp(`uses: \\.\\/\\.github\\/workflows\\/${entry.worker.replace('.', '\\.')}`));

    assert.match(worker, /\n  workflow_call:/);
    assert.doesNotMatch(worker, /^  (?:workflow_dispatch|workflow_run):/gm);
  }

  const releaseDocs = readFileSync(path.join(repositoryRoot, 'docs', 'release-compatibility.md'), 'utf8');
  assert.match(releaseDocs, /server-release-publication/);
  assert.match(releaseDocs, /selected deployment branch `master`/);
  assert.match(releaseDocs, /server-release-tag-creation/);
  assert.match(releaseDocs, /server-release-tag-immutability/);
  assert.match(releaseDocs, /empty bypass list/);
  assert.match(releaseDocs, /detach inherited repository permissions/);
  assert.match(releaseDocs, /remove this source repository's Actions\s+write access/);
  assert.match(releaseDocs, /`write:packages` only and no `repo` scope/);
  assert.match(releaseDocs, /Historical\s+workflow runs retain their original workflow source on rerun/);
});

test('server release approvals match the per-job App and package authority boundaries', () => {
  const cut = readWorkflow('cut-release.yml');
  const prepared = readWorkflow('publish-release.yml');
  const image = readWorkflow('container.yml');
  const releaseDocs = readFileSync(path.join(repositoryRoot, 'docs', 'release-compatibility.md'), 'utf8');

  const publishCandidate = workflowJobBlock(cut, 'publish_candidate');
  const finalize = workflowJobBlock(cut, 'finalize');
  const inspectCleanup = workflowJobBlock(cut, 'inspect_cleanup');
  const cleanup = workflowJobBlock(cut, 'cleanup-candidate');
  const publishTag = workflowJobBlock(prepared, 'publish_release_tag');
  const publishImage = workflowJobBlock(image, 'publish_image');
  const normalCutApprovals = [publishCandidate, finalize, publishTag, publishImage];

  assert.equal(normalCutApprovals.filter((job) => /environment: server-release-publication/.test(job)).length, 4);
  assert.match(cleanup, /environment: server-release-publication/);
  assert.match(inspectCleanup, /needs\.finalize\.result != 'success'/);
  assert.equal([publishTag, publishImage].filter((job) => /environment: server-release-publication/.test(job)).length, 2);
  assert.match(publishImage, /environment: server-release-publication/);

  for (const appJob of [publishCandidate, finalize, publishTag]) {
    assert.match(appJob, /SERVER_RELEASE_APP_PRIVATE_KEY/);
    assert.doesNotMatch(appJob, /GHCR_PUBLISH_TOKEN/);
  }
  assert.match(publishImage, /GHCR_PUBLISH_TOKEN/);
  assert.doesNotMatch(publishImage, /SERVER_RELEASE_APP_PRIVATE_KEY/);

  assert.match(
    releaseDocs,
    /normal \*\*Cut release\*\*[\s\S]*four sequential server-release approvals:[\s\S]*publish the exact candidate branch[\s\S]*merge the validated pull request[\s\S]*create the immutable stable[\s\S]*publish the verified image identities/
  );
  assert.match(
    releaseDocs,
    /\*\*Publish\s+prepared release\*\* recovery requires two approvals \(stable tag, then image\), while \*\*Build Release[\s\S]*Image\*\* requires\s+one image approval/
  );
  assert.match(
    releaseDocs,
    /validation fails before `finalize` starts[\s\S]*two[\s\S]*approvals[\s\S]*`finalize` was approved[\s\S]*cleanup is a third approval[\s\S]*read-only inspection proves[\s\S]*candidate ref is unchanged/
  );
  assert.match(
    releaseDocs,
    /first three normal Cut checkpoints[\s\S]*same[\s\S]*Server\s+Release App authority[\s\S]*image checkpoint admits the separate package-only robot/
  );
});

test('Cut release uses a read-only request, protected handler, and App-isolated writes', () => {
  const request = readWorkflow('cut-release-request.yml');
  const handler = readWorkflow('cut-release-handler.yml');
  const workflow = readWorkflow('cut-release.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const prepare = workflowJobBlock(workflow, 'prepare');
  const publishCandidate = workflowJobBlock(workflow, 'publish_candidate');
  const validation = workflowJobBlock(workflow, 'release-validation');
  const finalize = workflowJobBlock(workflow, 'finalize');
  const inspectCleanup = workflowJobBlock(workflow, 'inspect_cleanup');
  const cleanup = workflowJobBlock(workflow, 'cleanup-candidate');
  const publish = workflowJobBlock(workflow, 'publish');

  assert.match(request, /workflow_dispatch:[\s\S]*bump:[\s\S]*type: choice/);
  assert.match(request, /options:\s*\n\s+- patch\s*\n\s+- minor\s*\n\s+- major/);
  assert.match(request, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(request, /environment:|secrets\.|actions\/checkout|contents: write|packages: write/);
  assert.match(request, /head_sha "\$\{GITHUB_SHA\}"/);
  assert.match(request, /name: cut-release-request[\s\S]*overwrite: true/);

  assert.match(handler, /workflow_run:[\s\S]*workflows:\s*\n\s+- Cut release/);
  assert.match(handler, /permissions:\s*\n\s+actions: read\s*\n\s+contents: read\s*\n\s+pull-requests: read/);
  assert.match(handler, /release-handler-event\.mjs verify/);
  assert.match(handler, /release-request\.mjs verify/);
  assert.match(handler, /source_sha: \$\{\{ steps\.verify\.outputs\.source_sha \}\}/);
  assert.match(handler, /echo "source_sha=\$\{REQUEST_HEAD_SHA\}"/);
  assert.match(handler, /uses: \.\/\.github\/workflows\/cut-release\.yml/);
  assert.match(handler, /source_sha: \$\{\{ needs\.verify_request\.outputs\.source_sha \}\}/);
  assert.doesNotMatch(handler, /environment:|secrets\.|contents: write|packages: write|pull-requests: write/);

  assert.match(workflow, /workflow_call:[\s\S]*source_sha:[\s\S]*required: true/);
  assert.doesNotMatch(workflow, /^  (?:workflow_dispatch|workflow_run|push):/gm);
  assert.match(workflow, /group: cut-release/);
  assert.match(workflow, /group: cut-release\s*\n\s+queue: max/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  for (const permissionsBlock of workflow.matchAll(
    /^\s*permissions:\s*\n(?:\s+[a-z-]+:\s+[a-z]+\s*\n?)+/gm
  )) {
    assert.doesNotMatch(
      permissionsBlock[0],
      /(?:contents|packages|pull-requests|actions):\s*write\b/,
      'Cut may propagate only OIDC/attestation write scopes to its nested source-free receipt job'
    );
  }
  assert.match(workflow, /permissions:\s*\n\s+attestations: write\s*\n\s+contents: read\s*\n\s+id-token: write/);
  assert.doesNotMatch(workflow, /secrets: inherit|packages: write/);
  assert.equal(
    (workflow.match(/GITHUB_TOKEN: \$\{\{ github\.token \}\}/g) ?? []).length,
    6,
    'the three App jobs must each have an early and credential-adjacent read-only live-master gate'
  );
  for (const [jobName, job] of [
    ['publish_candidate', publishCandidate],
    ['finalize', finalize],
    ['cleanup-candidate', cleanup]
  ]) {
    const namedSteps = job.split(/\n(?=\s{6}- name:)/);
    const configurationIndex = namedSteps.findIndex((step) => (
      step.includes('Require dedicated server release App configuration')
    ));
    const authorityIndex = namedSteps.findIndex((step) => (
      step.includes('Recheck current protected master immediately before App token')
    ));
    const tokenIndex = namedSteps.findIndex((step) => (
      step.includes('actions/create-github-app-token@')
    ));
    assert.ok(configurationIndex > 1, `${jobName} must define its App configuration step`);
    assert.ok(
      tokenIndex > configurationIndex,
      `${jobName} must mint its App token after identifier validation`
    );
    assert.equal(
      authorityIndex,
      tokenIndex - 1,
      `${jobName} must recheck live master in the final step before App-token minting`
    );
    assert.match(
      namedSteps[authorityIndex],
      /GITHUB_TOKEN: \$\{\{ github\.token \}\}[\s\S]*WORKFLOW_SHA: \$\{\{ job\.workflow_sha \}\}[\s\S]*git\/ref\/heads\/master/,
      `${jobName} must recheck live protected master authority at the credential boundary`
    );
    assert.doesNotMatch(
      namedSteps.slice(0, tokenIndex).join('\n'),
      /secrets\.SERVER_RELEASE_APP_PRIVATE_KEY/,
      `${jobName} must not reference the App private key before the final authority recheck`
    );
    assert.equal(
      (job.match(/secrets\.SERVER_RELEASE_APP_PRIVATE_KEY/g) ?? []).length,
      1,
      `${jobName} must materialize the App private key only in its token action`
    );
    assert.match(
      namedSteps[tokenIndex],
      /private-key: \$\{\{ secrets\.SERVER_RELEASE_APP_PRIVATE_KEY \}\}/,
      `${jobName} token action must be the first and only App private-key consumer`
    );
  }
  assert.match(packageConfig.scripts['release:prepare'], /release-config\.mjs prepare/);

  assert.match(prepare, /permissions:\s*\n\s+contents: read/);
  assert.match(prepare, /Checkout exact protected master source[\s\S]*ref: \$\{\{ inputs\.source_sha \}\}[\s\S]*persist-credentials: false/);
  assert.match(prepare, /SOURCE_SHA.*REQUESTED_SOURCE_SHA.*REMOTE_MASTER_SHA/s);
  assert.match(prepare, /release:prepare -- --bump/);
  assert.match(prepare, /BRANCH="release\/\$\{TAG\}"/);
  assert.match(prepare, /git commit -m "Prepare release \$\{TAG\}"/);
  assert.match(prepare, /git --no-replace-objects bundle create/);
  assert.match(prepare, /Upload exact release candidate bundle[\s\S]*overwrite: true/);
  assert.doesNotMatch(prepare, /create-github-app-token|SERVER_RELEASE_APP_|git[^\n]*push|github\.token/);

  assert.match(publishCandidate, /environment: server-release-publication/);
  assert.match(publishCandidate, /permissions:\s*\n\s+actions: read\s*\n\s+contents: read/);
  assert.match(publishCandidate, /Download exact release candidate bundle/);
  assert.match(publishCandidate, /Require current protected master workflow[\s\S]*git\/ref\/heads\/master/);
  assert.ok(
    publishCandidate.indexOf('Require current protected master workflow') <
      publishCandidate.indexOf('SERVER_RELEASE_APP_PRIVATE_KEY')
  );
  assert.match(publishCandidate, /sha256sum --check --strict SHA256SUMS/);
  assert.match(publishCandidate, /verify-prepared-candidate[\s\S]*--candidate-parent-current-master true/);
  assert.ok(
    publishCandidate.indexOf('Verify candidate artifact and canonical transformation before authentication') <
      publishCandidate.indexOf('Mint restricted server release branch token')
  );
  assert.match(publishCandidate, /actions\/create-github-app-token@[0-9a-f]{40}/);
  assert.match(publishCandidate, /permission-contents: write/);
  assert.match(
    publishCandidate,
    /--force-with-lease="refs\/heads\/\$\{RELEASE_BRANCH\}:"[\s\S]*"\$\{RELEASE_SHA\}:refs\/heads\/\$\{RELEASE_BRANCH\}"/
  );

  assert.match(validation, /needs: \[prepare, publish_candidate\]/);
  assert.match(validation, /permissions:\s*\n\s+contents: read/);
  assert.match(validation, /Checkout exact published candidate[\s\S]*persist-credentials: false/);
  assert.match(validation, /ref: \$\{\{ needs\.prepare\.outputs\.release_sha \}\}/);
  assert.match(validation, /verify-prepared-candidate[\s\S]*--candidate-parent-current-master true/);
  assert.match(validation, /git diff --check "\$\{SOURCE_SHA\}" "\$\{RELEASE_SHA\}"/);
  assert.match(validation, /docker build --file Dockerfile\.app --tag calibrate:release-candidate \./);
  assert.match(validation, /docker run --detach --name calibrate-release-smoke --network host/);
  assert.match(validation, /http:\/\/127\.0\.0\.1:3000\/api\/v1\/readyz/);
  assert.match(validation, /npm run test:container:web -- http:\/\/127\.0\.0\.1:3000/);
  assert.doesNotMatch(validation, /create-github-app-token|SERVER_RELEASE_APP_|github\.token/);

  assert.match(finalize, /needs: \[prepare, publish_candidate, release-validation\]/);
  assert.match(finalize, /environment: server-release-publication/);
  assert.match(finalize, /permissions:\s*\n\s+contents: read/);
  assert.match(finalize, /Require current protected master workflow[\s\S]*git\/ref\/heads\/master/);
  assert.ok(
    finalize.indexOf('Require current protected master workflow') <
      finalize.indexOf('SERVER_RELEASE_APP_PRIVATE_KEY')
  );
  assert.ok(
    finalize.indexOf('Reverify exact branch and candidate before authentication') <
      finalize.indexOf('Mint restricted server release merge token')
  );
  assert.match(finalize, /permission-contents: write/);
  assert.match(finalize, /permission-pull-requests: write/);
  assert.match(finalize, /github-token: \$\{\{ steps\.release-token\.outputs\.token \}\}/);
  assert.match(finalize, /github\.rest\.pulls\.create/);
  assert.doesNotMatch(finalize, /github\.rest\.pulls\.merge/);
  assert.match(finalize, /refs\/pull\/\$\{PULL_REQUEST_NUMBER\}\/merge/);
  assert.match(finalize, /MERGE_SHA\}\^1.*SOURCE_SHA/);
  assert.match(finalize, /MERGE_SHA\}\^2.*RELEASE_SHA/);
  assert.match(finalize, /--force-with-lease="refs\/heads\/master:\$\{SOURCE_SHA\}"/);
  assert.match(finalize, /"\$\{MERGE_SHA\}:refs\/heads\/master"/);

  assert.match(inspectCleanup, /always\(\).*needs\.finalize\.result != 'success'/);
  assert.match(inspectCleanup, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(inspectCleanup, /environment:|create-github-app-token|permission-contents: write/);
  assert.match(cleanup, /environment: server-release-publication/);
  assert.match(cleanup, /permissions:\s*\n\s+contents: read/);
  assert.match(cleanup, /Require current protected master workflow[\s\S]*git\/ref\/heads\/master/);
  assert.ok(
    cleanup.indexOf('Require current protected master workflow') <
      cleanup.indexOf('SERVER_RELEASE_APP_PRIVATE_KEY')
  );
  assert.ok(
    cleanup.indexOf('Reverify exact cleanup target before authentication') <
      cleanup.indexOf('Mint restricted server release cleanup token')
  );
  assert.match(cleanup, /permission-contents: write/);
  assert.match(cleanup, /permission-pull-requests: write/);
  assert.match(cleanup, /github\.rest\.pulls\.update/);
  assert.match(cleanup, /REMOTE_SHA.*RELEASE_SHA/);
  assert.match(
    cleanup,
    /--force-with-lease="refs\/heads\/\$\{RELEASE_BRANCH\}:\$\{RELEASE_SHA\}"[\s\S]*":refs\/heads\/\$\{RELEASE_BRANCH\}"/
  );

  assert.match(publish, /uses: \.\/\.github\/workflows\/publish-release\.yml/);
  assert.match(
    publish,
    /permissions:\s*\n\s+attestations: write\s*\n\s+contents: read\s*\n\s+id-token: write/
  );
  assert.doesNotMatch(publish, /(?:contents|packages|pull-requests|actions):\s*write/);
  assert.match(publish, /release_commit: \$\{\{ needs\.prepare\.outputs\.release_sha \}\}/);
  assert.match(publish, /release_branch: \$\{\{ needs\.prepare\.outputs\.release_branch \}\}/);
  assert.doesNotMatch(publish, /secrets: inherit|EXPO_TOKEN/);
  assert.doesNotMatch(workflow, /\n  database-rollback:|database_migrations_changed|test:db:rollback/);

  const checkoutCount = (workflow.match(/uses: actions\/checkout@[0-9a-f]{40}/g) ?? []).length;
  assert.ok(checkoutCount > 0);
  assert.equal(
    (workflow.match(/persist-credentials: false/g) ?? []).length,
    checkoutCount,
    'every Cut worker checkout must disable persisted credentials'
  );
});

test('prepared release publishing is reusable, recoverable, and idempotent', () => {
  const workflow = readWorkflow('publish-release.yml');
  const tag = workflowJobBlock(workflow, 'tag_release');
  const publisher = workflowJobBlock(workflow, 'publish_release_tag');
  const publishedVerifier = workflowJobBlock(workflow, 'verify_published_release');
  const image = workflowJobBlock(workflow, 'build_release_image');
  const ota = workflowJobBlock(workflow, 'publish_ota');

  assert.match(workflow, /workflow_call:/);
  assert.doesNotMatch(workflow, /workflow_call:[\s\S]*?\n\s{4}secrets:/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_commit:/);
  assert.match(workflow, /release_branch:/);
  assert.match(workflow, /group: publish-prepared-release-\$\{\{ inputs\.release_commit \}\}/);
  assert.match(workflow, /group: publish-prepared-release-\$\{\{ inputs\.release_commit \}\}\s*\n\s+queue: max/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf('\njobs:')), /contents: write|packages: write/);
  assert.match(tag, /permissions:\s*\n\s+contents: read/);
  assert.match(tag, /ref: \$\{\{ inputs\.release_commit \}\}/);
  assert.match(tag, /Checkout exact prepared release[\s\S]*persist-credentials: false/);
  assert.match(tag, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(tag, /path: \.release-tooling/);
  assert.match(tag, /ref: master[\s\S]*path: \.release-trust/);
  assert.match(tag, /Native tag trust set:.*TRUST_SET_COMMIT/);
  assert.match(tag, /git merge-base --is-ancestor "\$\{RELEASE_COMMIT\}" origin\/master/);
  assert.match(tag, /EXPECTED_BRANCH="release\/\$\{TAG\}"/);
  assert.match(tag, /node \.release-tooling\/scripts\/release-config\.mjs check[\s\S]*--repository-root/);
  assert.match(
    tag,
    /release-config\.mjs verify-prepared-candidate[\s\S]*--release-tag "\$\{TAG\}"[\s\S]*--expected-commit "\$\{RELEASE_COMMIT\}"[\s\S]*--publish-latest true/
  );
  assert.doesNotMatch(tag, /git tag --list|LATEST_TAG|--latest-tag/);
  assert.match(tag, /android\?\.mobile\?\.native_release_tag/);
  assert.match(tag, /legacy vMAJOR\.MINOR\.PATCH format for a prepared historical release/);
  assert.match(tag, /native_release_tag=\$\{NATIVE_RELEASE_TAG\}/);
  assert.match(
    tag,
    /Verify stable release tag rulesets with a read-only token[\s\S]*server-release-tag-protection\.mjs verify[\s\S]*--repository "\$\{GITHUB_REPOSITORY\}"[\s\S]*--tag "\$\{RELEASE_TAG\}"/
  );
  assert.match(tag, /native_release_candidate=\$\{NATIVE_RELEASE_CANDIDATE\}/);
  assert.match(tag, /native_release_protected=\$\{NATIVE_RELEASE_PROTECTED\}/);
  assert.match(tag, /native_release_attested=\$\{NATIVE_RELEASE_ATTESTED\}/);
  assert.match(tag, /refs\/tags\/\$\{NATIVE_RELEASE_TAG\}/);
  assert.match(tag, /git merge-base --is-ancestor "\$\{NATIVE_RELEASE_COMMIT\}" "\$\{RELEASE_COMMIT\}"/);
  assert.match(tag, /NATIVE_RELEASE_REASON=native-tag-not-ancestor/);
  assert.match(tag, /not an ancestor of .* OTA publication is skipped/);
  assert.match(tag, /native-tag-protection\.mjs verify/);
  assert.match(tag, /native-tag-attestation\.mjs verify/);
  assert.match(tag, /--allowed-signers-file \.release-trust\/\.github\/native-release-tag-allowed-signers/);
  assert.match(tag, /Legacy tag .* is not a signed native readiness attestation/);
  assert.match(tag, /npm ci --ignore-scripts --no-audit --fund=false/);
  assert.match(tag, /expo-ota-ci-preflight\.mjs/);
  assert.match(tag, /--repository-root "\$\{GITHUB_WORKSPACE\}"/);
  assert.match(
    tag,
    /--native-build-ref "\$\{NATIVE_RELEASE_TAG\}"[\s\S]*--allowed-signers-file \.release-trust\/\.github\/native-release-tag-allowed-signers/
  );
  assert.match(tag, /--compatibility-output "\$\{COMPATIBILITY_OUTPUT\}"/);
  assert.match(tag, /source "\$\{COMPATIBILITY_OUTPUT\}"/);
  assert.match(tag, /native_release_compatible/);
  assert.match(tag, /FINAL_READY=true/);
  assert.match(tag, /native_release_ready=false/);
  const compatibilityInstallMatch = tag.match(
    /\n      - name: Install native compatibility dependencies\n[\s\S]*?(?=\n      - name:)/
  );
  const compatibilityVerificationMatch = tag.match(
    /\n      - name: Verify protected and attested native baseline compatibility\n[\s\S]*?(?=\n      - name:)/
  );
  assert.ok(compatibilityInstallMatch, 'prepared release must define the compatibility install step');
  assert.ok(
    compatibilityVerificationMatch,
    'prepared release must define the compatibility verification step'
  );
  const compatibilityInstall = compatibilityInstallMatch[0];
  const compatibilityVerification = compatibilityVerificationMatch[0];
  for (const [step, gate] of [
    ['release', 'native_release_candidate'],
    ['native-policy', 'native_release_protected'],
    ['release', 'native_release_attested']
  ]) {
    assert.match(
      compatibilityInstall,
      new RegExp(`steps\\.${step}\\.outputs\\.${gate} == 'true'`),
      `${gate} must pass before installing historical-source dependencies`
    );
  }
  const compatibilityPreflightIndex = compatibilityVerification.indexOf(
    'expo-ota-ci-preflight.mjs'
  );
  assert.ok(compatibilityPreflightIndex > 0, 'compatibility preflight must remain present');
  const preflightPrefix = compatibilityVerification.slice(0, compatibilityPreflightIndex);
  for (const gate of [
    'NATIVE_RELEASE_CANDIDATE',
    'NATIVE_RELEASE_PROTECTED',
    'NATIVE_RELEASE_ATTESTED'
  ]) {
    assert.match(
      preflightPrefix,
      new RegExp(`"\\$\\{${gate}\\}" != "true"`),
      `${gate} must fail closed before compatibility preflight`
    );
  }
  assert.match(preflightPrefix, /native_release_ready=false[\s\S]*exit 0/);
  assert.match(tag, /Existing tag \$\{TAG\} points to/);
  assert.doesNotMatch(tag, /permissions:\s*\n\s+contents: write|git push|git tag -a/);
  const compatibilityInstallIndex = tag.indexOf('- name: Install native compatibility dependencies');
  assert.ok(compatibilityInstallIndex >= 0);
  assert.doesNotMatch(
    tag.slice(compatibilityInstallIndex),
    /GITHUB_TOKEN: \$\{\{ github\.token \}\}|persist-credentials: true/,
    'historical dependency and compatibility code must not receive a repository token'
  );

  assert.match(publisher, /environment: server-release-publication/);
  assert.match(publisher, /permissions:\s*\n\s+contents: read/);
  const publisherAuthority = publisher.match(
    /\n      - name: Require current protected workflow authority before tag credentials\n[\s\S]*?(?=\n      - name:)/
  )?.[0];
  assert.ok(publisherAuthority);
  assert.match(publisherAuthority, /WORKFLOW_SHA: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(publisherAuthority, /verify-current-release-workflow/);
  assert.match(publisherAuthority, /--release-commit "\$\{RELEASE_COMMIT\}"/);
  assert.match(publisherAuthority, /GIT_NO_REPLACE_OBJECTS=1/);
  assert.ok(
    publisher.indexOf('Require current protected workflow authority before tag credentials') <
      publisher.indexOf('SERVER_RELEASE_APP_PRIVATE_KEY') &&
      publisher.indexOf('Require current protected workflow authority before tag credentials') <
        publisher.indexOf('Mint restricted server release tag token')
  );
  assert.match(publisher, /needs: tag_release/);
  assert.match(publisher, /SERVER_RELEASE_APP_ID: \$\{\{ vars\.SERVER_RELEASE_APP_ID \}\}/);
  assert.doesNotMatch(
    publisher.slice(0, publisher.indexOf('- name: Recheck current protected workflow immediately before App token')),
    /secrets\.SERVER_RELEASE_APP_PRIVATE_KEY/,
    'the App private key must not be referenced before the final live-master recheck'
  );
  assert.match(
    publisher,
    /Checkout reviewed release tag protection tooling only[\s\S]*ref: \$\{\{ job\.workflow_sha \}\}[\s\S]*persist-credentials: false[\s\S]*path: \.release-tooling[\s\S]*sparse-checkout: \/scripts\/server-release-tag-protection\.mjs[\s\S]*sparse-checkout-cone-mode: false/
  );
  assert.match(
    publisher,
    /Verify stable release tag rulesets after publication approval[\s\S]*GITHUB_TOKEN: \$\{\{ github\.token \}\}[\s\S]*RELEASE_TAG: \$\{\{ needs\.tag_release\.outputs\.release_tag \}\}[\s\S]*node \.release-tooling\/scripts\/server-release-tag-protection\.mjs verify[\s\S]*--repository "\$\{GITHUB_REPOSITORY\}"[\s\S]*--tag "\$\{RELEASE_TAG\}"/
  );
  assert.match(publisher, /actions\/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349/);
  assert.match(publisher, /permission-contents: write/);
  assert.match(publisher, /actions\/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3/);
  assert.match(publisher, /github-token: \$\{\{ steps\.release-token\.outputs\.token \}\}/);
  assert.match(publisher, /\^v\\d\+\\\.\\d\+\\\.\\d\+\$/);
  assert.match(publisher, /branch !== `release\/\$\{tag\}`/);
  assert.match(publisher, /github\.rest\.git\.createTag/);
  assert.match(publisher, /github\.rest\.git\.createRef/);
  assert.match(publisher, /github\.rest\.git\.getTag/);
  assert.match(publisher, /tagObject\.data\.object\.sha !== commit/);
  assert.doesNotMatch(publisher, /ref: \$\{\{ inputs\.release_commit \}\}|\bnpm\b/);
  assert.doesNotMatch(publisher, /secrets\.GITHUB_TOKEN/);
  const rulesetGateIndex = publisher.indexOf(
    '- name: Verify stable release tag rulesets after publication approval'
  );
  const finalAuthorityGateIndex = publisher.indexOf(
    '- name: Recheck current protected workflow immediately before App token'
  );
  const tokenMintIndex = publisher.indexOf('- name: Mint restricted server release tag token');
  const tagMutationIndex = publisher.indexOf('- name: Create or verify exact annotated release tag');
  assert.ok(rulesetGateIndex >= 0, 'protected publisher must define the live stable-tag ruleset gate');
  assert.ok(finalAuthorityGateIndex >= 0, 'protected publisher must repeat its live workflow authority gate');
  assert.ok(
    rulesetGateIndex < finalAuthorityGateIndex &&
      finalAuthorityGateIndex < tokenMintIndex &&
      tokenMintIndex < tagMutationIndex,
    'ruleset and fresh workflow authority verification must run before App-token minting and tag mutation'
  );
  assert.equal(
    publisher.slice(0, tokenMintIndex).lastIndexOf('- name:'),
    finalAuthorityGateIndex,
    'the fresh live-master authority verification must be the final step before App-token minting'
  );
  const finalAuthorityGate = publisher.slice(
    finalAuthorityGateIndex,
    publisher.indexOf('\n      - name:', finalAuthorityGateIndex + 1)
  );
  assert.match(finalAuthorityGate, /verify-current-release-workflow/);
  assert.match(finalAuthorityGate, /--workflow-sha "\$\{WORKFLOW_SHA\}"/);
  assert.match(finalAuthorityGate, /--release-commit "\$\{RELEASE_COMMIT\}"/);
  assert.match(finalAuthorityGate, /GIT_NO_REPLACE_OBJECTS=1/);
  assert.doesNotMatch(
    publisher.slice(tokenMintIndex),
    /github\.token|secrets\.GITHUB_TOKEN|GITHUB_TOKEN/,
    'the read-only workflow token must not reach token minting or tag mutation'
  );

  assert.match(publishedVerifier, /needs: \[tag_release, publish_release_tag\]/);
  assert.match(publishedVerifier, /persist-credentials: false/);
  assert.match(
    publishedVerifier,
    /release-config\.mjs verify-prepared[\s\S]*--release-tag "\$\{RELEASE_TAG\}"[\s\S]*--expected-commit "\$\{EXPECTED_COMMIT\}"[\s\S]*--publish-latest true/
  );
  assert.match(image, /uses: \.\/\.github\/workflows\/container\.yml/);
  assert.match(image, /needs: \[tag_release, publish_release_tag, verify_published_release\]/);
  assert.match(image, /permissions:\s*\n\s+attestations: write\s*\n\s+contents: read\s*\n\s+id-token: write/);
  assert.doesNotMatch(image, /packages: write|secrets: inherit/);
  assert.match(image, /publish_latest: true/);
  assert.match(ota, /needs: \[tag_release, publish_release_tag, build_release_image\]/);
  assert.match(ota, /if: needs\.tag_release\.outputs\.native_release_ready == 'true'/);
  assert.match(ota, /uses: \.\/\.github\/workflows\/expo-ota-update\.yml/);
  assert.match(ota, /source_ref: \$\{\{ inputs\.release_commit \}\}/);
  assert.match(ota, /native_build_ref: \$\{\{ needs\.tag_release\.outputs\.native_release_tag \}\}/);
  assert.match(ota, /message: Release \$\{\{ needs\.tag_release\.outputs\.release_tag \}\}/);
  assert.doesNotMatch(ota, /secrets: inherit|EXPO_TOKEN/);
  assert.doesNotMatch(workflow, /^\s{0,8}(?:contents|packages|pull-requests): write\s*$/gm);
  assert.doesNotMatch(workflow, /native_build_ref_override/);
  assert.doesNotMatch(workflow, /pull_request_target|createWorkflowDispatch/);
  assert.doesNotMatch(workflow, /calibratehealth\.app\/api\/v1\/client-config|wait_for_hosted_release/);
});

test('optional self-host deployment consumes the published digest without gating OTA', () => {
  const publisher = readWorkflow('publish-release.yml');
  const deployment = workflowJobBlock(publisher, 'deploy_self_hosted');
  const ota = workflowJobBlock(publisher, 'publish_ota');
  assert.match(deployment, /needs: \[tag_release, build_release_image\]/);
  assert.match(deployment, /vars\.SELF_HOSTED_DEPLOY_ENABLED == 'true'/);
  assert.match(deployment, /github\.ref == 'refs\/heads\/master'/);
  assert.match(deployment, /image_ref: \$\{\{ needs\.build_release_image\.outputs\.image_ref \}\}/);
  assert.match(deployment, /release_tag: \$\{\{ needs\.tag_release\.outputs\.release_tag \}\}/);
  assert.match(deployment, /release_commit: \$\{\{ inputs\.release_commit \}\}/);
  assert.match(deployment, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(deployment, /native_release_ready|publish_ota/);
  assert.doesNotMatch(ota, /deploy_self_hosted/);

  const image = readWorkflow('container.yml');
  const publishImage = workflowJobBlock(image, 'publish_image');
  assert.match(image, /value: \$\{\{ jobs\.publish_image\.outputs\.image_ref \}\}/);
  assert.match(publishImage, /image_ref: \$\{\{ steps\.publish\.outputs\.image_ref \}\}/);
  assert.match(publishImage, /name: Publish write-once immutable identities and verified latest\n\s+id: publish/);
  const digestOutput = 'echo "image_ref=${GHCR_IMAGE}@${AUTHORITATIVE_DIGEST}" >> "${GITHUB_OUTPUT}"';
  const outputIndex = publishImage.indexOf(digestOutput);
  assert.ok(outputIndex > 0, 'publish the verified registry identity, including recovered images');
  for (const gate of [
    'verify_receipt_attestation "${AUTHORITATIVE_CONFIG_DIGEST}"',
    'ensure_immutable_alias "${RELEASE_IMAGE}" "${AUTHORITATIVE_DIGEST}"',
    'ensure_immutable_alias "${SOURCE_IMAGE}" "${AUTHORITATIVE_DIGEST}"',
    'require_digest "${LATEST_IMAGE}" "${AUTHORITATIVE_DIGEST}"'
  ]) {
    const gateIndex = publishImage.lastIndexOf(gate);
    assert.ok(gateIndex > 0 && gateIndex < outputIndex, gate + ' must complete before exposing the digest');
  }
  assert.doesNotMatch(workflowJobBlock(image, 'build_image'), /image_ref:/);
  assert.doesNotMatch(image, /^  workflow_dispatch:/m);

  const workflow = readWorkflow('deploy-self-hosted.yml');
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /vars\.SELF_HOSTED_DEPLOY_ENABLED == 'true'.*github\.ref == 'refs\/heads\/master'/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /environment: self-hosted-testing/);
  assert.match(workflow, /group: self-hosted-testing-deploy\n\s+cancel-in-progress: false/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(workflow, /node scripts\/release-config\.mjs verify-current-release-workflow/);
  assert.match(workflow, /if \[\[ -n "\$\{RELEASE_COMMIT\}" \]\]; then\n\s+RELEASE_ARGS=\(--release-commit "\$\{RELEASE_COMMIT\}"\)/);
  assert.match(workflow, /--workflow-sha "\$\{WORKFLOW_SHA\}"[\s\S]*"\$\{RELEASE_ARGS\[@\]\}"/);
  assert.ok(workflow.indexOf('verify-current-release-workflow') < workflow.indexOf('secrets.DEPLOY_'));
  assertReviewedReleaseActionPins('deploy-self-hosted.yml');
  assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(workflow, /pull_request:|workflow_run:|packages: write|contents: write/);
  assert.doesNotMatch(workflow, /runs-on:.*self-hosted|continue-on-error|ssh-keyscan/);
  for (const match of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(match[1], /@[a-f0-9]{40}(?: |$)/);
});

test('pull requests build and smoke only Web-impacting changes while exhaustive suites stay manual', () => {
  const workflow = readWorkflow('builds.yml');
  const changes = workflowJobBlock(workflow, 'changes');
  const webPaths = workflowPathFilterBlock(changes, 'web');
  const expoWebBuild = workflowJobBlock(workflow, 'expo-web-build');
  const smoke = workflowJobBlock(workflow, 'web-critical-smoke');
  const exportedWeb = workflowJobBlock(workflow, 'exported-web-e2e');
  const dataStates = workflowJobBlock(workflow, 'data-state-acceptance');
  const ux = workflowJobBlock(workflow, 'ux-regression');
  const playwrightConfig = readFileSync(
    path.join(repositoryRoot, 'playwright.expo-web.config.ts'),
    'utf8'
  );
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assertPathFilterOutputs(
    changes,
    [
      'release_config',
      'backend',
      'web',
      'wear',
      'native_runtime',
      'native_package',
      'web_release',
      'native_release',
      'native_upgrade'
    ],
    'decision',
    '0e4a8c6effa4802afeda77dc8d303f8176d7dfad'
  );
  const releaseConfig = workflowJobBlock(workflow, 'release-config');

  assert.match(workflow, /on:\s*\n\s+pull_request:/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*validation_scope:[\s\S]*configuration-only/);
  assert.match(changes, /if: github\.event_name == 'pull_request'/);
  assert.doesNotMatch(webPaths, /- 'backend\/\*\*'/);
  assert.doesNotMatch(webPaths, /- 'mobile\/test\/\*\*'/);
  assert.match(webPaths, /- 'mobile\/src\/\*\*'/);
  assert.match(webPaths, /- 'e2e\/expo-web\/release-smoke\.spec\.ts'/);
  assert.doesNotMatch(webPaths, /- 'e2e\/expo-web\/\*\*'/);
  assert.doesNotMatch(webPaths, /performance-budgets/);
  assert.match(webPaths, /- 'scripts\/expo-cli-environment\.mjs'/);
  assert.match(webPaths, /- 'scripts\/expo-web-playwright\.mjs'/);
  assert.match(webPaths, /- 'playwright\.expo-web\.config\.ts'/);
  assert.doesNotMatch(expoWebBuild, /test:performance:web|CALIBRATE_RUN_HOSTED_WEB_VITALS/);
  assert.match(expoWebBuild, /if: needs\.changes\.outputs\.web == 'true'/);
  assert.match(expoWebBuild, /npm\.cmd run build:expo-web/);
  assert.match(smoke, /if: needs\.changes\.outputs\.web == 'true'/);
  assert.match(smoke, /runs-on: windows-latest/);
  assert.match(smoke, /node-version: 24\.14\.0/);
  assert.match(smoke, /node node_modules\/@playwright\/test\/cli\.js install chromium/);
  assert.match(smoke, /npm\.cmd run test:expo-web:smoke/);
  assert.match(playwrightConfig, /if \(process\.env\.CI\) return \{\};[\s\S]*channel:/);
  assert.match(playwrightConfig, /process\.env\.CI \? \[\/launch-21-performance-budgets\\\.spec\\\.ts\/\] : \[\]/);
  assert.equal(
    packageConfig.scripts['test:performance:web'],
    'playwright test --config=playwright.expo-web.config.ts --project=desktop-chrome e2e/expo-web/launch-21-performance-budgets.spec.ts'
  );
  assert.match(packageConfig.scripts['test:expo-web:smoke'], /release-smoke\.spec\.ts/);
  for (const [job, command] of [
    [exportedWeb, 'test:expo-web'],
    [dataStates, 'test:data-states'],
    [ux, 'test:ux']
  ]) {
    assert.match(job, /needs: changes/);
    assert.match(
      job,
      /if: github\.event_name == 'workflow_dispatch' && needs\.changes\.outputs\.web_release == 'true'/
    );
    assert.ok(job.includes(`npm.cmd run ${command}`));
    assert.doesNotMatch(job, /hosted-result/);
  }
  assert.match(ux, /retention-days: 7/);
  assert.match(releaseConfig, /if: needs\.changes\.outputs\.release_config == 'true'/);
  assert.match(
    releaseConfig,
    /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\.4\.0[\s\S]*persist-credentials: false/
  );
  assert.match(
    releaseConfig,
    /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4\.4\.0/
  );
});

test('pull requests run backend builds only for backend-impacting paths', () => {
  const workflow = readWorkflow('builds.yml');
  const changes = workflowJobBlock(workflow, 'changes');
  const backendPaths = workflowPathFilterBlock(changes, 'backend');
  const backendBuild = workflowJobBlock(workflow, 'backend-build');

  assert.match(backendPaths, /- 'backend\/\*\*'/);
  assert.match(backendPaths, /- 'shared\/\*\*'/);
  assert.doesNotMatch(backendPaths, /- '!/);
  assert.equal(pathFilterMatches(changes, 'backend', 'package.json'), false);
  assert.equal(pathFilterMatches(changes, 'backend', 'backend/scripts/performance-regression.js'), true);
  assert.match(backendBuild, /needs: changes/);
  assert.match(backendBuild, /if: needs\.changes\.outputs\.backend == 'true'/);
  assert.match(backendBuild, /npm run build/);
  assert.doesNotMatch(workflow, /\n  performance-regression:/);
});

test('pull requests run targeted native compilation while emulator and upgrade rehearsals stay manual', () => {
  const workflow = readWorkflow('builds.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const changes = workflowJobBlock(workflow, 'changes');
  const runtime = workflowJobBlock(workflow, 'native-metro-bundle');
  const mobileBuild = workflowJobBlock(workflow, 'mobile-build');
  const iosBuild = workflowJobBlock(workflow, 'ios-build');
  const wearBuild = workflowJobBlock(workflow, 'wear-build');
  const android = workflowJobBlock(workflow, 'android-emulator-e2e');
  const wear = workflowJobBlock(workflow, 'wear-release-emulator-smoke');
  const upgrade = workflowJobBlock(workflow, 'native-package-upgrade');

  assert.match(packageConfig.scripts['test:native-release'], /hosted-native-emulators\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /hosted-android-e2e\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /native-upgrade-rehearsal\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /native-tag-attestation\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /native-tag-protection\.test\.mjs/);
  assert.equal(
    packageConfig.scripts['test:mobile-build-tools'],
    'node --test scripts/xcode-uuid-compatibility.test.mjs'
  );

  assert.match(workflow, /validation_scope:[\s\S]*- web[\s\S]*- native[\s\S]*- web-and-native[\s\S]*- configuration-only/);
  assert.match(workflow, /run_native_upgrade:[\s\S]*type: boolean/);
  assert.match(workflow, /native_upgrade_baseline:[\s\S]*required: false/);
  assert.match(
    changes,
    /Validate manual native upgrade baseline[\s\S]*if: github\.event_name == 'workflow_dispatch' && inputs\.run_native_upgrade[\s\S]*\^\[0-9a-f\]\{40\}\$/
  );

  const wearPaths = workflowPathFilterPaths(changes, 'wear');
  assert.deepEqual(wearPaths, ['wear/**']);

  const nativeRuntimePaths = workflowPathFilterBlock(changes, 'native_runtime');
  for (const expectedPath of [
    'mobile/app/**',
    'mobile/assets/**',
    'mobile/src/**',
    'mobile/app.config.js',
    'mobile/app.json',
    'mobile/babel.config.js',
    'mobile/index.js',
    'mobile/metro.config.js',
    'mobile/modules/**',
    'mobile/package.json',
    'package-lock.json',
    'packages/api-client/**',
    'scripts/xcode-uuid-compatibility.test.mjs',
    'shared/**'
  ]) {
    assert.ok(nativeRuntimePaths.includes(`- '${expectedPath}'`), `native_runtime must include ${expectedPath}`);
  }
  assert.doesNotMatch(nativeRuntimePaths, /- 'package\.json'/);
  assert.doesNotMatch(nativeRuntimePaths, /\.github\/workflows\/builds\.yml/);

  const nativePackagePaths = workflowPathFilterBlock(changes, 'native_package');
  for (const expectedPath of [
    'mobile/app.config.js',
    'mobile/app.json',
    'mobile/eas.json',
    'mobile/assets/**',
    'mobile/modules/**',
    'mobile/package.json',
    'mobile/plugins/**',
    'package-lock.json'
  ]) {
    assert.ok(nativePackagePaths.includes(`- '${expectedPath}'`), `native_package must include ${expectedPath}`);
  }
  assert.doesNotMatch(nativePackagePaths, /mobile\/src|- 'package\.json'|scripts\/|\.github\/workflows/);

  assert.match(
    runtime,
    /if: needs\.changes\.outputs\.native_runtime == 'true' \|\| needs\.changes\.outputs\.native_package == 'true'/
  );
  assert.match(runtime, /npm run test:mobile-build-tools/);
  assert.match(runtime, /platform: \[android, ios\]/);
  assert.match(
    runtime,
    /node \.\.\/node_modules\/expo\/bin\/cli export --platform "\$\{\{ matrix\.platform \}\}" --output-dir "\$\{RUNNER_TEMP\}\/calibrate-\$\{\{ matrix\.platform \}\}-export"/
  );
  assert.match(mobileBuild, /if: needs\.changes\.outputs\.native_package == 'true'/);
  assert.match(mobileBuild, /Build Android debug/);
  assert.match(iosBuild, /if: needs\.changes\.outputs\.native_package == 'true'/);
  assert.match(iosBuild, /runs-on: macos-latest/);
  assert.match(iosBuild, /npm --prefix mobile run prebuild:ios/);
  assert.match(iosBuild, /pod install/);
  assert.match(iosBuild, /xcodebuild[\s\S]*generic\/platform=iOS Simulator[\s\S]*CODE_SIGNING_ALLOWED=NO/);
  assert.match(wearBuild, /if: needs\.changes\.outputs\.wear == 'true'/);
  assert.match(wearBuild, /assembleDebug testDebugUnitTest/);

  assert.match(mobileBuild, /if: needs\.changes\.outputs\.native_release == 'true'[\s\S]*actions\/upload-artifact@v4/);
  for (const [job, outputName] of [
    [android, 'native_release'],
    [wear, 'native_release'],
    [upgrade, 'native_upgrade']
  ]) {
    assert.match(
      job,
      new RegExp(`if: github\\.event_name == 'workflow_dispatch' && needs\\.changes\\.outputs\\.${outputName} == 'true'`)
    );
    assert.match(job, /retention-days: 7/);
    assert.doesNotMatch(job, /release-acceptance\.mjs hosted-result|retention-days: 90|test:risk-evidence:release/);
  }

  assert.match(android, /needs: \[changes, mobile-build\]/);
  assert.match(android, /script: node scripts\/hosted-android-e2e\.mjs/);
  assert.match(wear, /target: android-wear/);
  assert.match(wear, /profile: wearos_large_round/);
  assert.match(wear, /npm run test:wear:emulator/);
  assert.match(upgrade, /--baseline "\$NATIVE_UPGRADE_BASELINE"/);
  assert.match(upgrade, /--candidate "\$CALIBRATE_SOURCE_COMMIT"/);
  assert.match(upgrade, /--phone-serial emulator-5554/);
  assert.match(upgrade, /--wear-serial emulator-5556/);
  assert.match(upgrade, /--execute --package-only/);
  assert.throws(() => workflowJobBlock(workflow, 'android.*'), /literal safe identifier/);
});

test('native jobs bind immutable candidate and baseline SHAs for PR and manual events', () => {
  const workflow = readWorkflow('builds.yml');
  const mobileBuild = workflowJobBlock(workflow, 'mobile-build');
  const android = workflowJobBlock(workflow, 'android-emulator-e2e');
  const wear = workflowJobBlock(workflow, 'wear-release-emulator-smoke');
  const upgrade = workflowJobBlock(workflow, 'native-package-upgrade');
  const candidateExpression = '${{ github.event.pull_request.head.sha || github.sha }}';

  assert.ok(mobileBuild.includes(`name: android-debug-apk-${candidateExpression}`));
  assert.ok(android.includes(`name: android-debug-apk-${candidateExpression}`));
  for (const job of [android, wear, upgrade]) {
    assert.ok(job.includes(`CALIBRATE_SOURCE_COMMIT: ${candidateExpression}`));
  }
  assert.ok(
    upgrade.includes(
      'NATIVE_UPGRADE_BASELINE: ${{ github.event.pull_request.base.sha || inputs.native_upgrade_baseline }}'
    )
  );

  for (const scenario of [
    {
      eventName: 'pull_request',
      pullRequestHeadSha: '1'.repeat(40),
      pullRequestBaseSha: '2'.repeat(40),
      githubSha: '3'.repeat(40),
      manualBaseline: '',
      expectedCandidate: '1'.repeat(40),
      expectedBaseline: '2'.repeat(40)
    },
    {
      eventName: 'workflow_dispatch',
      pullRequestHeadSha: '',
      pullRequestBaseSha: '',
      githubSha: '4'.repeat(40),
      manualBaseline: '5'.repeat(40),
      expectedCandidate: '4'.repeat(40),
      expectedBaseline: '5'.repeat(40)
    }
  ]) {
    const candidate = scenario.pullRequestHeadSha || scenario.githubSha;
    const baseline = scenario.pullRequestBaseSha || scenario.manualBaseline;
    assert.equal(candidate, scenario.expectedCandidate, `${scenario.eventName} candidate`);
    assert.equal(baseline, scenario.expectedBaseline, `${scenario.eventName} baseline`);
    assert.match(candidate, /^[0-9a-f]{40}$/);
    assert.match(baseline, /^[0-9a-f]{40}$/);
  }
});

test('build input classification covers representative paths without cross-surface noise', () => {
  const changes = workflowJobBlock(readWorkflow('builds.yml'), 'changes');
  const filters = ['release_config', 'backend', 'web', 'wear', 'native_runtime', 'native_package'];
  assert.doesNotMatch(workflowPathFilterBlock(changes, 'release_config'), /- '!/);
  assert.doesNotMatch(workflowPathFilterBlock(changes, 'backend'), /- '!/);
  const cases = [
    ['docs/review-notes.md', []],
    ['.github/native-release-tag-allowed-signers', ['release_config']],
    ['.github/native-play-attestation-trusted-workflow-shas', ['release_config']],
    ['.github/release-image-attestation-trusted-workflow-shas', ['release_config']],
    ['tools/eas-cli/package-lock.json', ['release_config']],
    ['.github/workflows/tests.yml', ['release_config']],
    ['.github/workflows/builds.yml', ['release_config']],
    ['backend/src/routes/user.ts', ['backend']],
    ['shared/caloriePolicy.ts', ['backend', 'web', 'native_runtime']],
    ['mobile/src/components/AppCard.tsx', ['web', 'native_runtime']],
    ['mobile/test/jest.setup.ts', []],
    ['mobile/plugins/withHealthConnect.js', ['native_package']],
    ['mobile/assets/icon-ios.png', ['web', 'native_runtime', 'native_package']],
    ['mobile/babel.config.js', ['web', 'native_runtime']],
    ['wear/app/src/main/AndroidManifest.xml', ['release_config', 'wear']],
    ['quality/performance-budgets.json', ['release_config']],
    ['quality/risk-evidence.json', ['release_config']],
    ['scripts/expo-cli-environment.mjs', ['release_config', 'web']],
    ['scripts/expo-web-playwright.mjs', ['release_config', 'web']],
    ['scripts/performance-budgets.mjs', ['release_config']],
    ['scripts/verify-risk-evidence.mjs', ['release_config']],
    ['scripts/release-acceptance.mjs', ['release_config']],
    ['playwright.ux.config.ts', ['release_config']],
    ['scripts/xcode-uuid-compatibility.test.mjs', ['release_config', 'native_runtime']],
    ['e2e/expo-web/release-smoke.spec.ts', ['web']],
    ['e2e/expo-web/launch-21-performance-budgets.spec.ts', []],
    ['package.json', ['release_config', 'web']],
    ['package-lock.json', ['release_config', 'web', 'native_runtime', 'native_package']]
  ];

  for (const [candidatePath, expectedFilters] of cases) {
    const actualFilters = filters.filter((filterName) => pathFilterMatches(changes, filterName, candidatePath));
    assert.deepEqual(actualFilters, expectedFilters, candidatePath);
  }
});

test('manual Wear emulator runs persistence instrumentation after its release-package smoke', () => {
  const wear = workflowJobBlock(readWorkflow('builds.yml'), 'wear-release-emulator-smoke');
  const emulatorStep = wear
    .split(/\n(?=\s+- name:)/)
    .find((step) => step.includes('uses: reactivecircus/android-emulator-runner@v2'));
  assert.ok(emulatorStep, 'Wear job must run on its disposable emulator');

  assert.match(wear, /-keystore mobile\/android\/app\/debug\.keystore/);
  assert.match(wear, /-alias androiddebugkey/);
  assert.match(emulatorStep, /script: \|/);
  assert.match(emulatorStep, /npm run test:wear:emulator/);
  assert.match(emulatorStep, /adb -s "\$WEAR_ADB_SERIAL" uninstall app\.calibratehealth\.mobile/);
  assert.match(emulatorStep, /:app:connectedDebugAndroidTest/);
  assert.match(emulatorStep, /-PcalibrateWearServerUrl=https:\/\/calibratehealth\.app/);
  assert.match(emulatorStep, /-PcalibrateWearDebugServerUrl=http:\/\/10\.0\.2\.2:3000/);
  assert.doesNotMatch(
    emulatorStep,
    /(^|\s)\\(?=\s|$)/,
    'Wear emulator commands must not pass standalone shell-continuation arguments',
  );

  const releaseSmokeIndex = emulatorStep.indexOf('npm run test:wear:emulator');
  const uninstallIndex = emulatorStep.indexOf('uninstall app.calibratehealth.mobile');
  const instrumentationIndex = emulatorStep.indexOf(':app:connectedDebugAndroidTest');
  assert.ok(releaseSmokeIndex >= 0, 'Wear release-package smoke must run');
  assert.ok(
    releaseSmokeIndex < uninstallIndex && uninstallIndex < instrumentationIndex,
    'the differently signed release package must be removed before debug instrumentation',
  );
});

test('release images publish immutable identity and guard the moving latest tag', () => {
  const workflow = readWorkflow('container.yml');
  const build = workflowJobBlock(workflow, 'build_image');
  const attester = workflowJobBlock(workflow, 'attest_image_receipt');
  const publisher = workflowJobBlock(workflow, 'publish_image');
  const deployEnvironment = readFileSync(path.join(repositoryRoot, 'deploy', '.env.example'), 'utf8');
  const ghcrPolicy = readFileSync(path.join(repositoryRoot, 'scripts', 'ghcr-release-policy.mjs'), 'utf8');
  const ghcrReceipt = readFileSync(path.join(repositoryRoot, 'scripts', 'ghcr-release-receipt.mjs'), 'utf8');
  const releaseCompatibility = readFileSync(
    path.join(repositoryRoot, 'docs', 'release-compatibility.md'),
    'utf8'
  );
  const agentGuide = readFileSync(path.join(repositoryRoot, 'AGENTS.md'), 'utf8');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

  assert.match(workflow, /workflow_call:/);
  assert.doesNotMatch(workflow, /^  (?:workflow_dispatch|push):/gm);
  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /release_commit:/);
  assert.match(workflow, /publish_latest:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /group: release-image-publication[\s\S]*queue: max[\s\S]*cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /group: release-image-\$\{\{/);
  assert.doesNotMatch(workflow, /^\s{0,8}(?:contents|packages|pull-requests|actions): write\s*$/gm);

  assert.match(build, /Checkout exact prepared release source[\s\S]*ref: \$\{\{ inputs\.release_commit \}\}[\s\S]*persist-credentials: false/);
  assert.match(build, /Checkout reviewed release tooling[\s\S]*ref: \$\{\{ job\.workflow_sha \}\}[\s\S]*persist-credentials: false/);
  assert.match(
    build,
    /release-config\.mjs verify-prepared[\s\S]*--release-tag "\$\{RELEASE_TAG\}"[\s\S]*--expected-commit "\$\{EXPECTED_COMMIT\}"[\s\S]*--publish-latest "\$\{PUBLISH_LATEST\}"/
  );
  assert.match(build, /BUILDX_URL: https:\/\/github\.com\/docker\/buildx\/releases\/download\/v0\.36\.1\/buildx-v0\.36\.1\.linux-amd64/);
  assert.match(build, /BUILDX_SHA256: 48af8a397ebd60178778bf63611dbcebe5f5e7a9be90eb9147b24b9587455778/);
  const buildxSetup = build.match(/- name: Set up digest-pinned BuildKit[\s\S]*?(?=\n\s+- name:)/)?.[0];
  assert.ok(buildxSetup);
  assert.match(buildxSetup, /image=moby\/buildkit@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8/);
  assert.doesNotMatch(buildxSetup, /github-token:|\n\s+version:/);
  const imageBuild = build.match(/- name: Build AMD64 image without publication credentials[\s\S]*?(?=\n\s+- name:)/)?.[0];
  assert.ok(imageBuild);
  assert.match(imageBuild, /platforms: linux\/amd64/);
  assert.match(imageBuild, /push: false/);
  assert.match(imageBuild, /github-token: ''/);
  assert.doesNotMatch(build, /environment:|docker\/login-action|GHCR_PUBLISH|secrets\.|packages: write/);
  assert.match(build, /docker save --output .*release-image\.tar/);
  for (const field of [
    'repository', 'release_commit', 'release_tag', 'publish_latest', 'ghcr_image',
    'local_image', 'image_id', 'tag_object'
  ]) {
    assert.match(build, new RegExp(`${field}:`));
  }
  assert.match(
    build,
    /ghcr-release-receipt\.mjs create[\s\S]*--repository "\$\{GITHUB_REPOSITORY\}"[\s\S]*--ghcr-image "\$\{GHCR_IMAGE\}"[\s\S]*--release-tag "\$\{RELEASE_TAG\}"[\s\S]*--release-commit "\$\{RELEASE_COMMIT\}"[\s\S]*--image-config-digest "\$\{IMAGE_ID\}"/
  );
  assert.match(build, /release-image-receipt\.json[\s\S]*RECEIPT_SHA256/);
  assert.match(build, /name: verified-release-image[\s\S]*overwrite: true/);

  assert.match(attester, /needs: build_image/);
  assert.match(attester, /permissions:\s*\n\s+attestations: write\s*\n\s+contents: read\s*\n\s+id-token: write/);
  assert.doesNotMatch(attester, /environment:|packages:|GHCR_PUBLISH|SERVER_RELEASE|secrets\.|Checkout exact prepared|Dockerfile|docker load/);
  const attesterSteps = attester.split(/\n(?=\s{6}- name:)/);
  assert.match(attesterSteps[1], /Require current protected workflow authority before receipt construction/);
  assert.match(
    attesterSteps[1],
    /release-config\.mjs" verify-current-release-workflow[\s\S]*--workflow-sha "\$\{WORKFLOW_SHA\}"[\s\S]*--release-commit "\$\{RELEASE_COMMIT\}"/
  );
  assert.match(attesterSteps.at(-2), /Recheck current protected workflow authority immediately before attestation/);
  assert.match(attesterSteps.at(-2), /verify-current-release-workflow/);
  assert.match(attesterSteps.at(-1), /actions\/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4\.2\.1/);
  assert.match(attesterSteps.at(-1), /subject-path: \$\{\{ runner\.temp \}\}\/release-image-receipt\.json/);
  assert.match(attesterSteps.at(-1), /push-to-registry: false[\s\S]*create-storage-record: false/);
  assert.match(attester, /IMAGE_CONFIG_DIGEST: \$\{\{ needs\.build_image\.outputs\.image_id \}\}/);
  assert.match(attester, /EXPECTED_RECEIPT_SHA256: \$\{\{ needs\.build_image\.outputs\.receipt_sha256 \}\}/);

  assert.match(publisher, /needs: \[build_image, attest_image_receipt\]/);
  assert.match(publisher, /environment: server-release-publication/);
  assert.match(
    publisher,
    /permissions:\s*\n\s+actions: read\s*\n\s+attestations: read\s*\n\s+contents: read/
  );
  assert.doesNotMatch(publisher, /attestations: write|id-token: write/);
  assert.match(publisher, /Download verified image bundle[\s\S]*name: verified-release-image/);
  assert.match(publisher, /Downloaded image artifact must contain exactly the four expected regular files/);
  assert.match(publisher, /EXPECTED_TAR_SHA256[\s\S]*EXPECTED_RECEIPT_SHA256/);
  assert.match(publisher, /sha256sum --check --strict SHA256SUMS/);
  assert.match(publisher, /jq --exit-status[\s\S]*schema_version[\s\S]*tag_object/);
  assert.match(publisher, /docker load --input/);
  assert.match(publisher, /Checkout reviewed release tooling only[\s\S]*ref: \$\{\{ job\.workflow_sha \}\}[\s\S]*persist-credentials: false/);
  assert.doesNotMatch(publisher, /Checkout exact prepared release source|path: \.release-source|Dockerfile\.app|docker\/build-push-action|npm ci|node scripts\//);
  const stepsIndex = publisher.indexOf('\n    steps:');
  const downloadIndex = publisher.indexOf('- name: Download verified image bundle');
  const loadIndex = publisher.indexOf('- name: Load verified image without registry credentials');
  const toolingIndex = publisher.indexOf('- name: Checkout reviewed release tooling only');
  const buildxIndex = publisher.indexOf('- name: Install checksum-verified Buildx CLI plugin before authentication');
  const ghCliIndex = publisher.indexOf('- name: Install checksum-verified GitHub CLI attestation verifier');
  const receiptAttestationIndex = publisher.indexOf(
    '- name: Verify exact built image receipt attestation before registry authentication'
  );
  const rulesetIndex = publisher.indexOf('- name: Verify stable release tag rulesets before registry authentication');
  const finalFreshnessIndex = publisher.indexOf(
    '- name: Recheck current protected workflow authority immediately before GHCR authentication'
  );
  const freshnessIndex = publisher.indexOf(
    '- name: Require current protected workflow authority before image artifact access'
  );
  const loginIndex = publisher.indexOf('- name: Login with isolated GHCR publisher credential');
  const publishIndex = publisher.indexOf('- name: Publish write-once immutable identities and verified latest');
  assert.ok(
    0 <= stepsIndex &&
      stepsIndex < freshnessIndex &&
      freshnessIndex < downloadIndex &&
      downloadIndex < loadIndex &&
      loadIndex < toolingIndex &&
      toolingIndex < buildxIndex &&
      buildxIndex < ghCliIndex &&
      ghCliIndex < receiptAttestationIndex &&
      receiptAttestationIndex < rulesetIndex &&
      rulesetIndex < finalFreshnessIndex &&
      finalFreshnessIndex < loginIndex &&
      loginIndex < publishIndex
  );
  assert.ok(
    publisher.indexOf('environment: server-release-publication') < freshnessIndex,
    'the current-master gate must run only after publication-environment admission'
  );
  assert.equal(
    publisher.indexOf('- name:', stepsIndex),
    freshnessIndex,
    'the current-master gate must be the protected publisher job\'s first step'
  );
  assert.doesNotMatch(
    publisher.slice(stepsIndex, freshnessIndex),
    /uses:|download-artifact|docker load|\.release-tooling|vars\.|secrets\.|docker\/login-action/,
    'no artifact, action, tooling, variable, secret, or login may precede the authority gate'
  );
  assert.match(
    publisher,
    /Verify stable release tag rulesets before registry authentication[\s\S]*GITHUB_TOKEN: \$\{\{ github\.token \}\}[\s\S]*server-release-tag-protection\.mjs verify[\s\S]*--repository "\$\{GITHUB_REPOSITORY\}"[\s\S]*--tag "\$\{RELEASE_TAG\}"/
  );
  const freshness = publisher.match(
    /\n      - name: Require current protected workflow authority before image artifact access\n[\s\S]*?(?=\n      - name:)/
  )?.[0];
  assert.ok(freshness, 'publisher must define a current protected workflow authority gate');
  assert.match(freshness, /WORKFLOW_SHA: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(freshness, /RELEASE_COMMIT: \$\{\{ inputs\.release_commit \}\}/);
  assert.match(freshness, /GIT_CONFIG_GLOBAL=\/dev\/null/);
  assert.match(freshness, /GIT_CONFIG_NOSYSTEM=1/);
  assert.match(freshness, /GIT_NO_REPLACE_OBJECTS=1/);
  assert.match(freshness, /GITHUB_REF.*refs\/heads\/master/);
  assert.match(
    freshness,
    /git init --quiet --template='' "\$\{VERIFY_ROOT\}"[\s\S]*remote add origin "https:\/\/github\.com\/\$\{GITHUB_REPOSITORY\}\.git"[\s\S]*fetch --force --no-tags origin \\\n\s+'\+refs\/heads\/master:refs\/remotes\/origin\/master'/
  );
  assert.match(
    freshness,
    /"\$\{WORKFLOW_SHA\}:scripts\/release-config\.mjs" > "\$\{TOOL_ROOT\}\/scripts\/release-config\.mjs"/
  );
  assert.match(
    freshness,
    /"\$\{WORKFLOW_SHA\}:scripts\/native-tag-attestation\.mjs" > "\$\{TOOL_ROOT\}\/scripts\/native-tag-attestation\.mjs"/
  );
  assert.match(
    freshness,
    /release-config\.mjs" verify-current-release-workflow[\s\S]*--repository-root "\$\{VERIFY_ROOT\}"[\s\S]*--workflow-sha "\$\{WORKFLOW_SHA\}"[\s\S]*--release-commit "\$\{RELEASE_COMMIT\}"/
  );
  assert.equal((freshness.match(/\bfetch\b/g) ?? []).length, 1);
  assert.doesNotMatch(
    freshness,
    /verify-prepared|merge-base --is-ancestor|uses:|download-artifact|docker load|vars\.|secrets\.|docker\/login-action/,
    'the first-step gate must delegate the exact Cut exception without exposing later authority'
  );
  assert.match(publisher, /username: \$\{\{ vars\.GHCR_PUBLISH_USERNAME \}\}/);
  assert.match(publisher, /password: \$\{\{ secrets\.GHCR_PUBLISH_TOKEN \}\}/);
  assert.doesNotMatch(publisher, /secrets\.GITHUB_TOKEN|packages: write/);
  assert.equal([...publisher.matchAll(/\$\{\{ github\.token \}\}/g)].length, 3);
  const finalFreshness = publisher.match(
    /\n      - name: Recheck current protected workflow authority immediately before GHCR authentication\n[\s\S]*?(?=\n      - name:)/
  )?.[0];
  assert.ok(finalFreshness);
  assert.match(finalFreshness, /verify-current-release-workflow/);
  assert.equal(
    publisher.slice(finalFreshnessIndex).indexOf('- name: Login with isolated GHCR publisher credential'),
    publisher.slice(finalFreshnessIndex).indexOf('- name:', 1),
    'the live workflow recheck must be immediately adjacent to GHCR secret materialization'
  );
  assert.match(publisher, /GH_CLI_URL: https:\/\/github\.com\/cli\/cli\/releases\/download\/v2\.97\.0\/gh_2\.97\.0_linux_amd64\.tar\.gz/);
  assert.match(publisher, /GH_CLI_SHA256: a2c9b8497e1f85b1ad0dfcb78b5a622e098801b8e461e459e88e1ee12f018112/);
  assert.doesNotMatch(publisher, /\bgh attestation verify|\$\{?\s*which gh|GH_CLI_URL:.*latest/);

  assert.match(publisher, /release-config\.mjs verify-prepared[\s\S]*--expected-commit "\$\{RELEASE_COMMIT\}"/);
  assert.match(publisher, /ls-remote[\s\S]*refs\/tags\/\$\{RELEASE_TAG\}/);
  assert.match(publisher, /ghcr-release-policy\.mjs classify-absence/);
  assert.match(publisher, /classify-absence[\s\S]*--error-file "\$\{error_file\}"[\s\S]*--image-ref "\$\{image_ref\}"/);
  assert.match(publisher, /ghcr-release-policy\.mjs validate-manifest/);
  assert.match(
    publisher,
    /config_digest="\$\(node \.release-tooling\/scripts\/ghcr-release-policy\.mjs validate-manifest[\s\S]*--image-config-file "\$\{config_file\}"\)"[\s\S]*printf '%s' "\$\{digest\}"/
  );
  assert.doesNotMatch(publisher, /grep[^\n]*(?:not found|manifest unknown)/i);
  assert.match(publisher, /Immutable image tags disagree/);
  assert.match(publisher, /AUTHORITATIVE_DIGEST="\$\{RELEASE_DIGEST:-\$\{SOURCE_DIGEST\}\}"/);
  assert.match(publisher, /ensure_immutable_alias "\$\{RELEASE_IMAGE\}" "\$\{AUTHORITATIVE_DIGEST\}"/);
  assert.match(publisher, /ensure_immutable_alias "\$\{SOURCE_IMAGE\}" "\$\{AUTHORITATIVE_DIGEST\}"/);
  assert.match(
    publisher,
    /PUBLISHED_FRESH=false[\s\S]*if \[\[ -z "\$\{RELEASE_DIGEST\}" && -z "\$\{SOURCE_DIGEST\}" \]\][\s\S]*docker push "\$\{RELEASE_IMAGE\}"[\s\S]*PUBLISHED_FRESH=true/
  );
  assert.match(
    publisher,
    /if \[\[ "\$\{PUBLISHED_FRESH\}" == "true" \]\]; then[\s\S]*PUBLISHED_IMAGE_ID[\s\S]*EXPECTED_IMAGE_ID[\s\S]*fi[\s\S]*ensure_immutable_alias "\$\{RELEASE_IMAGE\}" "\$\{AUTHORITATIVE_DIGEST\}"[\s\S]*ensure_immutable_alias "\$\{SOURCE_IMAGE\}" "\$\{AUTHORITATIVE_DIGEST\}"/
  );
  const authoritativeIndex = publisher.indexOf(
    'AUTHORITATIVE_DIGEST="${RELEASE_DIGEST:-${SOURCE_DIGEST}}"'
  );
  const freshIdentityGateIndex = publisher.indexOf('if [[ "${PUBLISHED_FRESH}" == "true" ]]');
  const receiptEvidenceIndex = publisher.indexOf(
    'verify_receipt_attestation "${AUTHORITATIVE_CONFIG_DIGEST}"'
  );
  const immutableAliasIndex = publisher.indexOf(
    'ensure_immutable_alias "${RELEASE_IMAGE}" "${AUTHORITATIVE_DIGEST}"'
  );
  assert.ok(
    0 <= authoritativeIndex &&
      authoritativeIndex < receiptEvidenceIndex &&
      receiptEvidenceIndex < freshIdentityGateIndex &&
      authoritativeIndex < freshIdentityGateIndex &&
      freshIdentityGateIndex < immutableAliasIndex
  );
  const authoritativeReceiptBlock = publisher.slice(authoritativeIndex, freshIdentityGateIndex);
  assert.match(authoritativeReceiptBlock, /config_digest_for_manifest "\$\{AUTHORITATIVE_DIGEST\}"/);
  assert.match(authoritativeReceiptBlock, /verify_receipt_attestation "\$\{AUTHORITATIVE_CONFIG_DIGEST\}"/);
  const freshIdentityBlock = publisher.slice(freshIdentityGateIndex, immutableAliasIndex);
  assert.match(freshIdentityBlock, /docker pull "\$\{GHCR_IMAGE\}@\$\{AUTHORITATIVE_DIGEST\}"/);
  assert.match(freshIdentityBlock, /PUBLISHED_IMAGE_ID[\s\S]*EXPECTED_IMAGE_ID/);
  assert.equal([...freshIdentityBlock.matchAll(/docker pull/g)].length, 1);
  assert.match(
    publisher,
    /if \[\[ -n "\$\{RELEASE_DIGEST\}" && -n "\$\{SOURCE_DIGEST\}" &&[\s\S]*"\$\{RELEASE_DIGEST\}" != "\$\{SOURCE_DIGEST\}" \]\]; then[\s\S]*Immutable image tags disagree/
  );
  assert.match(
    publisher,
    /--format '\{\{\.Manifest\.Digest\}\}' "\$\{image_ref\}"[\s\S]*repository="\$\{image_ref%:\*\}"[\s\S]*digest_ref="\$\{repository\}@\$\{digest\}"[\s\S]*imagetools inspect --raw "\$\{digest_ref\}"[\s\S]*--format '\{\{json \.Image\}\}' "\$\{digest_ref\}"/
  );
  assert.match(
    publisher,
    /verify_receipt_attestation\(\)[\s\S]*ghcr-release-receipt\.mjs create[\s\S]*--image-config-digest "\$\{config_digest\}"[\s\S]*attestation verify "\$\{receipt_file\}"[\s\S]*--signer-workflow "\$\{GITHUB_REPOSITORY\}\/\.github\/workflows\/container\.yml"[\s\S]*--source-ref refs\/heads\/master[\s\S]*--limit 100[\s\S]*--format json > "\$\{discovery_file\}"[\s\S]*ghcr-release-receipt\.mjs discover-workflows[\s\S]*--verification-file "\$\{discovery_file\}"[\s\S]*while IFS= read -r signer_revision[\s\S]*ghcr-release-receipt\.mjs authorize-workflow[\s\S]*--candidate-workflow-revision "\$\{signer_revision\}"[\s\S]*--current-workflow-revision "\$\{WORKFLOW_SHA\}"[\s\S]*--trusted-master-commit "\$\{trusted_master\}"[\s\S]*--release-commit "\$\{RELEASE_COMMIT\}"[\s\S]*attestation verify "\$\{receipt_file\}"[\s\S]*--signer-digest "\$\{signer_revision\}"[\s\S]*--source-digest "\$\{signer_revision\}"[\s\S]*--limit 100/
  );
  assert.match(
    publisher,
    /Recheck current protected workflow authority immediately before GHCR authentication[\s\S]*verify-current-release-workflow[\s\S]*TRUST_SET_COMMIT=.*refs\/remotes\/origin\/master[\s\S]*release-image-attestation-trusted-workflow-shas[\s\S]*ghcr-release-receipt\.mjs trusted-workflows[\s\S]*--current-workflow-revision "\$\{WORKFLOW_SHA\}"/
  );
  assert.match(publisher, /TRUSTED_MASTER_FILE[\s\S]*printf '%s\\n' "\$\{TRUST_SET_COMMIT\}"/);
  assert.equal(
    [...publisher.matchAll(/attestation verify/g)].length,
    [...publisher.matchAll(/--limit 100/g)].length,
    'every receipt lookup must raise the bounded attestation search limit'
  );
  assert.match(publisher, /lacks the exact trusted release receipt attestation/);
  assert.match(publisher, /Quarantine or delete its v\*\/sha-\* aliases after an owner review/);
  assert.ok(
    receiptEvidenceIndex < publisher.indexOf('ensure_immutable_alias "${RELEASE_IMAGE}"') &&
      receiptEvidenceIndex < publisher.indexOf('--tag "${LATEST_IMAGE}"'),
    'an exact registry-config receipt attestation must authorize every alias fill and latest mutation'
  );
  assert.match(publisher, /verify_release false[\s\S]*docker push "\$\{RELEASE_IMAGE\}"/);
  assert.match(publisher, /verify_release false[\s\S]*docker buildx imagetools create/);
  assert.match(publisher, /verify_release true[\s\S]*--tag "\$\{LATEST_IMAGE\}"[\s\S]*"\$\{GHCR_IMAGE\}@\$\{AUTHORITATIVE_DIGEST\}"/);

  assert.match(ghcrPolicy, /application\/vnd\.oci\.image\.index\.v1\+json/);
  assert.match(ghcrPolicy, /application\/vnd\.docker\.distribution\.manifest\.list\.v2\+json/);
  assert.match(ghcrPolicy, /imageConfig\.os !== 'linux' \|\| imageConfig\.architecture !== 'amd64'/);
  assert.match(ghcrPolicy, /configDigest: config\.digest/);
  assert.match(ghcrPolicy, /\^ERROR: \$\{escapedRef\}: \(\?:not found\|manifest unknown\)\$/);
  assert.match(packageConfig.scripts['test:release'], /ghcr-release-policy\.test\.mjs/);
  assert.match(packageConfig.scripts['test:release'], /ghcr-release-receipt\.test\.mjs/);
  for (const field of ['repository', 'ghcr_image', 'release_tag', 'release_commit', 'image_config_digest']) {
    assert.match(ghcrReceipt, new RegExp(field));
  }
  assert.doesNotMatch(ghcrReceipt, /workflow_revision|workflowRevision/);
  assert.match(ghcrReceipt, /parseGhcrAttestationWorkflowCandidates/);
  assert.match(ghcrReceipt, /authorizeGhcrReleaseWorkflow/);
  assert.match(ghcrReceipt, /unchanged-critical-tooling/);
  assert.match(ghcrReceipt, /canonical-cut-parent/);
  assert.match(ghcrReceipt, /explicitly revoked by current protected master/);
  assert.match(releaseCompatibility, /allow FULL_SHA[\s\S]*revoke FULL_SHA/);
  assert.match(releaseCompatibility, /full supported[\s\S]*recovery window/);
  assert.match(releaseCompatibility, /integrity authority, not an availability boundary/);
  assert.match(releaseCompatibility, /flood or delete records/);
  assert.match(releaseCompatibility, /inventory every existing `v\*` and `sha-\*` alias/);
  assert.match(agentGuide, /revoke SHA[\s\S]*overrides every\s+automatic rule/);
  assert.match(agentGuide, /missing\/deleted\/flooded legitimate evidence still fails closed/);

  const attestationCallChain = [
    ['container-handler.yml', 'run_release', '.github/workflows/container.yml'],
    ['publish-release-handler.yml', 'run_release', '.github/workflows/publish-release.yml'],
    ['cut-release-handler.yml', 'run_release', '.github/workflows/cut-release.yml'],
    ['publish-release.yml', 'build_release_image', '.github/workflows/container.yml'],
    ['cut-release.yml', 'publish', '.github/workflows/publish-release.yml']
  ];
  for (const [workflowName, jobName, calledWorkflow] of attestationCallChain) {
    const caller = readWorkflow(workflowName);
    const header = caller.slice(0, caller.indexOf('\njobs:'));
    const callJob = workflowJobBlock(caller, jobName);
    assert.match(header, /permissions:[\s\S]*attestations: write[\s\S]*id-token: write/);
    assert.match(callJob, new RegExp(`uses: \\.\\/${calledWorkflow.replaceAll('.', '\\.')}`));
    assert.match(callJob, /permissions:[\s\S]*attestations: write[\s\S]*contents: read[\s\S]*id-token: write/);
  }
  for (const handlerName of ['container-handler.yml', 'publish-release-handler.yml', 'cut-release-handler.yml']) {
    const verifier = workflowJobBlock(readWorkflow(handlerName), 'verify_request');
    assert.match(verifier, /permissions:[\s\S]*actions: read[\s\S]*contents: read/);
    assert.doesNotMatch(verifier, /attestations: write|id-token: write/);
  }
  for (const [workflowName, readOnlyJobs] of [
    ['container.yml', ['build_image', 'publish_image']],
    ['publish-release.yml', ['tag_release', 'publish_release_tag', 'verify_published_release', 'publish_ota']],
    ['cut-release.yml', ['prepare', 'publish_candidate', 'release-validation', 'finalize', 'inspect_cleanup', 'cleanup-candidate']]
  ]) {
    const calledWorkflow = readWorkflow(workflowName);
    for (const jobName of readOnlyJobs) {
      assert.doesNotMatch(
        workflowJobBlock(calledWorkflow, jobName),
        /attestations: write|id-token: write/,
        `${workflowName} ${jobName} must not inherit receipt-signing authority`
      );
    }
  }

  assert.doesNotMatch(workflow, /image=moby\/buildkit:(?:latest|buildx-stable-1|master)/);
  assert.match(workflow, /ghcr\.io/);
  assert.doesNotMatch(workflow, /linux\/arm64|setup-qemu-action/);
  assert.doesNotMatch(workflow, /aws-actions|amazon-ecs|\bECR\b|\bECS\b|Deploy Staging|Deploy Prod/i);
  assert.match(deployEnvironment, /^APP_IMAGE=ghcr\.io\/mchartier\/calibratehealth:latest$/m);
  assert.doesNotMatch(deployEnvironment, /calibratehealth:master/);
});

test('no active workflow deploys to AWS or builds an image for every merged PR', () => {
  assert.equal(existsSync(path.join(workflowsDirectory, 'ghcr-master-merge.yml')), false);

  const workflows = readdirSync(workflowsDirectory)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => readWorkflow(name))
    .join('\n');
  assert.doesNotMatch(workflows, /aws-actions|amazon-ecs|\bECR\b|\bECS\b/i);
  assert.doesNotMatch(workflows, /pull_request_target/);
});

test('active workflows and package scripts do not retain the hosted-result or external-launch ledger', () => {
  const workflows = readdirSync(workflowsDirectory)
    .filter((entry) => entry.endsWith('.yml'))
    .map((entry) => readWorkflow(entry))
    .join('\n');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const acceptanceScript = readFileSync(
    path.join(repositoryRoot, 'scripts', 'release-acceptance.mjs'),
    'utf8'
  );
  const plan = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'quality', 'release-acceptance-plan.json'), 'utf8')
  );

  assert.doesNotMatch(
    workflows,
    /release-acceptance\.mjs hosted-result|\n  external-launch:|releaseAcceptanceEvidence|evidence_commit/
  );
  assert.equal(packageConfig.scripts['release:acceptance:external'], undefined);
  assert.equal(packageConfig.scripts['test:risk-evidence:release'], undefined);
  assert.doesNotMatch(
    acceptanceScript,
    /hosted-result|external-launch|releaseAcceptanceEvidence|evidence_commit|receipt ledger/i
  );
  assert.equal(plan.schemaVersion, 3);
  assert.equal(plan.profile, 'single-user-pre-release');
  assert.equal(plan.policy.retainedEvidenceRequired, false);
  assert.ok(Array.isArray(plan.automaticRequirements));
  assert.ok(Array.isArray(plan.manualCapabilities));
  assert.doesNotMatch(
    JSON.stringify(plan),
    /retainedArtifact|external-launch|releaseAcceptanceEvidence|evidence_commit|operatorReceipt/
  );
});

test('hidden workflow evidence paths are explicitly included in artifact uploads', () => {
  for (const name of readdirSync(workflowsDirectory).filter((entry) => entry.endsWith('.yml'))) {
    const workflow = readWorkflow(name);
    const uploadSteps = workflow
      .split(/\n(?=\s+- name:)/)
      .filter((step) => step.includes('uses: actions/upload-artifact@v4'));
    for (const step of uploadSteps.filter((candidate) => candidate.includes('path: .codex-screenshots'))) {
      assert.match(step, /include-hidden-files: true/, `${name} must include its hidden evidence path`);
    }
  }
});

test('Expo OTA separates source export from clean environment-scoped publication', () => {
  const workflow = readWorkflow('expo-ota-update.yml');
  const publishReleaseWorkflow = readWorkflow('publish-release.yml');
  const mobileReleaseRunbook = readFileSync(
    path.join(repositoryRoot, 'docs', 'mobile-release.md'),
    'utf8'
  );
  const agentGuide = readFileSync(path.join(repositoryRoot, 'AGENTS.md'), 'utf8');
  const otaPreflightSource = readFileSync(
    path.join(repositoryRoot, 'scripts', 'expo-ota-ci-preflight.mjs'),
    'utf8'
  );
  const preflight = workflowJobBlock(workflow, 'preflight-release-target');
  const resolveInternal = workflowJobBlock(workflow, 'resolve-internal-environment');
  const buildInternal = workflowJobBlock(workflow, 'build-internal-update');
  const publishInternal = workflowJobBlock(workflow, 'publish-internal');
  const resolveProduction = workflowJobBlock(workflow, 'resolve-production-environment');
  const buildProduction = workflowJobBlock(workflow, 'build-production-update');
  const publishProduction = workflowJobBlock(workflow, 'publish-production');
  const releaseOta = workflowJobBlock(publishReleaseWorkflow, 'publish_ota');
  const credentialedJobs = [resolveInternal, publishInternal, resolveProduction, publishProduction];
  const buildJobs = [buildInternal, buildProduction];
  const preflightSteps = preflight.split(/\n(?=\s{6}- name:)/);
  const preflightSourceCheckout = preflightSteps.find((step) => (
    step.includes('Checkout exact OTA source with ephemeral read-only auth')
  ));
  const preflightToolingCheckout = preflightSteps.find((step) => (
    step.includes('Checkout reviewed signed-target verifier only')
  ));
  const preflightOutputs = preflight.match(/\n    outputs:\n([\s\S]*?)\n\n    steps:/)?.[1];

  assert.match(
    mobileReleaseRunbook,
    /complete run has four explicit approvals:[\s\S]*resolve the internal EAS environment[\s\S]*publish internal[\s\S]*resolve the production EAS environment[\s\S]*publish production/
  );
  assert.match(
    mobileReleaseRunbook,
    /Before GitHub opens the first environment approval,[\s\S]*preflight[\s\S]*no Expo, environment, or publisher credential[\s\S]*ephemeral read-only[\s\S]*`persist-credentials: false`[\s\S]*does not pass the token to those commands[\s\S]*no Expo token job can start if[\s\S]*proof fails/
  );
  assert.match(
    mobileReleaseRunbook,
    /later approvals enforce the reviewed workflow's sequencing; they do not prevent[\s\S]*already obtained that token from targeting the production channel/
  );
  assert.match(
    agentGuide,
    /four separately[\s\S]*approved, source-free credential jobs:[\s\S]*resolve internal environment[\s\S]*publish production[\s\S]*not a channel-scoped capability boundary/
  );

  assert.match(workflow, /workflow_call:/);
  assert.doesNotMatch(workflow, /workflow_call:[\s\S]*secrets:/);
  assert.match(workflow, /source_ref:[\s\S]*required: true[\s\S]*type: string/);
  assert.match(workflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+source_ref:[\s\S]*required: true[\s\S]*type: string/);
  assert.equal(
    (workflow.match(/description: Exact signed published native-vMAJOR\.MINOR\.PATCH tag installed on the target channels/g) ?? []).length,
    2
  );
  assert.match(workflow, /message:\s*\n\s+description:[^\n]+\n\s+required: true/);
  assert.match(workflow, /group: expo-ota-master\s*\n\s+queue: max\s*\n\s+cancel-in-progress: false/);
  assert.match(preflight, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(
    preflight,
    /environment: expo-publication|EXPO_TOKEN|secrets\.|github\.token|GITHUB_TOKEN|\n\s+token:/
  );
  assert.match(preflight, /Require exact master source and native release tag inputs/);
  assert.match(preflight, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(preflight, /\^native-v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/);
  assert.ok(preflightSourceCheckout);
  assert.match(preflightSourceCheckout, /persist-credentials: false/);
  assert.match(preflightSourceCheckout, /ref: \$\{\{ inputs\.source_ref \}\}/);
  assert.ok(preflightToolingCheckout);
  assert.match(preflightToolingCheckout, /persist-credentials: false/);
  assert.match(preflightToolingCheckout, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.equal((preflight.match(/uses: actions\/checkout@[0-9a-f]{40}/g) ?? []).length, 2);
  assert.equal((preflight.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.match(preflight, /git --no-replace-objects fetch --no-tags --force origin[\s\S]*refs\/heads\/master:refs\/remotes\/origin\/master/);
  assert.match(preflight, /git --no-replace-objects merge-base --is-ancestor[\s\S]*OTA_SOURCE_REF[\s\S]*TRUST_SET_COMMIT/);
  assert.match(preflight, /TRUST_SET_COMMIT.*\.github\/native-release-tag-allowed-signers/);
  assert.match(preflight, /expo-ota-ci-preflight\.mjs[\s\S]*--native-build-ref "\$\{NATIVE_BUILD_REF\}"[\s\S]*--allowed-signers-file[\s\S]*--readiness-output/);
  assert.ok(preflightOutputs);
  assert.match(preflightOutputs, /source_commit:/);
  assert.match(preflightOutputs, /native_build_ref:/);
  assert.doesNotMatch(preflightOutputs, /native_build_commit|native_tag_object|trust_set_commit/);
  assert.match(preflight, /\[\[ "\$\{native_build_commit\}" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(preflight, /\[\[ "\$\{native_tag_object\}" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(preflight, /tag object \$\{native_tag_object\}; trust set \$\{TRUST_SET_COMMIT\}/);
  assert.match(otaPreflightSource, /ls-remote', '--tags', 'origin', tagRef, `\$\{tagRef\}\^\{\}`/);
  assert.match(otaPreflightSource, /verifyNativeTagAttestation/);
  assert.match(otaPreflightSource, /verifyNativeOtaReleaseTarget[\s\S]*merge-base', '--is-ancestor', publishedTag\.commit, sourceCommit/);
  assert.match(resolveInternal, /needs: preflight-release-target/);
  assert.match(buildInternal, /needs: \[preflight-release-target, resolve-internal-environment\]/);
  assert.match(publishInternal, /needs: \[preflight-release-target, build-internal-update\]/);
  assert.match(resolveProduction, /needs: \[preflight-release-target, publish-internal\]/);
  assert.match(buildProduction, /needs: \[preflight-release-target, resolve-production-environment\]/);
  assert.match(publishProduction, /needs: \[preflight-release-target, build-production-update\]/);
  const downstreamJobs = [
    resolveInternal,
    buildInternal,
    publishInternal,
    resolveProduction,
    buildProduction,
    publishProduction
  ];
  for (const job of downstreamJobs) {
    assert.match(job, /needs(?:\[[^\]]+\]|:)[^\n]*preflight-release-target|needs: preflight-release-target/);
    assert.doesNotMatch(job, /inputs\.(?:source_ref|native_build_ref)/);
    assert.match(job, /needs\.preflight-release-target\.outputs\.source_commit/);
  }
  for (const job of [resolveInternal, publishInternal]) {
    assert.match(job, /environment: expo-publication/);
    assert.match(job, /EXPO_UPDATES_CHANNEL: internal/);
  }
  for (const job of [resolveProduction, publishProduction]) {
    assert.match(job, /environment: expo-publication/);
    assert.match(job, /EXPO_UPDATES_CHANNEL: production/);
  }

  for (const job of credentialedJobs) {
    const steps = job.split(/\n(?=\s{6}- name:)/);
    assert.match(
      steps[1],
      /Require current protected workflow authority before Expo authentication[\s\S]*refs\/heads\/master[\s\S]*GIT_NO_REPLACE_OBJECTS[\s\S]*git\/ref\/heads\/master|Require current protected workflow authority before Expo authentication[\s\S]*refs\/heads\/master[\s\S]*refs\/heads\/master/
    );
    assert.match(steps[1], /WORKFLOW_SHA: \$\{\{ job\.workflow_sha \}\}/);
    assert.match(steps[1], /verify-current-release-workflow/);
    assert.match(steps[1], /--workflow-sha "\$\{WORKFLOW_SHA\}"/);
    assert.match(steps[1], /--release-commit "\$\{RELEASE_COMMIT\}"/);
    assert.match(steps[1], /git[^\n]*show[\s\S]*WORKFLOW_SHA.*release-config\.mjs/);
    assert.match(job, /Checkout reviewed OTA publisher tooling only/);
    assert.match(job, /ref: \$\{\{ job\.workflow_sha \}\}/);
    assert.match(job, /persist-credentials: false/);
    assert.match(job, /sparse-checkout:[\s\S]*expo-ota-artifact\.mjs[\s\S]*tools\/eas-cli/);
    assert.doesNotMatch(job, /ref: \$\{\{ inputs\.source_ref \}\}|expo-ota-ci-preflight|node_modules\/\.bin\/expo|Install source dependencies/);
    assert.ok(
      job.indexOf('Require current protected workflow authority before Expo authentication') <
        job.indexOf('Checkout reviewed OTA publisher tooling only') &&
        job.indexOf('Require current protected workflow authority before Expo authentication') <
          job.indexOf('secrets.EXPO_RELEASE_TOKEN'),
      'live workflow authority must be the first protected-job gate before checkout or Expo credentials'
    );
    assert.ok(
      job.indexOf('Install locked EAS CLI before Expo authentication') < job.indexOf('secrets.EXPO_'),
      'the complete locked CLI graph must install before the environment-scoped token appears'
    );
    const credentialSteps = steps.filter((step) => step.includes('secrets.EXPO_'));
    assert.equal(credentialSteps.length, 1);
    assert.match(credentialSteps[0], /EXPO_TOKEN: \$\{\{ secrets\.EXPO_RELEASE_TOKEN \}\}/);
    const recheckIndex = steps.findIndex((step) => (
      step.includes('Recheck current protected workflow authority immediately before Expo token')
    ));
    const credentialIndex = steps.findIndex((step) => step.includes('secrets.EXPO_RELEASE_TOKEN'));
    assert.ok(recheckIndex > 0);
    assert.equal(
      credentialIndex,
      recheckIndex + 1,
      'the final live authority recheck must be immediately adjacent to first Expo token use'
    );
    assert.match(steps[recheckIndex], /verify-current-release-workflow/);
  }
  for (const job of [resolveInternal, resolveProduction]) {
    assert.match(job, /prepare-environment-project/);
    assert.match(job, /node \.release-tooling\/scripts\/expo-ota-artifact\.mjs sanitize-environment/);
    assert.match(job, /node_modules\/\.bin\/eas" env:pull/);
    assert.doesNotMatch(job, /eas" update|--skip-bundler/);
  }
  for (const job of [publishInternal, publishProduction]) {
    assert.match(job, /prepare-publisher/);
    assert.match(job, /working-directory: \$\{\{ runner\.temp \}\}\/calibrate-expo-publisher/);
    assert.match(job, /node_modules\/\.bin\/eas" update/);
    assert.match(job, /--skip-bundler[\s\S]*--input-dir/);
    assert.match(job, /EAS_NO_VCS: '1'/);
    assert.match(job, /EXPO_NO_DOTENV: '1'/);
    assert.doesNotMatch(job, /env:pull|expo export|npm ci --include=dev --no-audit/);
  }

  for (const job of buildJobs) {
    assert.doesNotMatch(job, /environment: expo-publication|EXPO_TOKEN|secrets\./);
    assert.match(job, /Checkout exact source without persisted credentials[\s\S]*persist-credentials: false[\s\S]*ref: \$\{\{ needs\.preflight-release-target\.outputs\.source_commit \}\}/);
    assert.match(job, /Checkout reviewed compatibility and artifact tooling[\s\S]*persist-credentials: false[\s\S]*ref: \$\{\{ job\.workflow_sha \}\}/);
    assert.match(job, /Install source dependencies without publisher credentials[\s\S]*npm ci --include=dev --no-audit --fund=false/);
    assert.match(job, /\^\[0-9a-f\]\{40\}\$/);
    assert.match(job, /git --no-replace-objects merge-base --is-ancestor "\$\{OTA_SOURCE_REF\}" origin\/master/);
    assert.match(job, /expo-ota-ci-preflight\.mjs[\s\S]*--native-build-ref "\$\{NATIVE_BUILD_REF\}"/);
    assert.match(job, /node_modules\/\.bin\/expo" export[\s\S]*--platform android/);
    assert.match(job, /expo-ota-artifact\.mjs package-update/);
    assert.match(job, /actions\/upload-artifact@[0-9a-f]{40}/);
  }

  assert.equal((workflow.match(/secrets\.EXPO_RELEASE_TOKEN/g) ?? []).length, 4);
  assert.equal((workflow.match(/inputs\.source_ref/g) ?? []).length, 3);
  assert.equal((workflow.match(/inputs\.native_build_ref/g) ?? []).length, 2);
  assert.doesNotMatch(
    workflow,
    /secrets\.EXPO_(?:TOKEN|PREVIEW_TOKEN|PRODUCTION_TOKEN)\b/
  );
  for (const job of credentialedJobs) {
    assert.match(job, /EXPO_TOKEN: \$\{\{ secrets\.EXPO_RELEASE_TOKEN \}\}/);
  }
  assert.equal((workflow.match(/node_modules\/\.bin\/eas" env:pull/g) ?? []).length, 2);
  assert.equal((workflow.match(/node_modules\/\.bin\/eas" update/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /Setup EAS|expo\/expo-github-action|eas-version:|secrets: inherit/);
  assert.doesNotMatch(workflow, /\n\s+push:|github\.event\.(before|head_commit)|--previous-ref/);
  assert.match(releaseOta, /uses: \.\/\.github\/workflows\/expo-ota-update\.yml/);
  assert.doesNotMatch(releaseOta, /secrets: inherit|EXPO_TOKEN/);
});

test('native Android store releases build one paired candidate and promote it without rebuilding', () => {
  const workflow = readWorkflow('native-release.yml');
  const mobileReleaseRunbook = readFileSync(
    path.join(repositoryRoot, 'docs', 'mobile-release.md'),
    'utf8'
  );
  const validate = workflowJobBlock(workflow, 'validate-source');
  const build = workflowJobBlock(workflow, 'build-internal');
  const attester = workflowJobBlock(workflow, 'attest-play-receipt');
  const internal = workflowJobBlock(workflow, 'publish-internal');
  const recover = workflowJobBlock(workflow, 'recover-internal');
  const signing = workflowJobBlock(workflow, 'sign-native-release-tag');
  const tag = workflowJobBlock(workflow, 'tag-native-release');
  const closed = workflowJobBlock(workflow, 'promote-closed');
  const production = workflowJobBlock(workflow, 'promote-production');

  assert.match(
    mobileReleaseRunbook,
    /dedicated CI-only, unencrypted \(passphrase-less\) SSH signing key/
  );
  assert.match(mobileReleaseRunbook, /noninteractive job intentionally has no passphrase or agent input/);
  assert.match(
    mobileReleaseRunbook,
    /Every credential-bearing native job[\s\S]*job\.workflow_sha[\s\S]*GITHUB_SHA[\s\S]*GITHUB_REF/
  );
  assert.match(
    mobileReleaseRunbook,
    /remove all four unchanged secret names from the legacy `play-internal` environment and from repository or[\s\S]*organization scope/
  );
  assert.match(
    mobileReleaseRunbook,
    /delete the legacy `GOOGLE_PLAY_ACCESS_TOKEN` and[\s\S]*`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` secrets from both `play-internal` and `play-production` and from[\s\S]*repository or organization scope/
  );

  const checkoutSteps = workflow
    .split(/\n(?=\s{6}- name:)/)
    .filter((step) => step.includes('uses: actions/checkout@'));
  const credentialPersistingCheckouts = checkoutSteps.filter((step) =>
    step.includes('persist-credentials: true')
  );
  assert.equal(credentialPersistingCheckouts.length, 1);
  assert.match(
    credentialPersistingCheckouts[0],
    /token: \$\{\{ steps\.tag-token\.outputs\.token \}\}/,
    'only the isolated GitHub App tag publisher may persist checkout credentials'
  );
  for (const checkout of checkoutSteps.filter((step) => !step.includes('persist-credentials: true'))) {
    assert.match(checkout, /persist-credentials: false/);
  }

  const privilegedNativeJobs = [
    ['build-internal', build, 'Require native signing configuration'],
    ['publish-internal', internal, 'Require Google Play authentication'],
    ['recover-internal', recover, 'Require Google Play authentication'],
    ['sign-native-release-tag', signing, 'Create signed annotated native tag'],
    ['tag-native-release', tag, 'Mint restricted native tag token'],
    ['promote-closed', closed, 'Require Google Play authentication'],
    ['promote-production', production, 'Require Google Play authentication']
  ];
  assert.equal(
    (workflow.match(/- name: Require current protected master workflow authority/g) ?? []).length,
    privilegedNativeJobs.length,
    'every and only native credential-bearing jobs must repeat the current-master gate after admission'
  );
  assert.equal(
    (workflow.match(/- name: Recheck current protected master immediately before credentials/g) ?? []).length,
    privilegedNativeJobs.length,
    'every native credential-bearing job must recheck live master immediately before its first environment secret'
  );
  for (const [jobName, job, firstPrivilegedStep] of privilegedNativeJobs) {
    const namedSteps = job.split(/\n(?=\s{6}- name:)/);
    const authorityGate = namedSteps[1];
    assert.match(
      authorityGate,
      /Require current protected master workflow authority/,
      `${jobName} must make current-master authority its first step after environment admission`
    );
    assert.match(authorityGate, /READ_ONLY_GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(authorityGate, /WORKFLOW_SHA: \$\{\{ job\.workflow_sha \}\}/);
    assert.match(
      authorityGate,
      /\$\{GITHUB_API_URL\}\/repos\/\$\{GITHUB_REPOSITORY\}\/git\/ref\/heads\/master/
    );
    assert.match(authorityGate, /select\(\.ref == "refs\/heads\/master"\)/);
    assert.match(
      authorityGate,
      /if \[\[ "\$\{WORKFLOW_SHA\}" != "\$\{LIVE_MASTER_SHA\}" \]\]; then[\s\S]*workflow revision[\s\S]*is stale[\s\S]*Start a new run from current master\.[\s\S]*exit 1/
    );
    assert.doesNotMatch(
      authorityGate,
      /\bGITHUB_(?:SHA|REF)\b|\$\{\{\s*secrets\./,
      `${jobName} must use the live master ref and read-only built-in token, not rerun-stable trigger fields or privileged secrets`
    );
    assert.ok(
      job.indexOf('Require current protected master workflow authority') <
        job.indexOf(firstPrivilegedStep) &&
        job.indexOf('Require current protected master workflow authority') <
          job.indexOf('secrets.'),
      `${jobName} must reject a stale workflow before its first privileged step or environment secret reference`
    );
    const privilegedStepIndex = namedSteps.findIndex((step) => step.includes(firstPrivilegedStep));
    assert.ok(privilegedStepIndex > 1, `${jobName} must define its first privileged step`);
    const credentialAdjacentRecheck = namedSteps[privilegedStepIndex - 1];
    assert.match(
      credentialAdjacentRecheck,
      /Recheck current protected master immediately before credentials/,
      `${jobName} must put the second live-master check immediately before its first privileged step`
    );
    assert.match(
      credentialAdjacentRecheck,
      /READ_ONLY_GITHUB_TOKEN: \$\{\{ github\.token \}\}[\s\S]*WORKFLOW_SHA: \$\{\{ job\.workflow_sha \}\}/
    );
    assert.match(
      credentialAdjacentRecheck,
      /\$\{GITHUB_API_URL\}\/repos\/\$\{GITHUB_REPOSITORY\}\/git\/ref\/heads\/master/
    );
    assert.match(
      credentialAdjacentRecheck,
      /"\$\{WORKFLOW_SHA\}" != "\$\{LIVE_MASTER_SHA\}"/
    );
    assert.doesNotMatch(
      credentialAdjacentRecheck,
      /\bGITHUB_(?:SHA|REF)\b|\$\{\{\s*secrets\./,
      `${jobName} final authority recheck must remain read-only and independent of rerun-stable trigger fields`
    );
    assert.equal(
      namedSteps[privilegedStepIndex].includes('secrets.'),
      true,
      `${jobName} privileged marker must identify the first environment-secret step`
    );
  }

  assert.match(workflow, /^name: Native Android Store Release/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*source_commit:[\s\S]*required: true[\s\S]*type: string/);
  assert.match(
    workflow,
    /operation:[\s\S]*type: choice[\s\S]*options:\s*\n\s+- upload-internal\s*\n\s+- recover-internal\s*\n\s+- promote-closed\s*\n\s+- promote-production/
  );
  assert.match(
    workflow,
    /confirm_play_console_clean:[\s\S]*required: true[\s\S]*default: false[\s\S]*type: boolean/
  );
  assert.doesNotMatch(workflow, /\n\s+pull_request:|\n\s+push:|\n\s+schedule:/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /ANDROID_BUILD_TOOLS_VERSION: '36\.0\.0'/);
  assert.match(workflow, /BUNDLETOOL_VERSION: '1\.18\.3'/);
  assert.match(workflow, /BUNDLETOOL_SHA256: a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29/);
  assert.match(workflow, /group: native-android-store-release/);
  assert.match(workflow, /queue: max/);
  assert.match(workflow, /cancel-in-progress: false/);

  const reviewedActionPins = new Map([
    ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
    ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
    ['actions/setup-java', 'cf277c60eb25467037889841efdb72551f06f6c3'],
    ['android-actions/setup-android', '9fc6c4e9069bf8d3d10b2204b1fb8f6ef7065407'],
    ['actions/upload-artifact', 'ea165f8d65b6e75b540449e92b4886f43607fa02'],
    ['actions/download-artifact', 'd3f86a106a0bac45b974a628896c90dbdf5c8093'],
    ['actions/attest', '508db95dd578ae2727ebd6217d5ba78e4fbda05d'],
    ['actions/create-github-app-token', 'fee1f7d63c2ff003460e3d139729b119787bc349']
  ]);
  const actionUses = [...workflow.matchAll(/^\s*uses:\s+([^@\s]+)@([^\s#]+)/gm)];
  assert.equal(actionUses.length, (workflow.match(/^\s*uses:/gm) ?? []).length);
  for (const [, action, revision] of actionUses) {
    assert.match(revision, /^[0-9a-f]{40}$/, `${action} must use a full commit SHA`);
    assert.equal(revision, reviewedActionPins.get(action), `${action} must use its reviewed commit`);
  }
  assert.deepEqual(new Set(actionUses.map(([, action]) => action)), new Set(reviewedActionPins.keys()));

  assert.match(validate, /refs\/heads\/master/);
  assert.match(validate, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(validate, /ref: \$\{\{ inputs\.source_commit \}\}/);
  assert.match(validate, /test "\$\(git rev-parse HEAD\)" = "\$\{SOURCE_COMMIT\}"/);
  assert.match(validate, /git merge-base --is-ancestor "\$\{SOURCE_COMMIT\}" origin\/master/);
  assert.match(validate, /EXPECTED_TAG="native-v\$\{PHONE_VERSION\}"/);
  assert.match(validate, /already points at another commit/);
  assert.match(validate, /CONFIRM_PLAY_CONSOLE_CLEAN: \$\{\{ inputs\.confirm_play_console_clean \}\}/);
  assert.match(validate, /Confirm Play Publishing overview is clear/);
  assert.match(validate, /native-tag-protection\.mjs verify/);
  assert.match(validate, /--repository "\$\{GITHUB_REPOSITORY\}"/);
  assert.match(validate, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(validate, /path: \.release-tooling/);
  assert.match(validate, /ref: master[\s\S]*path: \.release-trust/);
  assert.match(validate, /Native tag trust set:.*TRUST_SET_COMMIT/);
  assert.match(validate, /native-tag-attestation\.mjs verify/);
  assert.match(validate, /--allowed-signers-file \.release-trust\/\.github\/native-release-tag-allowed-signers/);
  assert.match(
    validate,
    /Validate upload dependency and release policy[\s\S]*if: inputs\.operation == 'upload-internal'[\s\S]*npm run release:check/
  );
  assert.match(
    validate,
    /Validate immutable recovery or promotion configuration[\s\S]*if: inputs\.operation != 'upload-internal'[\s\S]*node \.release-tooling\/scripts\/release-config\.mjs check[\s\S]*--repository-root/
  );
  const delayedTransitionValidation = validate.match(
    /\n      - name: Validate immutable recovery or promotion configuration\n[\s\S]*?(?=\n      - name:)/
  )?.[0];
  assert.ok(delayedTransitionValidation);
  assert.doesNotMatch(
    delayedTransitionValidation,
    /release:check|dependency-advisory-exceptions|npm run/,
    'recovery and promotion must not become blocked by a later advisory-exception expiry'
  );
  assert.match(
    validate,
    /node \.release-tooling\/scripts\/native-play-release\.mjs plan[\s\S]*--repository-root[\s\S]*--source-commit/
  );
  assert.doesNotMatch(validate, /node scripts\/native-play-release\.mjs plan/);

  assert.match(build, /needs: validate-source/);
  assert.match(build, /if: inputs\.operation == 'upload-internal'/);
  assert.match(build, /environment: native-release-signing/);
  assert.match(build, /contents: read/);
  assert.match(build, /ref: \$\{\{ inputs\.source_commit \}\}/);
  assert.match(build, /CALIBRATE_ANDROID_UPLOAD_KEYSTORE_BASE64/);
  assert.match(build, /CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD/);
  assert.match(build, /CALIBRATE_ANDROID_SIGNING_KEY_ALIAS/);
  assert.match(build, /CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD/);
  assert.doesNotMatch(build, /GOOGLE_PLAY_/);
  assert.doesNotMatch(build, /environment: play-internal/);
  assert.match(build, /EXPO_UPDATES_CHANNEL: production/);
  assert.match(build, /sdkmanager "build-tools;\$\{ANDROID_BUILD_TOOLS_VERSION\}" platform-tools/);
  assert.match(build, /google\/bundletool\/releases\/download\/\$\{BUNDLETOOL_VERSION\}/);
  assert.match(build, /sha256sum --check/);
  assert.match(build, /BUNDLETOOL_JAR=\$\{BUNDLETOOL_JAR\}/);
  assert.match(build, /npm ci --no-audit --fund=false/);
  assert.match(build, /Setup Java[\s\S]*cache: gradle/);
  assert.match(build, /node scripts\/native-release-build\.mjs prepare/);
  assert.match(build, /node scripts\/native-release-build\.mjs build-prepared/);
  assert.doesNotMatch(
    build,
    /(?:\.\/)?gradlew/,
    'the workflow must not bypass the release script wrapper integrity and cache-eviction gate'
  );
  assert.ok(
    build.indexOf('Setup Java') < build.indexOf('node scripts/native-release-build.mjs prepare'),
    'the dependency cache may be restored only before the release script removes the pinned distribution cache'
  );
  assert.match(build, /native-play-release\.mjs verify-artifacts[\s\S]*--source-commit/);
  const buildAuthorityGate = build.split(/\n(?=\s{6}- name:)/)[1];
  assert.match(
    buildAuthorityGate,
    /if \[\[ ! "\$\{SOURCE_COMMIT\}" =~ \^\[0-9a-f\]\{40\}\$ \|\| "\$\{SOURCE_COMMIT\}" != "\$\{LIVE_MASTER_SHA\}" \]\]; then[\s\S]*upload-internal may build only the current protected master commit[\s\S]*exit 1/
  );
  assert.doesNotMatch(
    buildAuthorityGate,
    /merge-base|is-ancestor/,
    'an historical master ancestor must not reach source checkout or Android signing during upload-internal'
  );
  const buildNamedSteps = build.split(/\n(?=\s{6}- name:)/);
  const buildSigningSecretIndex = buildNamedSteps.findIndex((step) =>
    step.includes('Require native signing configuration')
  );
  const credentialFreePrepare = buildNamedSteps.find((step) =>
    step.includes('Generate and verify credential-free native Gradle state')
  );
  assert.ok(credentialFreePrepare);
  assert.match(credentialFreePrepare, /test ! -e "\$\{RUNNER_TEMP\}\/calibrate-android-upload\.keystore"/);
  assert.match(credentialFreePrepare, /native-release-build\.mjs prepare/);
  assert.doesNotMatch(
    credentialFreePrepare,
    /secrets\.|CALIBRATE_ANDROID_/,
    'clean prebuild and reviewed Gradle-state verification must run before signing authority is referenced'
  );
  assert.match(
    buildNamedSteps[buildSigningSecretIndex - 1],
    /"\$\{WORKFLOW_SHA\}" != "\$\{LIVE_MASTER_SHA\}" \|\| "\$\{SOURCE_COMMIT\}" != "\$\{LIVE_MASTER_SHA\}"/
  );
  assert.ok(
    build.indexOf('Require current protected master workflow authority') <
      build.indexOf('Checkout exact reviewed source') &&
      build.indexOf('Require current protected master workflow authority') <
        build.indexOf('Require native signing configuration') &&
      build.indexOf('Require current protected master workflow authority') <
        build.indexOf('node scripts/native-release-build.mjs prepare'),
    'current workflow and exact current-master source must be proven before checkout, signing secrets, or build execution'
  );
  assert.ok(
    build.indexOf('npm ci --no-audit') <
      build.indexOf('Generate and verify credential-free native Gradle state') &&
      build.indexOf('Generate and verify credential-free native Gradle state') <
        build.indexOf('Recheck current protected master immediately before credentials') &&
      build.indexOf('Recheck current protected master immediately before credentials') <
        build.indexOf('Require native signing configuration') &&
      build.indexOf('Require native signing configuration') <
        build.indexOf('Materialize shared Android upload signing') &&
      build.indexOf('Materialize shared Android upload signing') <
        build.indexOf('node scripts/native-release-build.mjs build-prepared'),
    'clean state must be generated and verified before the credential-adjacent recheck and prepared-only signed build'
  );
  assert.match(build, /Remove signing material before artifact verification[\s\S]*if: always\(\)/);
  const signingCleanup = build.match(
    /\n      - name: Remove signing material before artifact verification\n[\s\S]*?(?=\n      - name:)/
  )?.[0];
  assert.ok(signingCleanup);
  assert.match(signingCleanup, /rm -f "\$\{RUNNER_TEMP\}\/calibrate-android-upload\.keystore"/);
  assert.doesNotMatch(signingCleanup, /CALIBRATE_ANDROID_SIGNING_STORE_FILE:-/);
  assert.ok(
    build.indexOf('node scripts/native-release-build.mjs build-prepared') <
      build.indexOf('Remove signing material before artifact verification') &&
      build.indexOf('Remove signing material before artifact verification') <
        build.indexOf('native-play-release.mjs verify-artifacts'),
    'signing values must be removed before artifact verification tooling runs'
  );
  assert.match(build, /uses: actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(build, /name: native-play-release-\$\{\{ inputs\.source_commit \}\}/);
  assert.match(build, /overwrite: true/);
  assert.doesNotMatch(workflow, /github\.run_attempt/);
  for (const artifactPath of [
    'mobile/android/app/build/outputs/apk/release/app-release.apk',
    'mobile/android/app/build/outputs/bundle/release/app-release.aab',
    'wear/app/build/outputs/apk/release/app-release.apk',
    'wear/app/build/outputs/bundle/release/app-release.aab',
    'build/native-release-provenance.json'
  ]) {
    assert.ok(build.includes(artifactPath), `paired native artifact must retain ${artifactPath}`);
  }
  assert.match(build, /retention-days: 3/);
  assert.equal(
    (workflow.match(/node scripts\/native-release-build\.mjs build-prepared/g) ?? []).length,
    1,
    'the signed paired candidate must be built exactly once'
  );
  assert.equal(
    (workflow.match(/node scripts\/native-release-build\.mjs prepare/g) ?? []).length,
    1,
    'the credential-free phone project must be prepared exactly once'
  );
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(
    packageConfig.scripts['prepare:native:release'],
    'node scripts/native-release-build.mjs prepare'
  );
  assert.equal(
    packageConfig.scripts['build:native:release'],
    'node scripts/native-release-build.mjs build-prepared'
  );
  assert.match(packageConfig.scripts['test:native-release'], /native-play-receipt\.test\.mjs/);

  assert.match(attester, /needs: \[validate-source, build-internal\]/);
  assert.match(attester, /if: inputs\.operation == 'upload-internal'/);
  assert.match(
    attester,
    /permissions:\s*\n\s+actions: read\s*\n\s+attestations: write\s*\n\s+contents: read\s*\n\s+id-token: write/
  );
  assert.doesNotMatch(
    attester,
    /environment:|secrets\.|GOOGLE_PLAY_|CALIBRATE_ANDROID_SIGNING|NATIVE_RELEASE_TAG_SIGNING|create-github-app-token|actions\/checkout/
  );
  const attesterSteps = attester.split(/\n(?=\s{6}- name:)/);
  assert.match(attesterSteps[1], /Require current protected workflow authority before receipt construction/);
  assert.match(attester, /contents\/scripts\/native-play-receipt\.mjs\?ref=\$\{WORKFLOW_SHA\}/);
  assert.match(attester, /Download exact paired native release/);
  assert.match(attester, /\$\{PHONE_AAB_SHA256\}  \$\{PHONE_AAB\}" \| sha256sum --check/);
  assert.match(attester, /node "\$\{NATIVE_PLAY_RECEIPT_TOOL\}" create/);
  assert.match(attester, /node "\$\{NATIVE_PLAY_RECEIPT_TOOL\}" verify-files/);
  assert.match(attester, /receipt_sha256=\$\{RECEIPT_SHA256\}/);
  assert.match(
    attesterSteps.at(-2),
    /Recheck current protected workflow authority immediately before attestation[\s\S]*"\$\{SOURCE_COMMIT\}" != "\$\{WORKFLOW_SHA\}" \|\| "\$\{WORKFLOW_SHA\}" != "\$\{LIVE_MASTER_SHA\}"/
  );
  assert.match(attesterSteps.at(-1), /actions\/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4\.2\.1/);
  assert.match(attesterSteps.at(-1), /subject-path: \$\{\{ runner\.temp \}\}\/native-play-receipt\.json/);
  assert.match(attesterSteps.at(-1), /push-to-registry: false[\s\S]*create-storage-record: false/);
  assert.equal((workflow.match(/attestations: write/g) ?? []).length, 1);
  assert.equal((workflow.match(/id-token: write/g) ?? []).length, 1);

  assert.match(internal, /needs: \[validate-source, build-internal, attest-play-receipt\]/);
  assert.match(internal, /if: inputs\.operation == 'upload-internal'/);
  assert.match(internal, /environment: play-internal/);
  assert.match(internal, /actions: read[\s\S]*attestations: read[\s\S]*contents: read/);
  assert.match(internal, /persist-credentials: false/);
  assert.match(internal, /uses: actions\/download-artifact@[0-9a-f]{40}/);
  assert.match(internal, /name: native-play-release-\$\{\{ inputs\.source_commit \}\}/);
  assert.match(internal, /Setup Java for artifact inspection[\s\S]*java-version: 17/);
  assert.match(internal, /Setup Android SDK for artifact inspection/);
  assert.match(internal, /sdkmanager[\s\S]*build-tools;\$\{ANDROID_BUILD_TOOLS_VERSION\}/);
  assert.match(internal, /google\/bundletool\/releases\/download\/\$\{BUNDLETOOL_VERSION\}/);
  assert.match(internal, /sha256sum --check/);
  assert.match(internal, /BUNDLETOOL_JAR=\$\{BUNDLETOOL_JAR\}/);
  assert.match(internal, /secrets\.GOOGLE_PLAY_TEST_ACCESS_TOKEN/);
  assert.match(internal, /secrets\.GOOGLE_PLAY_TEST_SERVICE_ACCOUNT_JSON_BASE64/);
  assert.doesNotMatch(internal, /GOOGLE_PLAY_PRODUCTION_/);
  assert.doesNotMatch(internal, /CALIBRATE_ANDROID_SIGNING|native-release-signing/);
  assert.ok(
    internal.indexOf('Download exact paired native release') <
      internal.indexOf('Reconstruct and reverify exact downloaded receipt') &&
      internal.indexOf('Reconstruct and reverify exact downloaded receipt') <
        internal.indexOf('Verify exact native Play receipt attestation before authentication') &&
      internal.indexOf('Verify exact native Play receipt attestation before authentication') <
        internal.indexOf('Require Google Play authentication') &&
      internal.indexOf('Require Google Play authentication') <
        internal.indexOf('native-play-release.mjs upload-internal'),
    'downloaded artifacts must be reverified before Play credentials are materialized'
  );
  assert.doesNotMatch(
    internal.slice(0, internal.indexOf('Require Google Play authentication')),
    /secrets\.GOOGLE_PLAY_/
  );
  assert.ok(
    internal.indexOf('if [[ -n "${SERVICE_ACCOUNT_JSON_BASE64}" ]]') <
      internal.indexOf('if [[ -n "${ACCESS_TOKEN}" ]]'),
    'durable testing service-account credentials must override a stale token'
  );
  assert.match(internal, /native-play-release\.mjs upload-internal/);
  assert.match(internal, /native-play-release\.mjs create-receipt/);
  assert.match(internal, /ATTESTED_RECEIPT_SHA256: \$\{\{ needs\.attest-play-receipt\.outputs\.receipt_sha256 \}\}/);
  assert.match(internal, /gh_2\.97\.0_linux_amd64\.tar\.gz/);
  assert.match(internal, /a2c9b8497e1f85b1ad0dfcb78b5a622e098801b8e461e459e88e1ee12f018112/);
  assert.match(
    internal,
    /attestation verify "\$\{RECEIPT_FILE\}"[\s\S]*--signer-workflow "\$\{GITHUB_REPOSITORY\}\/\.github\/workflows\/native-release\.yml"[\s\S]*--signer-digest "\$\{SOURCE_COMMIT\}"[\s\S]*--source-digest "\$\{SOURCE_COMMIT\}"[\s\S]*--limit 100[\s\S]*--deny-self-hosted-runners[\s\S]*--format json/
  );
  assert.match(internal, /native-play-receipt\.mjs discover-workflows/);
  assert.match(internal, /native-play-attestation-trusted-workflow-shas/);
  assert.match(internal, /--repository "\$\{GITHUB_REPOSITORY\}"[\s\S]*--receipt-file build\/native-play-receipt\.json/);
  assert.match(internal, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(internal, /path: \.release-tooling/);
  assert.match(internal, /node \.release-tooling\/scripts\/native-play-release\.mjs upload-internal/);
  assert.match(internal, /--repository-root "\$\{GITHUB_WORKSPACE\}"/);
  assert.doesNotMatch(
    internal.slice(internal.indexOf('Require Google Play authentication')),
    /node scripts\/native-play-release\.mjs/
  );
  assert.match(internal, /Remove Google Play credentials/);
  assert.match(
    internal,
    /Remove Google Play credentials[\s\S]*if: always\(\)[\s\S]*rm -f "\$\{GOOGLE_PLAY_SERVICE_ACCOUNT_FILE:-\}" "\$\{RUNNER_TEMP\}\/google-play-service-account\.json"/
  );
  assert.doesNotMatch(internal, /contents: write|git tag|git push/);

  assert.match(recover, /needs: validate-source/);
  assert.match(recover, /if: inputs\.operation == 'recover-internal'/);
  assert.match(recover, /environment: play-internal/);
  assert.match(recover, /permissions:\s*\n\s+attestations: read\s*\n\s+contents: read/);
  assert.match(recover, /secrets\.GOOGLE_PLAY_TEST_ACCESS_TOKEN/);
  assert.match(recover, /secrets\.GOOGLE_PLAY_TEST_SERVICE_ACCOUNT_JSON_BASE64/);
  assert.doesNotMatch(recover, /GOOGLE_PLAY_PRODUCTION_|CALIBRATE_ANDROID_SIGNING/);
  assert.doesNotMatch(recover, /native-release-signing/);
  assert.ok(
    recover.indexOf('if [[ -n "${SERVICE_ACCOUNT_JSON_BASE64}" ]]') <
      recover.indexOf('if [[ -n "${ACCESS_TOKEN}" ]]'),
    'durable testing service-account credentials must override a stale recovery token'
  );
  assert.match(recover, /native-play-release\.mjs recover-internal/);
  assert.match(recover, /node \.release-tooling\/scripts\/native-play-release\.mjs recover-internal/);
  assert.match(recover, /--repository-root "\$\{GITHUB_WORKSPACE\}"/);
  assert.match(recover, /--repository "\$\{GITHUB_REPOSITORY\}"/);
  assert.match(recover, /--receipt-file "\$\{RUNNER_TEMP\}\/native-play-recovery-receipt\.json"/);
  assert.doesNotMatch(
    recover.slice(recover.indexOf('Require Google Play authentication')),
    /node scripts\/native-play-release\.mjs/
  );
  assert.match(recover, /Remove Google Play credentials[\s\S]*if: always\(\)/);
  assert.match(
    recover,
    /Remove Google Play credentials[\s\S]*rm -f "\$\{GOOGLE_PLAY_SERVICE_ACCOUNT_FILE:-\}" "\$\{RUNNER_TEMP\}\/google-play-service-account\.json"/
  );
  assert.ok(
    recover.indexOf('native-play-release.mjs recover-internal') <
      recover.indexOf('Remove Google Play credentials') &&
      recover.indexOf('Remove Google Play credentials') <
        recover.indexOf('Install checksum-verified GitHub CLI after Play credential cleanup') &&
      recover.indexOf('Install checksum-verified GitHub CLI after Play credential cleanup') <
        recover.indexOf('Resolve fresh protected master and current receipt revocations') &&
      recover.indexOf('Resolve fresh protected master and current receipt revocations') <
        recover.indexOf('Verify exact native Play receipt attestation after Play cleanup'),
    'recovery must query Play, scrub authentication, resolve current trust, then verify the original receipt'
  );
  assert.match(recover, /test -z "\$\{GOOGLE_PLAY_ACCESS_TOKEN:-\}"/);
  assert.match(recover, /test ! -e "\$\{RUNNER_TEMP\}\/google-play-service-account\.json"/);
  assert.match(recover, /gh_2\.97\.0_linux_amd64\.tar\.gz/);
  assert.match(recover, /a2c9b8497e1f85b1ad0dfcb78b5a622e098801b8e461e459e88e1ee12f018112/);
  assert.match(recover, /refs\/remotes\/origin\/master\^\{commit\}/);
  assert.match(recover, /native-play-attestation-trusted-workflow-shas/);
  assert.match(
    recover,
    /native-play-receipt\.mjs authorize-workflow[\s\S]*--candidate-workflow-revision "\$\{SOURCE_COMMIT\}"[\s\S]*--current-workflow-revision "\$\{WORKFLOW_SHA\}"[\s\S]*--trusted-master-commit "\$\{TRUSTED_MASTER\}"[\s\S]*--source-commit "\$\{SOURCE_COMMIT\}"/
  );
  assert.match(
    recover,
    /attestation verify "\$\{RECEIPT_FILE\}"[\s\S]*--signer-workflow "\$\{GITHUB_REPOSITORY\}\/\.github\/workflows\/native-release\.yml"[\s\S]*--signer-digest "\$\{SOURCE_COMMIT\}"[\s\S]*--source-digest "\$\{SOURCE_COMMIT\}"[\s\S]*--source-ref refs\/heads\/master[\s\S]*--limit 100[\s\S]*--deny-self-hosted-runners[\s\S]*--format json/
  );
  assert.match(recover, /native-play-receipt\.mjs discover-workflows/);
  assert.doesNotMatch(
    recover,
    /build:native:release|verify-artifacts|upload-internal|upload-artifact|download-artifact/
  );

  assert.match(signing, /needs: \[validate-source, publish-internal, recover-internal\]/);
  assert.match(signing, /always\(\)/);
  assert.match(signing, /inputs\.operation == 'upload-internal'/);
  assert.match(signing, /inputs\.operation == 'recover-internal'/);
  assert.ok(
    recover.indexOf('Verify exact native Play receipt attestation after Play cleanup') < recover.length &&
      workflow.indexOf('Verify exact native Play receipt attestation after Play cleanup') <
        workflow.indexOf('sign-native-release-tag:'),
    'recovery receipt verification must complete before the isolated tag signer can run'
  );
  assert.match(signing, /environment: native-release-attestation/);
  assert.match(signing, /permissions:\s*\n\s+contents: read/);
  assert.match(signing, /secrets\.NATIVE_RELEASE_TAG_SIGNING_PRIVATE_KEY_BASE64/);
  assert.match(signing, /tag --sign --annotate "\$\{NATIVE_TAG\}" "\$\{SOURCE_COMMIT\}"/);
  assert.match(signing, /cleanup_signing_key[\s\S]*native-tag-attestation\.mjs verify/);
  assert.match(signing, /tag_object_base64=/);
  assert.match(signing, /ref: master[\s\S]*path: \.release-trust/);
  assert.match(signing, /--allowed-signers-file \.release-trust\/\.github\/native-release-tag-allowed-signers/);
  assert.doesNotMatch(
    signing,
    /NATIVE_RELEASE_TAG_APP_|create-github-app-token|GOOGLE_PLAY_|CALIBRATE_ANDROID_SIGNING/
  );

  assert.match(tag, /needs: \[validate-source, sign-native-release-tag\]/);
  assert.match(tag, /environment: native-release-tags/);
  assert.match(tag, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(tag, /permissions:\s*\n\s+contents: write/);
  assert.match(tag, /actions\/create-github-app-token@[0-9a-f]{40}/);
  assert.match(tag, /app-id: \$\{\{ vars\.NATIVE_RELEASE_TAG_APP_ID \}\}/);
  assert.match(tag, /private-key: \$\{\{ secrets\.NATIVE_RELEASE_TAG_APP_PRIVATE_KEY \}\}/);
  assert.match(tag, /permission-contents: write/);
  assert.match(tag, /token: \$\{\{ steps\.tag-token\.outputs\.token \}\}/);
  assert.doesNotMatch(
    tag,
    /environment: play-|GOOGLE_PLAY_|CALIBRATE_ANDROID_SIGNING|NATIVE_RELEASE_TAG_SIGNING_PRIVATE_KEY|native-play-release\.mjs/
  );
  assert.match(tag, /ref: \$\{\{ inputs\.source_commit \}\}/);
  assert.match(tag, /test "\$\(git rev-parse HEAD\)" = "\$\{SOURCE_COMMIT\}"/);
  assert.match(tag, /git hash-object -t tag -w/);
  assert.match(tag, /native-tag-attestation\.mjs verify/);
  assert.match(tag, /git push origin "refs\/tags\/\$\{NATIVE_TAG\}:refs\/tags\/\$\{NATIVE_TAG\}"/);
  assert.match(tag, /ref: master[\s\S]*path: \.release-trust/);
  assert.ok(
    workflow.indexOf('native-play-release.mjs upload-internal') < workflow.indexOf('tag-native-release:'),
    'the isolated tag job must run only after Play accepted the internal upload'
  );

  assert.match(closed, /needs: validate-source/);
  assert.match(closed, /if: inputs\.operation == 'promote-closed'/);
  assert.match(closed, /environment: play-internal/);
  assert.match(closed, /contents: read/);
  assert.match(closed, /refs\/tags\/\$\{NATIVE_TAG\}/);
  assert.match(closed, /secrets\.GOOGLE_PLAY_TEST_ACCESS_TOKEN/);
  assert.match(closed, /secrets\.GOOGLE_PLAY_TEST_SERVICE_ACCOUNT_JSON_BASE64/);
  assert.doesNotMatch(closed, /GOOGLE_PLAY_PRODUCTION_/);
  assert.doesNotMatch(closed, /native-release-signing/);
  assert.match(closed, /native-play-release\.mjs promote-closed/);
  assert.match(closed, /node \.release-tooling\/scripts\/native-play-release\.mjs promote-closed/);
  assert.match(closed, /--repository-root "\$\{GITHUB_WORKSPACE\}"/);
  assert.match(closed, /native-tag-attestation\.mjs verify/);
  assert.ok(
    closed.indexOf('native-tag-attestation.mjs verify') <
      closed.indexOf('Require Google Play authentication'),
    'closed promotion must verify the signed tag before Play credentials are materialized'
  );
  assert.match(closed, /Remove Google Play credentials/);
  assert.match(
    closed,
    /Remove Google Play credentials[\s\S]*if: always\(\)[\s\S]*rm -f "\$\{GOOGLE_PLAY_SERVICE_ACCOUNT_FILE:-\}" "\$\{RUNNER_TEMP\}\/google-play-service-account\.json"/
  );
  assert.ok(
    closed.indexOf('if [[ -n "${SERVICE_ACCOUNT_JSON_BASE64}" ]]') <
      closed.indexOf('if [[ -n "${ACCESS_TOKEN}" ]]'),
    'durable testing service-account credentials must override a stale token for closed promotion'
  );
  assert.doesNotMatch(
    closed,
    /build:native:release|verify-artifacts|upload-internal|upload-artifact|download-artifact|CALIBRATE_ANDROID_SIGNING/
  );

  assert.match(production, /needs: validate-source/);
  assert.match(production, /if: inputs\.operation == 'promote-production'/);
  assert.match(production, /environment: play-production/);
  assert.match(production, /contents: read/);
  assert.match(production, /refs\/tags\/\$\{NATIVE_TAG\}/);
  assert.match(production, /secrets\.GOOGLE_PLAY_PRODUCTION_ACCESS_TOKEN/);
  assert.match(production, /secrets\.GOOGLE_PLAY_PRODUCTION_SERVICE_ACCOUNT_JSON_BASE64/);
  assert.doesNotMatch(production, /GOOGLE_PLAY_TEST_/);
  assert.doesNotMatch(production, /CALIBRATE_ANDROID_SIGNING|native-release-signing/);
  assert.match(production, /native-play-release\.mjs promote-production/);
  assert.match(production, /node \.release-tooling\/scripts\/native-play-release\.mjs promote-production/);
  assert.match(production, /--repository-root "\$\{GITHUB_WORKSPACE\}"/);
  assert.match(production, /native-tag-attestation\.mjs verify/);
  assert.ok(
    production.indexOf('native-tag-attestation.mjs verify') <
      production.indexOf('Require Google Play authentication'),
    'production promotion must verify the signed tag before Play credentials are materialized'
  );
  assert.match(production, /Remove Google Play credentials/);
  assert.match(
    production,
    /Remove Google Play credentials[\s\S]*if: always\(\)[\s\S]*rm -f "\$\{GOOGLE_PLAY_SERVICE_ACCOUNT_FILE:-\}" "\$\{RUNNER_TEMP\}\/google-play-service-account\.json"/
  );
  assert.ok(
    production.indexOf('if [[ -n "${SERVICE_ACCOUNT_JSON_BASE64}" ]]') <
      production.indexOf('if [[ -n "${ACCESS_TOKEN}" ]]'),
    'durable production service-account credentials must override a stale token'
  );
  assert.doesNotMatch(
    production,
    /build:native:release|verify-artifacts|upload-internal|upload-artifact|download-artifact|CALIBRATE_ANDROID_SIGNING/
  );
});

test('pull request test suites run only for their affected surfaces', () => {
  const workflow = readWorkflow('tests.yml');
  const lintWorkflow = readWorkflow('lint.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const changes = workflowJobBlock(workflow, 'changes');
  const backendPaths = workflowPathFilterBlock(changes, 'backend');
  const mobilePaths = workflowPathFilterBlock(changes, 'mobile');
  const backend = workflowJobBlock(workflow, 'backend-tests');
  const mobile = workflowJobBlock(workflow, 'mobile-tests');

  assertPathFilterOutputs(changes, ['backend', 'mobile'], 'decision');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(changes, /if: github\.event_name == 'pull_request'/);
  assert.match(changes, /github\.event_name != 'pull_request'/);
  assert.match(backendPaths, /- '\.github\/workflows\/tests\.yml'/);
  assert.match(mobilePaths, /- '\.github\/workflows\/tests\.yml'/);
  assert.match(backendPaths, /- 'backend\/\*\*'/);
  assert.match(backendPaths, /- 'docs\/openapi\/v1\.yaml'/);
  assert.match(backendPaths, /- 'docs\/weight-trend-v2-tuning-report\.json'/);
  assert.match(backendPaths, /- 'shared\/\*\*'/);
  assert.match(mobilePaths, /- 'backend\/package-lock\.json'/);
  assert.match(mobilePaths, /- 'backend\/package\.json'/);
  assert.match(mobilePaths, /- 'docs\/openapi\/v1\.yaml'/);
  assert.match(mobilePaths, /- 'mobile\/\*\*'/);
  assert.match(mobilePaths, /- 'packages\/api-client\/\*\*'/);
  assert.match(mobilePaths, /- 'package\.json'/);
  assert.equal(
    packageConfig.scripts['api:generate'],
    'node backend/node_modules/openapi-typescript/bin/cli.js docs/openapi/v1.yaml -o packages/api-client/src/generated/v1.ts'
  );
  assert.equal(
    packageConfig.scripts['api:contract:check'],
    'npm run api:generate && git diff --exit-code -- packages/api-client/src/generated/v1.ts'
  );
  assert.match(backend, /needs: changes/);
  assert.match(backend, /if: needs\.changes\.outputs\.backend == 'true'/);
  assert.match(mobile, /needs: changes/);
  assert.match(mobile, /if: needs\.changes\.outputs\.mobile == 'true'/);
  assert.match(mobile, /npm run test:api-client/);
  assert.match(mobile, /npm --prefix mobile test/);
  for (const expectedPath of [
    '.github/workflows/lint.yml',
    'backend/**',
    'knip.json',
    'mobile/**',
    'package.json',
    'package-lock.json',
    'packages/**',
    'scripts/**',
    'shared/**'
  ]) {
    assert.ok(lintWorkflow.includes(`- '${expectedPath}'`), `lint paths must include ${expectedPath}`);
  }
  assert.doesNotMatch(lintWorkflow, /- 'docs\/\*\*'|- 'quality\/\*\*'/);

  const filters = ['backend', 'mobile'];
  for (const [candidatePath, expectedFilters] of [
    ['.github/workflows/tests.yml', ['backend', 'mobile']],
    ['backend/src/routes/user.ts', ['backend']],
    ['backend/package.json', ['backend', 'mobile']],
    ['backend/package-lock.json', ['backend', 'mobile']],
    ['shared/caloriePolicy.ts', ['backend', 'mobile']],
    ['mobile/src/components/AppCard.tsx', ['mobile']],
    ['docs/openapi/v1.yaml', ['backend', 'mobile']],
    ['docs/weight-trend-v2-tuning-report.json', ['backend']],
    ['package.json', ['mobile']],
    ['docs/review-notes.md', []]
  ]) {
    const actualFilters = filters.filter((filterName) => pathFilterMatches(changes, filterName, candidatePath));
    assert.deepEqual(actualFilters, expectedFilters, candidatePath);
  }
});

test('database upgrade and rollback select only their affected database surfaces', () => {
  const workflow = readWorkflow('database-upgrade.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const backendPackageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'backend', 'package.json'), 'utf8'));
  const changes = workflowJobBlock(workflow, 'changes');
  const databasePaths = workflowPathFilterBlock(changes, 'database');
  const migrationPaths = workflowPathFilterBlock(changes, 'migrations');
  const populated = workflowJobBlock(workflow, 'populated-upgrade');
  const rollback = workflowJobBlock(workflow, 'release-upgrade-rollback');

  assertPathFilterOutputs(changes, ['database', 'migrations'], 'decision');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(changes, /if: github\.event_name == 'pull_request'/);
  assert.match(changes, /github\.event_name != 'pull_request'/);
  for (const expectedPath of [
    '.github/workflows/database-upgrade.yml',
    'backend/package.json',
    'backend/package-lock.json',
    'backend/prisma.config.ts',
    'backend/prisma/**',
    'backend/src/config/database.ts',
    'backend/src/services/materializedWeightTrend.ts',
    'deploy/backup/**',
    'scripts/postgres-*.mjs',
    'shared/weightTrend*.ts'
  ]) {
    assert.ok(databasePaths.includes(`- '${expectedPath}'`), `database filter must include ${expectedPath}`);
  }
  for (const expectedPath of [
    '.github/workflows/database-upgrade.yml',
    'backend/prisma/migrations/**',
    'scripts/postgres-rollback-smoke.mjs',
    'scripts/postgres-rollback-smoke.test.mjs'
  ]) {
    assert.ok(migrationPaths.includes(`- '${expectedPath}'`), `migration filter must include ${expectedPath}`);
  }
  assert.doesNotMatch(databasePaths, /- 'package\.json'|release-acceptance/);
  assert.equal(packageConfig.scripts['prisma:generate'], 'npm --prefix backend run prisma:generate');
  assert.equal(backendPackageConfig.scripts['prisma:generate'], 'prisma generate');
  assert.equal(packageConfig.scripts['test:db:rollback:unit'], 'node --test scripts/postgres-rollback-smoke.test.mjs');
  assert.equal(packageConfig.scripts['test:db:rollback'], 'node scripts/postgres-rollback-smoke.mjs');

  assert.equal(pathFilterMatches(changes, 'database', 'backend/src/routes/user.ts'), false);
  assert.equal(pathFilterMatches(changes, 'database', 'backend/prisma/schema.prisma'), true);
  assert.equal(pathFilterMatches(changes, 'migrations', 'backend/prisma/schema.prisma'), false);
  assert.equal(pathFilterMatches(changes, 'migrations', 'backend/prisma/migrations/0021/example.sql'), true);
  assert.equal(pathFilterMatches(changes, 'migrations', 'scripts/postgres-rollback-smoke.mjs'), true);
  assert.match(populated, /if: needs\.changes\.outputs\.database == 'true'/);
  assert.match(rollback, /if: needs\.changes\.outputs\.migrations == 'true'/);
  assert.doesNotMatch(workflow, /release-acceptance\.mjs hosted-result|upload-artifact/);
});

test('database rollback binds a full candidate SHA for pull requests and manual dispatches', () => {
  const rollback = workflowJobBlock(readWorkflow('database-upgrade.yml'), 'release-upgrade-rollback');
  const candidateExpression = '${{ github.event.pull_request.head.sha || github.sha }}';

  assert.ok(
    rollback.includes(`CALIBRATE_SOURCE_COMMIT: ${candidateExpression}`),
    'database rollback must fall back to github.sha when pull-request context is unavailable'
  );

  for (const scenario of [
    {
      eventName: 'pull_request',
      pullRequestHeadSha: '1'.repeat(40),
      githubSha: '2'.repeat(40),
      expected: '1'.repeat(40)
    },
    {
      eventName: 'workflow_dispatch',
      pullRequestHeadSha: '',
      githubSha: '3'.repeat(40),
      expected: '3'.repeat(40)
    }
  ]) {
    const sourceCommit = scenario.pullRequestHeadSha || scenario.githubSha;
    assert.equal(sourceCommit, scenario.expected, scenario.eventName);
    assert.match(sourceCommit, /^[0-9a-f]{40}$/, `${scenario.eventName} source SHA`);
  }
});

test('dependency audit selects changed lockfile workspaces and preserves scheduled coverage', () => {
  const workflow = readWorkflow('dependency-audit.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const changes = workflowJobBlock(workflow, 'changes');
  const rootPaths = workflowPathFilterBlock(changes, 'root');
  const backendPaths = workflowPathFilterBlock(changes, 'backend');
  const audit = workflowJobBlock(workflow, 'production-audit');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(changes, /pull-requests: read/);
  assert.match(changes, /if: github\.event_name == 'pull_request'/);
  assert.match(changes, /github\.event_name != 'pull_request'/);
  assert.match(rootPaths, /- '\.github\/workflows\/dependency-audit\.yml'/);
  assert.match(backendPaths, /- '\.github\/workflows\/dependency-audit\.yml'/);
  assert.match(rootPaths, /- 'package\.json'/);
  assert.match(rootPaths, /- 'package-lock\.json'/);
  assert.match(rootPaths, /scripts\/dependency-advisory-exceptions\.mjs/);
  assert.match(rootPaths, /scripts\/release-config\.mjs/);
  assert.match(rootPaths, /tools\/eas-cli\/package\.json/);
  assert.match(rootPaths, /tools\/eas-cli\/package-lock\.json/);
  assert.match(backendPaths, /- 'backend\/package\.json'/);
  assert.match(backendPaths, /- 'backend\/package-lock\.json'/);
  assert.equal(pathFilterMatches(changes, 'root', '.github/workflows/dependency-audit.yml'), true);
  assert.equal(pathFilterMatches(changes, 'backend', '.github/workflows/dependency-audit.yml'), true);
  assert.match(audit, /needs: changes/);
  assert.match(audit, /if: needs\.changes\.outputs\.has_audit == 'true'/);
  assert.match(audit, /matrix: \$\{\{ fromJSON\(needs\.changes\.outputs\.audit_matrix\) \}\}/);
  assert.match(workflow, /"workspace":"Locked EAS CLI"/);
  assert.match(workflow, /if: matrix\.evidence == 'backend'/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /if: matrix\.evidence == 'root'/);
  assert.match(workflow, /npm run audit:production/);
  assert.match(workflow, /if: matrix\.evidence == 'eas-cli'/);
  assert.match(workflow, /npm audit --package-lock-only --audit-level=high/);
  assert.doesNotMatch(workflow, /Install locked EAS CLI dependency graph/);
  assert.match(
    audit,
    /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\.4\.0[\s\S]*persist-credentials: false/
  );
  assert.match(audit, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4\.4\.0/);
  assert.match(workflow, /npm run audit:exceptions:check/);
  assert.match(packageConfig.scripts['audit:production'], /dependency-advisory-exceptions\.mjs --audit-production/);
  assert.equal(
    packageConfig.scripts['audit:eas-cli:high'],
    'npm audit --prefix tools/eas-cli --package-lock-only --audit-level=high'
  );
  assert.match(packageConfig.scripts['audit:exceptions:check'], /dependency-advisory-exceptions\.mjs/);
  assert.doesNotMatch(workflow, /release-acceptance\.mjs hosted-result|upload-artifact|retention-days:/);
});

test('container scan targets production-image inputs while preserving scheduled coverage', () => {
  const workflow = readWorkflow('container-scan.yml');
  const changes = workflowJobBlock(workflow, 'changes');
  const imagePaths = workflowPathFilterBlock(changes, 'image');
  const scan = workflowJobBlock(workflow, 'scan');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(changes, /pull-requests: read/);
  assert.match(changes, /if: github\.event_name == 'pull_request'/);
  assert.match(changes, /github\.event_name != 'pull_request'/);
  for (const expectedPath of [
    '.github/workflows/container-scan.yml',
    '.dockerignore',
    'Dockerfile.app',
    'backend/**',
    'mobile/**',
    'scripts/expo-cli-environment.mjs',
    'scripts/production-container-smoke.mjs'
  ]) {
    assert.ok(imagePaths.includes(`- '${expectedPath}'`), `image filter must include ${expectedPath}`);
  }
  assert.equal(pathFilterMatches(changes, 'image', '.github/workflows/container-scan.yml'), true);
  assert.match(scan, /needs: changes/);
  assert.match(scan, /if: needs\.changes\.outputs\.scan == 'true'/);
  assert.match(scan, /docker build --file Dockerfile\.app --tag calibrate:security-scan \./);
  assert.match(scan, /http:\/\/127\.0\.0\.1:3000\/api\/v1\/readyz/);
  assert.match(scan, /npm run test:container:web -- http:\/\/127\.0\.0\.1:3000/);
  assert.match(scan, /uses: aquasecurity\/trivy-action@[0-9a-f]{40}/);
  assert.match(scan, /severity: HIGH,CRITICAL/);
  assert.doesNotMatch(imagePaths, /release-acceptance/);
  assert.doesNotMatch(workflow, /release-acceptance\.mjs hosted-result|upload-artifact|retention-days:/);
});

test('version-only release PRs validate mirrors without platform build fan-out', () => {
  const preparedReleasePaths = [
    'backend/package-lock.json',
    'backend/package.json',
    'docs/openapi/v1.yaml',
    'package-lock.json',
    'package.json',
    'packages/api-client/src/generated/v1.ts',
    'shared/client-diagnostic-versions.json',
    'shared/release.json'
  ];
  const workflow = readWorkflow('builds.yml');
  const changes = workflowJobBlock(workflow, 'changes');
  assert.match(changes, /id: release_mirror_filter[\s\S]*predicate-quantifier: every/);
  assert.match(
    changes,
    /NON_RELEASE_MIRROR_CHANGED: \$\{\{ steps\.release_mirror_filter\.outputs\.non_release_mirror == 'true' \}\}/
  );

  for (const candidatePath of preparedReleasePaths) {
    assert.equal(
      pathFilterMatches(changes, 'release_config', candidatePath),
      true,
      `${candidatePath} must validate release mirrors`
    );
    assert.equal(
      pathFilterMatches(changes, 'non_release_mirror', candidatePath, 'every'),
      false,
      `${candidatePath} must be recognized as a version-only mirror`
    );
  }
  assert.equal(pathFilterMatches(changes, 'non_release_mirror', 'mobile/src/App.tsx', 'every'), true);
  assert.match(changes, /HEAD_REF: \$\{\{ github\.head_ref \}\}/);
  assert.match(changes, /HEAD_REF.*release\/v\*/s);
  assert.match(changes, /NON_RELEASE_MIRROR_CHANGED.*!= "true"/s);
  assert.match(changes, /platform build fan-out is intentionally suppressed/);

  const releaseConfig = workflowJobBlock(workflow, 'release-config');
  assert.match(releaseConfig, /if: needs\.changes\.outputs\.release_config == 'true'/);
  for (const jobId of [
    'backend-build',
    'expo-web-build',
    'web-critical-smoke',
    'native-metro-bundle',
    'mobile-build',
    'ios-build',
    'wear-build'
  ]) {
    const job = workflowJobBlock(workflow, jobId);
    assert.match(job, /needs\.changes\.outputs\.(backend|web|native_runtime|native_package|wear)/);
  }

  const plan = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'quality', 'release-acceptance-plan.json'), 'utf8')
  );
  const affectedBuilds = plan.automaticRequirements.find(
    (requirement) => requirement.id === 'affected-builds'
  );
  assert.ok(affectedBuilds);
  assert.ok(affectedBuilds.jobIds.includes('web-critical-smoke'));
  assert.ok(affectedBuilds.jobIds.includes('ios-build'));
  assert.equal(plan.policy.pullRequestChecks, 'affected-only');
});

test('all pull-request workflow checkouts freeze exact candidate C', () => {
  const checkoutExpression = 'ref: ${{ github.event.pull_request.head.sha || github.sha }}';
  for (const name of [
    'builds.yml',
    'tests.yml',
    'lint.yml',
    'database-upgrade.yml',
    'dependency-audit.yml',
    'container-scan.yml'
  ]) {
    const workflow = readWorkflow(name);
    const checkoutCount = (workflow.match(/uses: actions\/checkout@(?:v4|[0-9a-f]{40})/g) ?? []).length;
    const pinnedCount = workflow.split(checkoutExpression).length - 1;
    assert.ok(checkoutCount > 0, `${name} must contain a checkout`);
    assert.equal(pinnedCount, checkoutCount, `${name} must pin every checkout to candidate C`);
  }
});

test('the lean acceptance plan separates automatic critical smoke from exhaustive Web suites', () => {
  const workflow = readWorkflow('builds.yml');
  const plan = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'quality', 'release-acceptance-plan.json'), 'utf8')
  );
  const affectedBuilds = plan.automaticRequirements.find(
    (requirement) => requirement.id === 'affected-builds'
  );
  const exhaustiveWeb = plan.manualCapabilities.find(
    (capability) => capability.id === 'exhaustive-web-regression'
  );

  assert.ok(affectedBuilds.jobIds.includes('web-critical-smoke'));
  for (const jobId of ['exported-web-e2e', 'data-state-acceptance', 'ux-regression']) {
    assert.equal(affectedBuilds.jobIds.includes(jobId), false);
    assert.ok(exhaustiveWeb.jobIds.includes(jobId));
    assert.match(
      workflowJobBlock(workflow, jobId),
      /if: github\.event_name == 'workflow_dispatch' && needs\.changes\.outputs\.web_release == 'true'/
    );
  }
  const smoke = workflowJobBlock(workflow, 'web-critical-smoke');
  assert.match(smoke, /if: needs\.changes\.outputs\.web == 'true'/);
  assert.match(smoke, /npm\.cmd run test:expo-web:smoke/);
  assert.doesNotMatch(workflowJobBlock(workflow, 'expo-web-build'), /performance/);
});

test('manual native rehearsals retain only short-lived diagnostic artifacts', () => {
  const workflow = readWorkflow('builds.yml');
  const plan = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'quality', 'release-acceptance-plan.json'), 'utf8')
  );
  const nativeCapability = plan.manualCapabilities.find(
    (capability) => capability.id === 'native-emulator-and-upgrade'
  );
  const expectedJobs = [
    ['android-emulator-e2e', 'android-emulator-e2e-', 'android.json'],
    ['wear-release-emulator-smoke', 'wear-release-emulator-smoke-', 'wear.json'],
    ['native-package-upgrade', 'native-package-upgrade-', 'upgrade.json']
  ];

  assert.deepEqual(
    nativeCapability.jobIds,
    expectedJobs.map(([jobId]) => jobId)
  );
  for (const [jobId, artifactPrefix, output] of expectedJobs) {
    const job = workflowJobBlock(workflow, jobId);
    assert.match(job, /github\.event_name == 'workflow_dispatch'/);
    assert.match(job, new RegExp(`name: ${artifactPrefix}\\$\\{\\{ github\\.run_id \\}\\}-\\$\\{\\{ github\\.run_attempt \\}\\}`));
    assert.match(job, new RegExp(`path: \\.codex-screenshots/native-hosted/${output}`));
    assert.match(job, /include-hidden-files: true/);
    assert.match(job, /retention-days: 7/);
    assert.doesNotMatch(job, /hosted-result|acceptance-summary|--gate |retention-days: 90/);
  }
});

test('PR rollback owns migration safety without a redundant Cut release replay', () => {
  const pullRequestWorkflow = readWorkflow('database-upgrade.yml');
  const pullRequest = workflowJobBlock(pullRequestWorkflow, 'release-upgrade-rollback');
  const release = readWorkflow('cut-release.yml');
  const releaseFinalize = workflowJobBlock(release, 'finalize');

  assert.match(pullRequest, /if: needs\.changes\.outputs\.migrations == 'true'/);
  assert.match(pullRequest, /fetch-depth: 0/);
  assert.match(
    pullRequest,
    /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
  );
  assert.match(pullRequest, /npm run test:db:rollback:unit/);
  assert.match(pullRequest, /npm run test:db:rollback/);
  assert.doesNotMatch(pullRequest, /upload-artifact|hosted-result|retention-days:/);
  assert.doesNotMatch(release, /\n  database-rollback:|database_migrations_changed|test:db:rollback/);
  assert.match(releaseFinalize, /needs: \[prepare, publish_candidate, release-validation\]/);
  assert.doesNotMatch(releaseFinalize, /ux-regression/);
});

test('Optional Release Confidence is a manual owner-discretion exact-candidate check', () => {
  const workflow = readWorkflow('release-acceptance.yml');
  const owner = workflowJobBlock(workflow, 'owner-confidence');
  const plan = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'quality', 'release-acceptance-plan.json'), 'utf8')
  );
  const ownerCapability = plan.manualCapabilities.find(
    (capability) => capability.id === 'owner-release-confidence'
  );

  assert.match(workflow, /^name: Optional Release Confidence/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*candidate_commit:[\s\S]*required: true/);
  assert.doesNotMatch(workflow, /\n\s+pull_request:|\n\s+push:|\n\s+schedule:/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(owner, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(owner, /ref: \$\{\{ inputs\.candidate_commit \}\}/);
  assert.match(owner, /test "\$\(git rev-parse HEAD\)" = "\$\{CANDIDATE_COMMIT\}"/);
  assert.match(owner, /node scripts\/release-config\.mjs check/);
  assert.match(owner, /node scripts\/dependency-advisory-exceptions\.mjs --strict/);
  assert.match(owner, /npm run test:deploy/);
  assert.match(owner, /npm run api:contract:check/);
  assert.match(owner, /git diff --exit-code/);
  assert.doesNotMatch(
    workflow,
    /external-launch|evidence_commit|release:acceptance:external|test:risk-evidence:release|hosted-result|upload-artifact|Playwright|emulator/i
  );
  assert.deepEqual(ownerCapability.jobIds, ['owner-confidence']);
  assert.equal(plan.policy.externalReleaseApproval, 'owner-discretion');
  assert.equal(plan.policy.retainedEvidenceRequired, false);
});
