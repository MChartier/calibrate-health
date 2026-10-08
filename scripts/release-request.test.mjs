import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runReleaseRequestCli, verifyReleaseRequest, verifyReleaseRequestArtifact } from './release-request.mjs';

const context = Object.freeze({
  operation: 'server-release',
  repository: 'MChartier/calibrate-health',
  repositoryId: '123456',
  runId: '987654',
  runAttempt: '2',
  headBranch: 'master',
  headSha: 'a'.repeat(40)
});

test('unified manual requests bind exact profiles and real JSON confirmations', () => {
  const expected = { ...context, operation: 'unified-release' };
  const inputs = { profile: 'production', server_bump: 'patch', plan_only: true, confirm_play_console_clean: false };
  const value = request({ operation: expected.operation, inputs });
  assert.deepEqual(verifyReleaseRequest(value, expected), { operation: 'unified-release', ...inputs });
  for (const changed of [{ plan_only: 'false' }, { confirm_play_console_clean: 1 }, { profile: 'arbitrary' },
    { server_bump: 'latest' }, { endpoint: 'https://unselected.invalid' }]) {
    assert.throws(() => verifyReleaseRequest({ ...value, inputs: { ...inputs, ...changed } }, expected));
  }
});

test('unified server requests are exact planner-bound selections and always suppress downstream work', () => {
  const expected = { ...context, operation: 'unified-server-release' };
  const inputs = { server: true, source_commit: 'b'.repeat(40), bump: 'patch', plan_digest: 'c'.repeat(64), parent_run_id: '42' };
  const value = request({ operation: expected.operation, inputs });
  assert.deepEqual(verifyReleaseRequest(value, expected), { operation: 'cut-release', source_sha: inputs.source_commit,
    bump: 'patch', plan_digest: inputs.plan_digest, parent_run_id: '42', selective: true });
  assert.equal(verifyReleaseRequest({ ...value, inputs: { ...inputs, server: false } }, expected).operation, 'no-server');
  for (const changed of [{ server: 'true' }, { source_commit: 'master' }, { plan_digest: 'mutable' }, { deploy: true }]) {
    assert.throws(() => verifyReleaseRequest({ ...value, inputs: { ...inputs, ...changed } }, expected));
  }
  assert.throws(() => verifyReleaseRequest(value, context), /triggering workflow/);
});

function request(overrides = {}) {
  return {
    schema_version: 1,
    operation: context.operation,
    repository: context.repository,
    repository_id: context.repositoryId,
    request_run_id: context.runId,
    request_run_attempt: context.runAttempt,
    head_branch: context.headBranch,
    head_sha: context.headSha,
    inputs: {
      operation: 'resume',
      release_tag: 'v0.35.0',
      release_commit: 'b'.repeat(40),
      publish_latest: false
    },
    ...overrides
  };
}

function artifact(t, value = request()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-release-request-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'request.json'), `${JSON.stringify(value)}\n`);
  return directory;
}

test('server request normalizes the five selections into exact worker-specific inputs', () => {
  assert.deepEqual(verifyReleaseRequest(request(), context), {
    operation: 'publish-prepared-release',
    release_branch: 'release/v0.35.0',
    release_commit: 'b'.repeat(40)
  });
  for (const operation of ['patch', 'minor', 'major']) {
    assert.deepEqual(verifyReleaseRequest(request({
      inputs: { operation, release_commit: '', release_tag: '', publish_latest: false }
    }), context), { operation: 'cut-release', bump: operation });
  }
  for (const publish_latest of [false, true]) {
    assert.deepEqual(verifyReleaseRequest(request({
      inputs: { ...request().inputs, operation: 'image-only', publish_latest }
    }), context), {
      operation: 'build-release-image', publish_latest, release_commit: 'b'.repeat(40), release_tag: 'v0.35.0'
    });
  }
});

test('server requests reject extra fields, invalid selections, and ignored recovery options', () => {
  assert.throws(() => verifyReleaseRequest({ ...request(), extra: true }, context), /contain exactly/);
  const invalidInputs = [
    { ...request().inputs, extra: true },
    { ...request().inputs, release_commit: 'HEAD' },
    { ...request().inputs, release_tag: 'latest' },
    { ...request().inputs, publish_latest: 'false' },
    { ...request().inputs, operation: 'deploy' },
    { ...request().inputs, publish_latest: true },
    { ...request().inputs, operation: 'patch' },
    { operation: 'minor', release_commit: '', release_tag: '', publish_latest: true },
    { operation: 'major', release_commit: '', release_tag: null, publish_latest: false },
    { operation: 'image-only', release_commit: '', release_tag: '', publish_latest: false }
  ];
  for (const inputs of invalidInputs) {
    assert.throws(() => verifyReleaseRequest(request({ inputs }), context));
  }
  assert.throws(() => verifyReleaseRequest(request({ operation: 'build-release-image' }), {
    ...context, operation: 'build-release-image'
  }), /Unsupported release request operation/);
});

