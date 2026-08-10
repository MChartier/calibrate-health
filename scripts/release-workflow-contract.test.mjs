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
  assert.match(workflow, /publish:\s*\n\s+needs: ux-regression/);
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
  const android = workflowJobBlock(workflow, 'android-emulator-e2e');
  const wear = workflowJobBlock(workflow, 'wear-release-emulator-smoke');
  const upgrade = workflowJobBlock(workflow, 'native-package-upgrade');

  assert.match(packageConfig.scripts['test:native-release'], /hosted-native-emulators\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /hosted-android-e2e\.test\.mjs/);
  assert.match(packageConfig.scripts['test:native-release'], /native-upgrade-rehearsal\.test\.mjs/);

  assert.match(workflow, /Share Android debug APK with emulator E2E/);
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
  assert.match(wear, /target: android-wear/);
  assert.match(wear, /npm run test:wear:emulator/);
  assert.match(wear, /WEAR_BUILD_TYPE: release/);

  assert.match(upgrade, /fetch-depth: 0/);
  assert.match(upgrade, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(upgrade, /hosted-native-emulators\.mjs prepare-wear/);
  assert.match(upgrade, /hosted-native-emulators\.mjs start-wear/);
  assert.match(upgrade, /hosted-native-emulators\.mjs wait-wear/);
  assert.match(upgrade, /hosted-native-emulators\.mjs stop-wear/);
  assert.match(upgrade, /--baseline "\$\{\{ github\.event\.pull_request\.base\.sha \}\}"/);
  assert.match(upgrade, /--candidate "\$\{\{ github\.event\.pull_request\.head\.sha \}\}"/);
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
  assert.doesNotMatch(upgrade, /upload-artifact/);

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
});
