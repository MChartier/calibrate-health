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
  assert.match(workflow, /workflow_id: 'container\.yml'/);
  assert.match(workflow, /ref: 'master'/);
  assert.match(workflow, /release_tag: '\$\{\{ steps\.version\.outputs\.new_tag \}\}'/);
});

test('release images use the current GHCR-only workflow with an explicit immutable tag', () => {
  const workflow = readWorkflow('container.yml');

  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /ref: \$\{\{ inputs\.release_tag \|\| github\.ref \}\}/);
  assert.match(workflow, /node scripts\/release-config\.mjs tag/);
  assert.match(workflow, /ghcr\.io/);
  assert.match(workflow, /platforms: linux\/amd64,linux\/arm64/);
  assert.doesNotMatch(workflow, /aws-actions|amazon-ecs|\bECR\b|\bECS\b|Deploy Staging|Deploy Prod/i);
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
