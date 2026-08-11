import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDirectory = path.join(repositoryRoot, '.github', 'workflows');
const readWorkflow = (name) => readFileSync(path.join(workflowsDirectory, name), 'utf8');

test('master merges publish only when the reviewed manifest version advances', () => {
  const workflow = readWorkflow('cut-release.yml');

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
