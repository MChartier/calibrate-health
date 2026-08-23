import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDirectory = path.join(repositoryRoot, '.github', 'workflows');
const readWorkflow = (name) => readFileSync(path.join(workflowsDirectory, name), 'utf8')
  .replaceAll('\r\n', '\n');

function uxJobBlock(workflow) {
  const match = workflow.match(/\n  ux-regression:\n[\s\S]*?(?=\n  [a-z0-9_-]+:)/);
  assert.ok(match, 'workflow must define one ux-regression job');
  return match[0];
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

function pathFilterMatches(job, filterName, candidatePath) {
  return workflowPathFilterPaths(job, filterName)
    .some((pattern) => pathFilterPatternMatches(pattern, candidatePath));
}

function assertPathFilterOutputs(job, outputNames, stepId = 'filter') {
  assert.match(job, /pull-requests: read/);
  assert.match(job, /uses: dorny\/paths-filter@v3/);
  for (const outputName of outputNames) {
    assert.match(outputName, /^[a-z_]+$/);
    const expression = outputName + ': ' + '${{ steps.' + stepId + '.outputs.' + outputName + ' }}';
    assert.ok(job.includes(expression), `classifier must publish ${expression}`);
  }
}

function assertWindowsUxJob(workflow) {
  const job = uxJobBlock(workflow);
  assert.match(job, /runs-on: windows-latest/);
  assert.match(job, /node-version: 24\.14\.0/);
  assert.match(job, /node node_modules\/@playwright\/test\/cli\.js install chromium/);
  assert.match(job, /npm\.cmd run test:ux/);
  assert.match(job, /if: always\(\)/);
  assert.match(job, /actions\/upload-artifact@v4/);
  assert.match(job, /path: \.codex-screenshots\/expo-web-ux-results/);
  assert.match(job, /include-hidden-files: true/);
  assert.match(job, /if-no-files-found: error/);
  assert.doesNotMatch(job, /update-snapshots|CALIBRATE_APPROVE_UX_SNAPSHOTS/);
}
test('manual release preparation validates one exact candidate before auto-merging its release PR', () => {
  const workflow = readWorkflow('cut-release.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const prepare = workflowJobBlock(workflow, 'prepare');
  const validation = workflowJobBlock(workflow, 'release-validation');
  const finalize = workflowJobBlock(workflow, 'finalize');
  const cleanup = workflowJobBlock(workflow, 'cleanup-candidate');
  const publish = workflowJobBlock(workflow, 'publish');

  assertWindowsUxJob(workflow);
  assert.match(workflow, /workflow_dispatch:[\s\S]*bump:[\s\S]*type: choice/);
  assert.match(workflow, /options:\s*\n\s+- patch\s*\n\s+- minor\s*\n\s+- major/);
  assert.doesNotMatch(workflow, /push:\s*\n\s+branches: \[master\]/);
  assert.match(workflow, /group: cut-release/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /packages: write/);
  assert.match(packageConfig.scripts['release:prepare'], /release-config\.mjs prepare/);

  assert.match(prepare, /if \[\[ "\$\{GITHUB_REF\}" != "refs\/heads\/master" \]\]/);
  assert.match(prepare, /git fetch origin master --tags/);
  assert.match(prepare, /MANIFEST_TAG.*LATEST_TAG/);
  assert.match(prepare, /release:prepare -- --bump/);
  assert.doesNotMatch(prepare, /release:prepare.*--latest-tag/);
  assert.match(prepare, /BRANCH="release\/\$\{TAG\}"/);
  assert.match(prepare, /git commit -m "Prepare release \$\{TAG\}"/);
  assert.match(prepare, /git push --set-upstream origin/);

  assert.match(validation, /ref: \$\{\{ needs\.prepare\.outputs\.release_sha \}\}/);
  assert.match(validation, /npm run release:check:container/);
  assert.match(validation, /npm run test:release/);
  assert.match(validation, /npm run test:expo-web:release/);
  assert.match(validation, /npm run test:deploy/);
  assert.match(validation, /npm run api:contract:check/);
  assert.match(validation, /git diff --exit-code/);
  assert.doesNotMatch(workflow, /npm run release:check:production/);
  assert.doesNotMatch(packageConfig.scripts['release:check:container'], /--strict/);
  assert.match(packageConfig.scripts['release:check:production'], /--strict/);

  assert.match(finalize, /needs: \[prepare, release-validation, ux-regression, database-rollback\]/);
  assert.match(finalize, /Refuse master drift/);
  assert.match(finalize, /origin\/master.*SOURCE_SHA/);
  assert.match(finalize, /github\.rest\.pulls\.create/);
  assert.doesNotMatch(finalize, /github\.rest\.pulls\.merge/);
  assert.match(finalize, /refs\/pull\/\$\{PULL_REQUEST_NUMBER\}\/merge/);
  assert.match(finalize, /MERGE_SHA\}\^1.*SOURCE_SHA/);
  assert.match(finalize, /MERGE_SHA\}\^2.*RELEASE_SHA/);
  assert.match(finalize, /git push origin "\$\{MERGE_SHA\}:refs\/heads\/master"/);
  assert.doesNotMatch(finalize, /git push[^\n]*--force/);
  assert.match(finalize, /git merge-base --is-ancestor "\$\{RELEASE_SHA\}" origin\/master/);
  assert.match(finalize, /MERGE_SHA\}\^1/);
  assert.match(finalize, /MERGE_SHA\}\^\{tree\}/);

  assert.match(cleanup, /always\(\).*needs\.finalize\.result != 'success'/);
  assert.match(cleanup, /gh pr list --state open/);
  assert.match(cleanup, /gh pr close/);
  assert.match(cleanup, /REMOTE_SHA.*RELEASE_SHA/);
  assert.match(cleanup, /git push origin --delete/);

  assert.match(publish, /uses: \.\/\.github\/workflows\/publish-release\.yml/);
  assert.match(publish, /release_commit: \$\{\{ needs\.prepare\.outputs\.release_sha \}\}/);
  assert.match(publish, /release_branch: \$\{\{ needs\.prepare\.outputs\.release_branch \}\}/);
  assert.doesNotMatch(workflow, /createWorkflowDispatch|workflow_id:/);
});