test('release requests bind repository, run, attempt, ref, SHA, and operation to the trigger', () => {
  for (const [name, value] of [
    ['repository', 'Other/repository'],
    ['repository_id', '999'],
    ['request_run_id', '1'],
    ['request_run_attempt', '1'],
    ['head_branch', 'feature'],
    ['head_sha', 'd'.repeat(40)],
    ['operation', 'cut-release']
  ]) {
    assert.throws(() => verifyReleaseRequest(request({ [name]: value }), context), /does not match/);
  }
});

test('release request artifacts reject missing, extra, nested, oversized, and malformed files', (t) => {
  const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-release-request-missing-'));
  t.after(() => fs.rmSync(missing, { recursive: true, force: true }));
  assert.throws(() => verifyReleaseRequestArtifact({ artifactDirectory: missing, ...context }), /exactly one regular/);
  const directory = artifact(t);
  assert.deepEqual(verifyReleaseRequestArtifact({ artifactDirectory: directory, ...context }), verifyReleaseRequest(request(), context));
  fs.writeFileSync(path.join(directory, 'extra.json'), '{}');
  assert.throws(() => verifyReleaseRequestArtifact({ artifactDirectory: directory, ...context }), /exactly one regular/);
  fs.rmSync(path.join(directory, 'extra.json'));
  fs.writeFileSync(path.join(directory, 'request.json'), 'x'.repeat(4097));
  assert.throws(() => verifyReleaseRequestArtifact({ artifactDirectory: directory, ...context }), /at most 4096/);
  fs.writeFileSync(path.join(directory, 'request.json'), '{x');
  assert.throws(() => verifyReleaseRequestArtifact({ artifactDirectory: directory, ...context }), /not valid JSON/);
  fs.rmSync(path.join(directory, 'request.json'));
  fs.mkdirSync(path.join(directory, 'request.json'));
  assert.throws(() => verifyReleaseRequestArtifact({ artifactDirectory: directory, ...context }), /exactly one regular/);
});

test('release request artifacts reject symbolic links when supported', (t) => {
  const directory = artifact(t);
  const target = `${directory}-target.json`;
  t.after(() => fs.rmSync(target, { force: true }));
  fs.renameSync(path.join(directory, 'request.json'), target);
  try {
    fs.symlinkSync(target, path.join(directory, 'request.json'));
  } catch (error) {
    if (error.code === 'EPERM') return;
    throw error;
  }
  assert.throws(() => verifyReleaseRequestArtifact({ artifactDirectory: directory, ...context }), /exactly one regular/);
});

test('request CLI writes only validated worker routing and primitive inputs', (t) => {
  for (const operation of ['patch', 'minor', 'major', 'resume', 'image-only']) {
    const value = request({ inputs: ['resume', 'image-only'].includes(operation)
      ? { ...request().inputs, operation }
      : { operation, release_commit: '', release_tag: '', publish_latest: false }
    });
    const directory = artifact(t, value);
    const output = `${directory}-output`;
    t.after(() => fs.rmSync(output, { force: true }));
    const args = [
      'verify', '--artifact-directory', directory, '--operation', context.operation,
      '--repository', context.repository, '--repository-id', context.repositoryId,
      '--run-id', context.runId, '--run-attempt', context.runAttempt,
      '--head-branch', context.headBranch, '--head-sha', context.headSha, '--github-output', output
    ];
    runReleaseRequestCli(args);
    const expected = Object.entries(verifyReleaseRequest(value, context))
      .map(([key, value]) => `${key}=${value}\n`).join('');
    assert.equal(fs.readFileSync(output, 'utf8'), expected);
    fs.rmSync(output);
    value.inputs.release_commit = 'HEAD\noperation=cut-release';
    fs.writeFileSync(path.join(directory, 'request.json'), JSON.stringify(value));
    assert.throws(() => runReleaseRequestCli(args));
    assert.equal(fs.existsSync(output), false, 'Invalid input must not emit even partial routing outputs');
  }
});
