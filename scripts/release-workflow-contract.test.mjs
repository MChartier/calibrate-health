import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDirectory = path.join(repositoryRoot, '.github', 'workflows');
const readWorkflow = (name) => readFileSync(path.join(workflowsDirectory, name), 'utf8')
  .replaceAll('\r\n', '\n');

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

function assertPathFilterOutputs(job, outputNames, stepId = 'filter') {
  assert.match(job, /pull-requests: read/);
  assert.match(job, /uses: dorny\/paths-filter@v3/);
  for (const outputName of outputNames) {
    assert.match(outputName, /^[a-z_]+$/);
    const expression = outputName + ': ' + '${{ steps.' + stepId + '.outputs.' + outputName + ' }}';
    assert.ok(job.includes(expression), `classifier must publish ${expression}`);
  }
}

test('manual release preparation validates the exact candidate container before merging its release PR', () => {
  const workflow = readWorkflow('cut-release.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const prepare = workflowJobBlock(workflow, 'prepare');
  const validation = workflowJobBlock(workflow, 'release-validation');
  const rollback = workflowJobBlock(workflow, 'database-rollback');
  const finalize = workflowJobBlock(workflow, 'finalize');
  const cleanup = workflowJobBlock(workflow, 'cleanup-candidate');
  const publish = workflowJobBlock(workflow, 'publish');

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
  assert.match(prepare, /git diff --quiet "\$\{LATEST_TAG\}" "\$\{SOURCE_SHA\}" -- backend\/prisma\/migrations/);
  assert.match(prepare, /database_migrations_changed=\$\{DATABASE_MIGRATIONS_CHANGED\}/);
  assert.match(prepare, /BRANCH="release\/\$\{TAG\}"/);
  assert.match(prepare, /git commit -m "Prepare release \$\{TAG\}"/);
  assert.match(prepare, /git push --set-upstream origin/);

  assert.match(validation, /ref: \$\{\{ needs\.prepare\.outputs\.release_sha \}\}/);
  assert.match(validation, /test "\$\(git rev-parse HEAD\)" = "\$\{\{ needs\.prepare\.outputs\.release_sha \}\}"/);
  assert.match(validation, /node scripts\/release-config\.mjs check/);
  assert.match(validation, /npm run test:release/);
  assert.match(validation, /npm run test:expo-web:release/);
  assert.match(validation, /npm run test:deploy/);
  assert.match(validation, /npm run api:contract:check/);
  assert.match(validation, /git diff --exit-code/);
  assert.match(validation, /docker build --file Dockerfile\.app --tag calibrate:release-candidate \./);
  assert.match(validation, /docker run --detach --name calibrate-release-smoke --network host/);
  assert.match(validation, /http:\/\/127\.0\.0\.1:3000\/api\/v1\/readyz/);
  assert.match(validation, /npm run test:container:web -- http:\/\/127\.0\.0\.1:3000/);
  assert.match(validation, /uses: aquasecurity\/trivy-action@[0-9a-f]{40}/);
  assert.match(validation, /severity: HIGH,CRITICAL/);
  assert.match(validation, /exit-code: '1'/);
  assert.doesNotMatch(validation, /test:ux|test:performance:web|hosted-result/);
  assert.doesNotMatch(workflow, /npm run release:check:production/);
  assert.doesNotMatch(packageConfig.scripts['release:check:container'], /--strict/);
  assert.match(packageConfig.scripts['release:check:production'], /--strict/);

  assert.match(rollback, /if: needs\.prepare\.outputs\.database_migrations_changed == 'true'/);
  assert.match(rollback, /ref: \$\{\{ needs\.prepare\.outputs\.release_sha \}\}/);
  assert.match(rollback, /npm run test:db:rollback:unit/);
  assert.match(rollback, /npm run test:db:rollback/);
  assert.doesNotMatch(rollback, /upload-artifact|hosted-result/);

  assert.match(finalize, /needs: \[prepare, release-validation, database-rollback\]/);
  assert.match(finalize, /needs\.release-validation\.result == 'success'/);
  assert.match(finalize, /needs\.database-rollback\.result == 'success'.*needs\.database-rollback\.result == 'skipped'/s);
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
  assert.doesNotMatch(workflow, /\n  ux-regression:/);
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
    'decision'
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
  const wearBuild = workflowJobBlock(workflow, 'wear-build');
  const android = workflowJobBlock(workflow, 'android-emulator-e2e');
  const wear = workflowJobBlock(workflow, 'wear-release-emulator-smoke');
  const upgrade = workflowJobBlock(workflow, 'native-package-upgrade');

  assert.match(packageConfig.scripts['test:native-release'], /hosted-native-emulators\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /hosted-android-e2e\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /native-upgrade-rehearsal\.test\.mjs/);
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
    'mobile/assets/adaptive-icon.png',
    'mobile/assets/icon.png',
    'mobile/assets/notification-icon.png',
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
  assert.match(
    runtime,
    /node \.\.\/node_modules\/expo\/bin\/cli export --platform android --output-dir "\$\{RUNNER_TEMP\}\/calibrate-android-export"/
  );
  assert.match(mobileBuild, /if: needs\.changes\.outputs\.native_package == 'true'/);
  assert.match(mobileBuild, /Build Android debug/);
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
    ['.github/workflows/tests.yml', ['release_config']],
    ['.github/workflows/builds.yml', ['release_config']],
    ['backend/src/routes/user.ts', ['backend']],
    ['shared/caloriePolicy.ts', ['backend', 'web', 'native_runtime']],
    ['mobile/src/components/AppCard.tsx', ['web', 'native_runtime']],
    ['mobile/test/jest.setup.ts', []],
    ['mobile/plugins/withHealthConnect.js', ['native_package']],
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
    const checkoutCount = (workflow.match(/uses: actions\/checkout@v4/g) ?? []).length;
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

test('PR rollback covers rehearsal inputs while Cut release follows migration diffs', () => {
  const pullRequestWorkflow = readWorkflow('database-upgrade.yml');
  const pullRequest = workflowJobBlock(pullRequestWorkflow, 'release-upgrade-rollback');
  const release = readWorkflow('cut-release.yml');
  const releasePrepare = workflowJobBlock(release, 'prepare');
  const releaseRollback = workflowJobBlock(release, 'database-rollback');
  const releaseFinalize = workflowJobBlock(release, 'finalize');

  assert.match(pullRequest, /if: needs\.changes\.outputs\.migrations == 'true'/);
  assert.match(pullRequest, /fetch-depth: 0/);
  assert.match(
    pullRequest,
    /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
  );
  assert.match(releasePrepare, /database_migrations_changed=\$\{DATABASE_MIGRATIONS_CHANGED\}/);
  assert.match(releaseRollback, /if: needs\.prepare\.outputs\.database_migrations_changed == 'true'/);
  assert.match(releaseRollback, /CALIBRATE_SOURCE_COMMIT: \$\{\{ needs\.prepare\.outputs\.release_sha \}\}/);
  for (const job of [pullRequest, releaseRollback]) {
    assert.match(job, /npm run test:db:rollback:unit/);
    assert.match(job, /npm run test:db:rollback/);
    assert.doesNotMatch(job, /upload-artifact|hosted-result|retention-days:/);
  }
  assert.match(releaseFinalize, /needs: \[prepare, release-validation, database-rollback\]/);
  assert.match(
    releaseFinalize,
    /needs\.database-rollback\.result == 'success'.*needs\.database-rollback\.result == 'skipped'/s
  );
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