test('prepared release publishing is reusable, recoverable, and idempotent', () => {
  const workflow = readWorkflow('publish-release.yml');
  const tag = workflowJobBlock(workflow, 'tag_release');
  const image = workflowJobBlock(workflow, 'build_release_image');

  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_commit:/);
  assert.match(workflow, /release_branch:/);
  assert.match(workflow, /group: publish-prepared-release-\$\{\{ inputs\.release_commit \}\}/);
  assert.match(tag, /ref: \$\{\{ inputs\.release_commit \}\}/);
  assert.match(tag, /git merge-base --is-ancestor "\$\{RELEASE_COMMIT\}" origin\/master/);
  assert.match(tag, /EXPECTED_BRANCH="release\/\$\{TAG\}"/);
  assert.match(tag, /node scripts\/release-config\.mjs check/);
  assert.match(tag, /Existing tag \$\{TAG\} points to/);
  assert.match(tag, /node scripts\/release-config\.mjs tag --latest-tag/);
  assert.match(tag, /git tag -a "\$\{RELEASE_TAG\}"/);
  assert.match(image, /uses: \.\/\.github\/workflows\/container\.yml/);
  assert.match(image, /publish_latest: true/);
  assert.doesNotMatch(workflow, /pull_request_target|createWorkflowDispatch/);
});

