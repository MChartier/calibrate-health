import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDirectory = path.join(repositoryRoot, '.github', 'workflows');
const readWorkflow = (name) => readFileSync(path.join(workflowsDirectory, name), 'utf8');

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
test('master merges publish only when the reviewed manifest version advances', () => {
  const workflow = readWorkflow('cut-release.yml');

  assertWindowsUxJob(workflow);
  assert.match(workflow, /publish:\s*\n\s+needs: \[ux-regression, database-rollback\]/);
  assert.ok(workflow.indexOf('  ux-regression:') < workflow.indexOf('git tag -a'));

  assert.match(workflow, /push:\s*\n\s+branches: \[master\]/);
  assert.match(workflow, /node scripts\/release-config\.mjs plan/);
  assert.match(workflow, /npm run release:check:container/);
  assert.doesNotMatch(workflow, /npm run release:check:production/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /build_release_image:/);
  assert.match(workflow, /needs: publish/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/container\.yml/);
  assert.match(workflow, /release_tag: \$\{\{ needs\.publish\.outputs\.release_tag \}\}/);
  assert.match(workflow, /publish_latest: true/);
  assert.doesNotMatch(workflow, /createWorkflowDispatch|workflow_id:/);
});

test('pull requests run the reviewed Windows UX gate and retain sanitized evidence', () => {
  const workflow = readWorkflow('builds.yml');

  assertWindowsUxJob(workflow);
  assert.match(workflow, /on:\s*\n\s+pull_request:/);
});

test('pull requests run hosted Android, Wear release, and two-emulator package upgrade gates', () => {
  const workflow = readWorkflow('builds.yml');
  const packageConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const mobileBuild = workflowJobBlock(workflow, 'mobile-build');
  const android = workflowJobBlock(workflow, 'android-emulator-e2e');
  const wear = workflowJobBlock(workflow, 'wear-release-emulator-smoke');
  const upgrade = workflowJobBlock(workflow, 'native-package-upgrade');

  assert.match(packageConfig.scripts['test:native-release'], /hosted-native-emulators\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /hosted-android-e2e\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /native-upgrade-rehearsal\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /wear-build-task-guard\.test\.mjs/);

  assert.match(workflow, /Share Android debug APK with emulator E2E/);
  assert.match(
    mobileBuild,
    /name: android-debug-apk-\$\{\{ github\.event\.pull_request\.head\.sha \}\}[\s\S]*overwrite: true/,
  );
  assert.match(android, /name: android-debug-apk-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(mobileBuild, /android-debug-apk-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.doesNotMatch(android, /android-debug-apk-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(android, /needs: mobile-build/);
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
  assert.match(upgrade, /--baseline "\$\{\{ github\.event\.pull_request\.base\.sha \}\}"/);
  assert.match(upgrade, /--candidate "\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}"/);
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
  assert.match(upgrade, /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(upgrade, /hosted-native-evidence\.mjs init/);
  assert.match(upgrade, /path: \.codex-screenshots\/native-hosted\/upgrade\.json/);
  assert.match(upgrade, /retention-days: 90/);
  assert.doesNotMatch(upgrade.match(/Upload sanitized two-emulator upgrade evidence[\s\S]*$/)?.[0] ?? '', /native-upgrade\.json/);

  const hostedJobs = `${android}\n${wear}\n${upgrade}`;
  assert.doesNotMatch(hostedJobs, /secrets\.|EXPO_TOKEN|test:risk-evidence:release|workflow_dispatch|physical/i);
  assert.doesNotMatch(hostedJobs, /continue-on-error/);
  assert.throws(() => workflowJobBlock(workflow, 'android.*'), /literal safe identifier/);
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

test('dependency audit isolates the exact root exception while backend remains unfiltered', () => {
  const workflow = readWorkflow('dependency-audit.yml');

  assert.match(workflow, /if: matrix\.directory != '\.'/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /if: matrix\.directory == '\.'/);
  assert.match(workflow, /npm run audit:production/);
  assert.match(workflow, /npm run audit:exceptions:check/);
  assert.match(workflow, /name: dependency-audit-\$\{\{ matrix\.evidence \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /--job "production-audit-\$\{\{ matrix\.evidence \}\}"/);
});

test('container scan retains a candidate-bound acceptance summary', () => {
  const workflow = readWorkflow('container-scan.yml');
  assert.match(workflow, /--gate hosted-container-scan/);
  assert.match(workflow, /name: container-scan-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /retention-days: 90/);
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
    assert.match(job, /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
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

  assert.match(pullRequest, /fetch-depth: 0/);
  assert.match(pullRequest, /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(pullRequest, /name: postgres-rollback-smoke-summary-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(pullRequest, /--gate hosted-database-upgrade-rollback/);
  assert.match(releaseRollback, /CALIBRATE_SOURCE_COMMIT: \$\{\{ github\.sha \}\}/);
  for (const job of [pullRequest, releaseRollback]) {
    assert.match(job, /npm run test:db:rollback:unit/);
    assert.match(job, /npm run test:db:rollback/);
    assert.match(job, /path: \.codex-screenshots\/postgres-rollback-smoke\/result\.json/);
    assert.match(job, /retention-days: 30/);
  }
  assert.match(release, /publish:\s*\n\s+needs: \[ux-regression, database-rollback\]/);
  assert.ok(release.indexOf('  database-rollback:') < release.indexOf('git tag -a'));
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
  assert.match(external, /run: npm\.cmd run release:acceptance:external/);
  assert.match(external, /run: npm\.cmd run test:risk-evidence:release/);
  for (const runStep of external.split(/\n(?=\s+- name:)/).filter((step) => /\n\s+run:/.test(step))) {
    assert.doesNotMatch(runStep, /\$\{\{\s*inputs\./, 'workflow inputs must not be interpolated into shell text');
  }
  assert.doesNotMatch(workflow, /pull_request_target|continue-on-error/);
});