test('pull requests run Web gates only for Web-impacting paths', () => {
  const workflow = readWorkflow('builds.yml');
  const changes = workflowJobBlock(workflow, 'changes');
  const webPaths = workflowPathFilterBlock(changes, 'web');
  const expoWebBuild = workflowJobBlock(workflow, 'expo-web-build');
  const exportedWeb = workflowJobBlock(workflow, 'exported-web-e2e');
  const playwrightConfig = readFileSync(
    path.join(repositoryRoot, 'playwright.expo-web.config.ts'),
    'utf8'
  );
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assertPathFilterOutputs(changes, ['backend', 'web', 'wear', 'native_runtime', 'native_package'], 'decision');
  const releaseConfig = workflowJobBlock(workflow, 'release-config');
  const webJobs = [
    expoWebBuild,
    exportedWeb,
    workflowJobBlock(workflow, 'data-state-acceptance'),
    workflowJobBlock(workflow, 'ux-regression')
  ];

  assertWindowsUxJob(workflow);
  assert.match(workflow, /on:\s*\n\s+pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(changes, /if: github\.event_name == 'pull_request'/);
  assert.match(changes, /github\.event_name != 'pull_request'/);
  assert.match(webPaths, /- '\.github\/workflows\/builds\.yml'/);
  assert.doesNotMatch(webPaths, /- 'backend\/\*\*'/);
  assert.doesNotMatch(webPaths, /- 'mobile\/test\/\*\*'/);
  assert.match(webPaths, /- 'mobile\/src\/\*\*'/);
  assert.match(webPaths, /- 'e2e\/expo-web\/\*\*'/);
  assert.match(webPaths, /- 'quality\/performance-budgets\.json'/);
  assert.match(webPaths, /- 'scripts\/expo-cli-environment\.mjs'/);
  assert.match(webPaths, /- 'scripts\/performance-budgets\.mjs'/);
  assert.match(webPaths, /- 'scripts\/release-acceptance\.mjs'/);
  assert.doesNotMatch(expoWebBuild, /test:performance:web|CALIBRATE_RUN_HOSTED_WEB_VITALS/);
  assert.match(exportedWeb, /npm\.cmd run test:expo-web/);
  assert.match(playwrightConfig, /process\.env\.CI \? \[\/launch-21-performance-budgets\\\.spec\\\.ts\/\] : \[\]/);
  assert.equal(
    packageConfig.scripts['test:performance:web'],
    'playwright test --config=playwright.expo-web.config.ts --project=desktop-chrome e2e/expo-web/launch-21-performance-budgets.spec.ts'
  );
  for (const job of webJobs) {
    assert.match(job, /needs: changes/);
    assert.match(job, /if: needs\.changes\.outputs\.web == 'true'/);
  }
  assert.doesNotMatch(releaseConfig, /needs\.changes\.outputs/);
});

test('pull requests run backend builds only for backend-impacting paths', () => {
  const workflow = readWorkflow('builds.yml');
  const changes = workflowJobBlock(workflow, 'changes');
  const backendPaths = workflowPathFilterBlock(changes, 'backend');
  const backendJobs = [
    workflowJobBlock(workflow, 'backend-build'),
    workflowJobBlock(workflow, 'performance-regression')
  ];

  assert.match(backendPaths, /- '\.github\/workflows\/builds\.yml'/);
  assert.match(backendPaths, /- 'backend\/\*\*'/);
  assert.match(backendPaths, /- 'shared\/\*\*'/);
  assert.match(backendPaths, /- 'quality\/performance-budgets\.json'/);
  assert.match(backendPaths, /- 'scripts\/performance-budgets\.mjs'/);
  for (const job of backendJobs) {
    assert.match(job, /needs: changes/);
    assert.match(job, /if: needs\.changes\.outputs\.backend == 'true'/);
  }
});

test('pull requests bundle native runtime changes while path-gating native packages', () => {
  const workflow = readWorkflow('builds.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const changes = workflowJobBlock(workflow, 'changes');
  const runtime = workflowJobBlock(workflow, 'native-metro-bundle');
  const mobileBuild = workflowJobBlock(workflow, 'mobile-build');
  const android = workflowJobBlock(workflow, 'android-emulator-e2e');
  const wearBuild = workflowJobBlock(workflow, 'wear-build');
  const wear = workflowJobBlock(workflow, 'wear-release-emulator-smoke');
  const upgrade = workflowJobBlock(workflow, 'native-package-upgrade');

  assert.match(packageConfig.scripts['test:native-release'], /hosted-native-emulators\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /hosted-android-e2e\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /native-upgrade-rehearsal\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /wear-build-task-guard\.test\.mjs/);
  assert.doesNotMatch(packageConfig.scripts['test:native-release'], /xcode-uuid-compatibility\.test\.mjs/);
  assert.equal(
    packageConfig.scripts['test:mobile-build-tools'],
    'node --test scripts/xcode-uuid-compatibility.test.mjs'
  );

  assert.match(changes, /uses: dorny\/paths-filter@v3/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*native_upgrade_baseline:[\s\S]*required: true/);
  assert.match(changes, /Validate manual native upgrade baseline[\s\S]*\^\[0-9a-f\]\{40\}\$/);
  const wearPaths = workflowPathFilterBlock(changes, 'wear');
  assert.match(wearPaths, /- '\.github\/workflows\/builds\.yml'/);
  for (const expectedPath of [
    'wear/**',
    'scripts/hosted-native-evidence.mjs',
    'scripts/release-acceptance.mjs',
    'scripts/wear-emulator-smoke.mjs'
  ]) {
    assert.ok(wearPaths.includes(`- '${expectedPath}'`), `wear filter must include ${expectedPath}`);
  }
  const nativeRuntimePaths = workflowPathFilterBlock(changes, 'native_runtime');
  for (const expectedPath of [
    '.github/workflows/builds.yml',
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
    'package.json',
    'package-lock.json',
    'packages/api-client/**',
    'scripts/xcode-uuid-compatibility.test.mjs',
    'shared/**'
  ]) {
    assert.ok(
      nativeRuntimePaths.includes(`- '${expectedPath}'`),
      `native_runtime filter must include ${expectedPath}`
    );
  }
  const nativePackagePaths = workflowPathFilterBlock(changes, 'native_package');
  assert.match(nativePackagePaths, /- '\.github\/workflows\/builds\.yml'/);
  for (const expectedPath of [
    'mobile/babel.config.js',
    'mobile/index.js',
    'mobile/metro.config.js',
    'mobile/assets/adaptive-icon.png',
    'mobile/assets/icon.png',
    'mobile/assets/notification-icon.png',
    'mobile/plugins/**',
    'scripts/android-e2e.mjs',
    'scripts/hosted-android-e2e.mjs',
    'scripts/hosted-native-emulators.mjs',
    'scripts/hosted-native-evidence.mjs',
    'scripts/native-release-build.mjs',
    'scripts/native-upgrade-rehearsal.mjs',
    'scripts/release-acceptance.mjs',
    'scripts/wear-emulator-smoke.mjs'
  ]) {
    assert.ok(
      nativePackagePaths.includes(`- '${expectedPath}'`),
      `native_package filter must include ${expectedPath}`
    );
  }
  assert.doesNotMatch(nativePackagePaths, /mobile\/src/);
  assert.doesNotMatch(nativePackagePaths, /- 'package\.json'/);
  assert.match(nativePackagePaths, /- 'package-lock\.json'/);
  assert.match(runtime, /needs: changes/);
  assert.match(
    runtime,
    /if: needs\.changes\.outputs\.native_runtime == 'true' \|\| needs\.changes\.outputs\.native_package == 'true'/
  );
  assert.match(runtime, /runs-on: ubuntu-latest/);
  assert.match(runtime, /node-version: 22\.13\.0/);
  assert.match(runtime, /CI: "1"/);
  assert.match(runtime, /NODE_ENV: production/);
  assert.match(runtime, /NODE_PATH: \$\{\{ github\.workspace \}\}\/mobile\/node_modules/);
  assert.match(runtime, /npm ci --no-audit --fund=false/);
  assert.match(runtime, /npm run test:mobile-build-tools/);
  assert.doesNotMatch(mobileBuild, /npm run test:mobile-build-tools/);
  assert.match(
    runtime,
    /node \.\.\/node_modules\/expo\/bin\/cli export --platform android --output-dir "\$\{RUNNER_TEMP\}\/calibrate-android-export"/
  );
  for (const job of [wearBuild, wear]) {
    assert.match(job, /needs: changes/);
    assert.match(job, /if: needs\.changes\.outputs\.wear == 'true'/);
  }
  for (const job of [mobileBuild, upgrade]) {
    assert.match(job, /needs: changes/);
    assert.match(job, /if: needs\.changes\.outputs\.native_package == 'true'/);
  }
  assert.match(android, /needs: \[changes, mobile-build\]/);
  assert.match(android, /if: needs\.changes\.outputs\.native_package == 'true'/);

  assert.match(workflow, /Share Android debug APK with emulator E2E/);
  assert.match(
    mobileBuild,
    /name: android-debug-apk-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}[\s\S]*overwrite: true/,
  );
  assert.match(
    android,
    /name: android-debug-apk-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
  );
  assert.doesNotMatch(mobileBuild, /android-debug-apk-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.doesNotMatch(android, /android-debug-apk-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(android, /needs: \[changes, mobile-build\]/);
  assert.match(android, /ANDROID_ADB_SERIAL: emulator-5554/);
  assert.match(android, /image: postgres:15-alpine/);
  assert.match(android, /reactivecircus\/android-emulator-runner@v2/);
  assert.match(android, /target: google_apis/);
  assert.match(android, /cmdline-tools-version: 15859902/);
  assert.match(android, /script: node scripts\/hosted-android-e2e\.mjs/);
  assert.doesNotMatch(android, /script: \|/);
  assert.doesNotMatch(android, /cleanup_metro|METRO_PID|trap cleanup_metro/);
  assert.doesNotMatch(android, /tail -n 80/);
  assert.doesNotMatch(android, /Start deterministic Metro bundle/);
  assert.doesNotMatch(android, /adb -s "\$ANDROID_ADB_SERIAL" install -r/);
  assert.doesNotMatch(android, /npm run test:android:e2e/);

  assert.match(wear, /Create disposable hosted-emulator signing key/);
  assert.match(wear, /:app:assembleRelease/);
  assert.equal((workflow.match(/-gpu software/g) ?? []).length, 2);
  assert.equal((workflow.match(/-gpu swiftshader_indirect/g) ?? []).length, 1);
  assert.match(wear, /-gpu swiftshader_indirect/);
  assert.match(wear, /target: android-wear/);
  assert.match(wear, /profile: wearos_large_round/);
  assert.match(wear, /androidboot.setupwizard_mode=DISABLED/);
  assert.match(wear, /npm run test:wear:emulator/);
  assert.match(wear, /WEAR_BUILD_TYPE: release/);
  assert.match(wear, /cmdline-tools-version: 15859902/);

  assert.match(upgrade, /fetch-depth: 0/);
  assert.match(upgrade, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(upgrade, /hosted-native-emulators\.mjs prepare-wear/);
  assert.match(upgrade, /hosted-native-emulators\.mjs start-wear/);
  assert.match(upgrade, /hosted-native-emulators\.mjs wait-wear/);
  assert.match(upgrade, /hosted-native-emulators\.mjs stop-wear/);
  assert.match(
    upgrade,
    /NATIVE_UPGRADE_BASELINE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| inputs\.native_upgrade_baseline \}\}/
  );
  assert.match(upgrade, /--baseline "\$NATIVE_UPGRADE_BASELINE"/);
  assert.match(upgrade, /--candidate "\$CALIBRATE_SOURCE_COMMIT"/);
  assert.match(upgrade, /--phone-serial emulator-5554/);
  assert.match(upgrade, /--wear-serial emulator-5556/);
  assert.match(upgrade, /--execute/);
  assert.match(upgrade, /--package-only/);
  const nativeUpgradeStep = upgrade
    .split(/\n(?=\s+- name:)/)
    .find((step) => step.includes('npm run test:native:upgrade'));
  assert.ok(nativeUpgradeStep, 'native package upgrade job must invoke its rehearsal');
  assert.doesNotMatch(
    nativeUpgradeStep,
    /(^|\s)\\(?=\s|$)/,
    'native upgrade arguments must not contain a standalone shell-continuation backslash',
  );
  assert.match(upgrade, /cmdline-tools-version: 15859902/);
  assert.match(
    upgrade,
    /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
  );
  assert.match(upgrade, /hosted-native-evidence\.mjs init/);
  assert.match(upgrade, /path: \.codex-screenshots\/native-hosted\/upgrade\.json/);
  assert.match(upgrade, /retention-days: 90/);
  assert.doesNotMatch(upgrade.match(/Upload sanitized two-emulator upgrade evidence[\s\S]*$/)?.[0] ?? '', /native-upgrade\.json/);

  const hostedJobs = `${android}\n${wear}\n${upgrade}`;
  assert.doesNotMatch(hostedJobs, /secrets\.|EXPO_TOKEN|test:risk-evidence:release|workflow_dispatch|physical/i);
  assert.doesNotMatch(hostedJobs, /continue-on-error/);
  assert.throws(() => workflowJobBlock(workflow, 'android.*'), /literal safe identifier/);
});

test('native jobs bind immutable candidate and baseline SHAs for PR and manual events', () => {
  const workflow = readWorkflow('builds.yml');
  const mobileBuild = workflowJobBlock(workflow, 'mobile-build');
  const android = workflowJobBlock(workflow, 'android-emulator-e2e');
  const wear = workflowJobBlock(workflow, 'wear-release-emulator-smoke');
  const upgrade = workflowJobBlock(workflow, 'native-package-upgrade');
  const candidateExpression = '${{ github.event.pull_request.head.sha || github.sha }}';

  assert.ok(mobileBuild.includes(`--source-commit "${candidateExpression}"`));
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
  const filters = ['backend', 'web', 'wear', 'native_runtime', 'native_package'];
  const cases = [
    ['docs/review-notes.md', []],
    ['.github/workflows/tests.yml', []],
    ['.github/workflows/builds.yml', ['backend', 'web', 'wear', 'native_runtime', 'native_package']],
    ['backend/src/routes/user.ts', ['backend']],
    ['shared/caloriePolicy.ts', ['backend', 'web', 'native_runtime']],
    ['mobile/src/components/AppCard.tsx', ['web', 'native_runtime']],
    ['mobile/test/jest.setup.ts', []],
    ['mobile/plugins/withHealthConnect.js', ['native_package']],
    ['mobile/babel.config.js', ['web', 'native_runtime', 'native_package']],
    ['wear/app/src/main/AndroidManifest.xml', ['wear', 'native_package']],
    ['quality/performance-budgets.json', ['backend', 'web']],
    ['scripts/expo-cli-environment.mjs', ['web']],
    ['scripts/performance-budgets.mjs', ['backend', 'web']],
    ['scripts/release-acceptance.mjs', ['web', 'wear', 'native_package']],
    ['package.json', ['web', 'native_runtime']],
    ['package-lock.json', ['web', 'native_runtime', 'native_package']]
  ];

  for (const [candidatePath, expectedFilters] of cases) {
    const actualFilters = filters.filter((filterName) => pathFilterMatches(changes, filterName, candidatePath));
    assert.deepEqual(actualFilters, expectedFilters, candidatePath);
  }
});

test('hosted Wear emulator runs persistence instrumentation after release evidence', () => {
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
  assert.ok(releaseSmokeIndex >= 0, 'Wear release evidence must run');
  assert.ok(
    releaseSmokeIndex < uninstallIndex && uninstallIndex < instrumentationIndex,
    'the differently signed release package must be removed before debug instrumentation',
  );
});

test('release images publish immutable identity and guard the moving latest tag', () => {
  const workflow = readWorkflow('container.yml');
  const deployEnvironment = readFileSync(path.join(repositoryRoot, 'deploy', '.env.example'), 'utf8');

  assert.doesNotMatch(workflow, /push:\s*\n\s+tags:/, 'image builds must be explicitly dispatched');
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /publish_latest:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /ref: \$\{\{ inputs\.release_tag \}\}/);
  assert.match(workflow, /REQUESTED_TAG: \$\{\{ inputs\.release_tag \}\}/);
  assert.match(workflow, /node scripts\/release-config\.mjs tag/);
  assert.match(workflow, /ghcr\.io/);
  assert.match(workflow, /echo "\$\{GHCR_IMAGE\}:latest"/);
  assert.match(workflow, /Refusing to move latest/);
  assert.match(workflow, /platforms: linux\/amd64/);
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

test('every hosted release result records a static safe workflow identifier', () => {
  let hostedResultCount = 0;
  for (const name of readdirSync(workflowsDirectory).filter((entry) => entry.endsWith('.yml'))) {
    const workflow = readWorkflow(name);
    const steps = workflow
      .split(/\n(?=\s+- name:)/)
      .filter((step) => step.includes('release-acceptance.mjs hosted-result'));
    for (const step of steps) {
      const invocationCount = (step.match(/release-acceptance\.mjs hosted-result/g) ?? []).length;
      const workflowIdentifiers = [...step.matchAll(/--workflow ([a-z0-9][a-z0-9-]*)(?=\s|$)/g)];
      assert.equal(
        workflowIdentifiers.length,
        invocationCount,
        `${name} must give every hosted-result invocation one static safe --workflow identifier`,
      );
      assert.equal((step.match(/--workflow\b/g) ?? []).length, invocationCount);
      hostedResultCount += invocationCount;
    }
  }
  assert.ok(hostedResultCount > 0, 'active workflows must record hosted release results');
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

test('Expo OTA updates publish internal automatically and gate production approval', () => {
  const workflow = readWorkflow('expo-ota-update.yml');

  assert.match(workflow, /push:\s*\n\s+branches: \[master\]/);
  assert.match(workflow, /publish-internal:/);
  assert.match(workflow, /environment: preview/);
  assert.match(workflow, /EXPO_UPDATES_CHANNEL: internal/);
  assert.match(workflow, /publish-production:/);
  assert.match(workflow, /needs: publish-internal/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /EXPO_UPDATES_CHANNEL: production/);
  assert.match(workflow, /PREVIOUS_MASTER_REF: \$\{\{ github\.event\.before \}\}/);
  assert.match(workflow, /--previous-ref "\$\{PREVIOUS_MASTER_REF\}"/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /secrets\.EXPO_TOKEN/);
  assert.match(workflow, /eas env:pull/);
  assert.match(workflow, /expo-ota-ci-preflight\.mjs/);
  assert.match(workflow, /eas update/);
  assert.match(workflow, /--platform android/);
  assert.match(workflow, /--non-interactive/);
  assert.doesNotMatch(workflow, /workflow_dispatch:|native_build_ref|native-ota-ci-preflight/);
});

test('pull request test suites run only for their affected surfaces', () => {
  const workflow = readWorkflow('tests.yml');
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

test('database rehearsals run only for schema, database, and concurrency inputs', () => {
  const workflow = readWorkflow('database-upgrade.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const backendPackageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'backend', 'package.json'), 'utf8'));
  const changes = workflowJobBlock(workflow, 'changes');
  const databasePaths = workflowPathFilterBlock(changes, 'database');

  assertPathFilterOutputs(changes, ['database'], 'decision');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(changes, /if: github\.event_name == 'pull_request'/);
  assert.match(changes, /github\.event_name != 'pull_request'/);
  for (const expectedPath of [
    '.github/workflows/database-upgrade.yml',
    'package.json',
    'backend/package.json',
    'backend/prisma/**',
    'backend/src/config/database.ts',
    'backend/src/services/materializedWeightTrend.ts',
    'deploy/backup/**',
    'scripts/postgres-*.mjs',
    'scripts/release-acceptance.mjs',
    'shared/weightTrend*.ts'
  ]) {
    assert.ok(databasePaths.includes(`- '${expectedPath}'`), `database filter must include ${expectedPath}`);
  }
  assert.equal(packageConfig.scripts['prisma:generate'], 'npm --prefix backend run prisma:generate');
  assert.equal(backendPackageConfig.scripts['prisma:generate'], 'prisma generate');
  assert.equal(packageConfig.scripts['test:db:rollback:unit'], 'node --test scripts/postgres-rollback-smoke.test.mjs');
  assert.equal(packageConfig.scripts['test:db:rollback'], 'node scripts/postgres-rollback-smoke.mjs');
  assert.equal(pathFilterMatches(changes, 'database', 'mobile/src/components/AppCard.tsx'), false);
  assert.equal(pathFilterMatches(changes, 'database', 'backend/src/routes/user.ts'), false);
  assert.equal(pathFilterMatches(changes, 'database', '.github/workflows/database-upgrade.yml'), true);
  assert.equal(pathFilterMatches(changes, 'database', 'package.json'), true);
  assert.equal(pathFilterMatches(changes, 'database', 'backend/package.json'), true);
  assert.equal(pathFilterMatches(changes, 'database', 'backend/prisma/schema.prisma'), true);
  assert.equal(pathFilterMatches(changes, 'database', 'scripts/postgres-rollback-smoke.mjs'), true);
  for (const jobName of ['populated-upgrade', 'release-upgrade-rollback']) {
    const job = workflowJobBlock(workflow, jobName);
    assert.match(job, /needs: changes/);
    assert.match(job, /if: needs\.changes\.outputs\.database == 'true'/);
  }
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
  assert.match(backendPaths, /- 'backend\/package\.json'/);
  assert.match(backendPaths, /- 'backend\/package-lock\.json'/);
  assert.equal(pathFilterMatches(changes, 'root', '.github/workflows/dependency-audit.yml'), true);
  assert.equal(pathFilterMatches(changes, 'backend', '.github/workflows/dependency-audit.yml'), true);
  assert.match(audit, /needs: changes/);
  assert.match(audit, /if: needs\.changes\.outputs\.has_audit == 'true'/);
  assert.match(audit, /matrix: \$\{\{ fromJSON\(needs\.changes\.outputs\.audit_matrix\) \}\}/);
  assert.match(workflow, /if: matrix\.directory != '\.'/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /if: matrix\.directory == '\.'/);
  assert.match(workflow, /npm run audit:production/);
  assert.match(workflow, /npm run audit:exceptions:check/);
  assert.match(packageConfig.scripts['audit:production'], /dependency-advisory-exceptions\.mjs --audit-production/);
  assert.match(packageConfig.scripts['audit:exceptions:check'], /dependency-advisory-exceptions\.mjs/);
  assert.match(workflow, /name: dependency-audit-\$\{\{ matrix\.evidence \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /--job "production-audit-\$\{\{ matrix\.evidence \}\}"/);
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
    'scripts/production-container-smoke.mjs',
    'scripts/release-acceptance.mjs'
  ]) {
    assert.ok(imagePaths.includes(`- '${expectedPath}'`), `image filter must include ${expectedPath}`);
  }
  assert.equal(pathFilterMatches(changes, 'image', '.github/workflows/container-scan.yml'), true);
  assert.match(scan, /needs: changes/);
  assert.match(scan, /if: needs\.changes\.outputs\.scan == 'true'/);
  assert.match(scan, /npm run test:container:web -- http:\/\/127\.0\.0\.1:3000/);
  assert.match(workflow, /--gate hosted-container-scan/);
  assert.match(workflow, /name: container-scan-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /retention-days: 90/);
});

test('prepared release candidates trigger every path-gated hosted release surface', () => {
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
  for (const [workflowName, filterNames] of [
    ['builds.yml', ['backend', 'web', 'wear', 'native_runtime', 'native_package']],
    ['tests.yml', ['backend', 'mobile']],
    ['database-upgrade.yml', ['database']],
    ['container-scan.yml', ['image']]
  ]) {
    const changes = workflowJobBlock(readWorkflow(workflowName), 'changes');
    for (const filterName of filterNames) {
      assert.ok(
        preparedReleasePaths.some((candidatePath) => pathFilterMatches(changes, filterName, candidatePath)),
        workflowName + ' ' + filterName + ' must run for a prepared release candidate'
      );
    }
  }

  const auditChanges = workflowJobBlock(readWorkflow('dependency-audit.yml'), 'changes');
  assert.equal(pathFilterMatches(auditChanges, 'root', 'package-lock.json'), true);
  assert.equal(pathFilterMatches(auditChanges, 'backend', 'backend/package-lock.json'), true);
  const plan = JSON.parse(readFileSync(path.join(repositoryRoot, 'quality', 'release-acceptance-plan.json'), 'utf8'));
  const dependencyAudit = plan.requirements.find((requirement) => requirement.id === 'hosted-dependency-audit');
  assert.equal(dependencyAudit.retainedArtifact.requiredResults, 2);
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
    const checkoutCount = (workflow.match(/uses: actions\/checkout@v4/g) ?? []).length;
    const pinnedCount = workflow.split(checkoutExpression).length - 1;
    assert.ok(checkoutCount > 0, `${name} must contain a checkout`);
    assert.equal(pinnedCount, checkoutCount, `${name} must pin every checkout to candidate C`);
  }
});

test('pull requests block on full exported Web and synthetic six-state acceptance', () => {
  const workflow = readWorkflow('builds.yml');
  const web = workflowJobBlock(workflow, 'exported-web-e2e');
  const states = workflowJobBlock(workflow, 'data-state-acceptance');

  for (const job of [web, states]) {
    assert.match(job, /runs-on: windows-latest/);
    assert.match(job, /node-version: 24\.14\.0/);
    assert.match(job, /node node_modules\/@playwright\/test\/cli\.js install chromium/);
    assert.match(job, /release-acceptance\.mjs hosted-result/);
    assert.match(job, /--candidate "\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}"/);
  }
  assert.match(web, /npm\.cmd run test:expo-web/);
  assert.match(web, /name: exported-web-e2e-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(states, /npm\.cmd run test:data-states/);
  assert.match(states, /PLAYWRIGHT_JSON_OUTPUT_FILE: \$\{\{ runner\.temp \}\}/);
  assert.match(states, /name: launch-24-data-state-acceptance-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.doesNotMatch(states, /path: .*expo-web-playwright-results/);
});

test('native hosted jobs retain strict lane evidence plus candidate-bound acceptance summaries', () => {
  const workflow = readWorkflow('builds.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.match(packageConfig.scripts['test:native-release'], /hosted-native-evidence\.test\.mjs/);

  for (const [jobId, lane, output, artifact, gate, summary] of [
    ['android-emulator-e2e', 'android', 'android.json', 'android-emulator-e2e-', 'hosted-android-emulator-e2e', 'android-emulator-e2e-summary-'],
    ['wear-release-emulator-smoke', 'wear', 'wear.json', 'wear-release-emulator-smoke-', 'hosted-wear-release-emulator-smoke', 'wear-release-emulator-smoke-summary-'],
    ['native-package-upgrade', 'upgrade', 'upgrade.json', 'native-package-upgrade-', 'hosted-native-package-upgrade', 'native-package-upgrade-summary-']
  ]) {
    const job = workflowJobBlock(workflow, jobId);
    assert.match(job, new RegExp(`CALIBRATE_HOSTED_EVIDENCE_OUTPUT: \\.codex-screenshots/native-hosted/${output}`));
    assert.match(
      job,
      /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
    );
    assert.match(job, /CALIBRATE_DISPOSABLE_SIGNING: "true"/);
    assert.match(job, new RegExp(`hosted-native-evidence\\.mjs init[\\s\\S]*--lane ${lane}[\\s\\S]*--source-commit "\\$CALIBRATE_SOURCE_COMMIT"`));
    assert.match(job, new RegExp(`name: ${artifact}\\$\\{\\{ github\\.run_id \\}\\}-\\$\\{\\{ github\\.run_attempt \\}\\}`));
    assert.match(job, new RegExp(`path: \\.codex-screenshots/native-hosted/${output}`));
    assert.match(job, new RegExp(`--gate ${gate}`));
    assert.match(job, new RegExp(`name: ${summary}\\$\\{\\{ github\\.run_id \\}\\}-\\$\\{\\{ github\\.run_attempt \\}\\}`));
    assert.match(job, /if: always\(\)[\s\S]*actions\/upload-artifact@v4/);
    assert.match(job, /retention-days: 90/);
  }
});

test('PR and release workflows rehearse v0.14.0 upgrade and encrypted rollback before launch', () => {
  const pullRequest = workflowJobBlock(readWorkflow('database-upgrade.yml'), 'release-upgrade-rollback');
  const release = readWorkflow('cut-release.yml');
  const releaseRollback = workflowJobBlock(release, 'database-rollback');
  const releaseFinalize = workflowJobBlock(release, 'finalize');

  assert.match(pullRequest, /fetch-depth: 0/);
  assert.match(
    pullRequest,
    /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
  );
  assert.match(pullRequest, /name: postgres-rollback-smoke-summary-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(pullRequest, /--gate hosted-database-upgrade-rollback/);
  assert.match(releaseRollback, /CALIBRATE_SOURCE_COMMIT: \$\{\{ needs\.prepare\.outputs\.release_sha \}\}/);
  for (const job of [pullRequest, releaseRollback]) {
    assert.match(job, /npm run test:db:rollback:unit/);
    assert.match(job, /npm run test:db:rollback/);
    assert.match(job, /path: \.codex-screenshots\/postgres-rollback-smoke\/result\.json/);
    assert.match(job, /retention-days: 30/);
  }
  assert.match(releaseFinalize, /needs: \[prepare, release-validation, ux-regression, database-rollback\]/);
  assert.ok(release.indexOf('  database-rollback:') < release.indexOf('Atomically merge the exact release pull request'));
});

test('release acceptance workflow separates implementation from external evidence-only launch', () => {
  const workflow = readWorkflow('release-acceptance.yml');
  const implementation = workflowJobBlock(workflow, 'implementation-contract');
  const external = workflowJobBlock(workflow, 'external-launch');

  assert.match(implementation, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(implementation, /npm\.cmd run release:acceptance/);
  assert.match(implementation, /retention-days: 90/);
  assert.match(external, /ref: \$\{\{ inputs\.evidence_commit \|\| github\.sha \}\}/);
  assert.match(external, /CALIBRATE_RELEASE_CANDIDATE: \$\{\{ inputs\.candidate_commit \}\}/);
  assert.match(workflow, /actions: read/);
  assert.match(external, /CALIBRATE_RELEASE_EVIDENCE: \$\{\{ inputs\.evidence_commit \}\}/);
  assert.match(external, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(external, /run: node scripts\/dependency-advisory-exceptions\.mjs --strict/);
  assert.match(external, /run: npm\.cmd run release:acceptance:external/);
  assert.match(external, /run: npm\.cmd run test:risk-evidence:release/);
  for (const runStep of external.split(/\n(?=\s+- name:)/).filter((step) => /\n\s+run:/.test(step))) {
    assert.doesNotMatch(runStep, /\$\{\{\s*inputs\./, 'workflow inputs must not be interpolated into shell text');
  }
  assert.doesNotMatch(workflow, /pull_request_target|continue-on-error/);
});
