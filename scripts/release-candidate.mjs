import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkRepository, prepareServerRelease, prepareLocalInternalNativeRelease } from './release-config.mjs';
import { prepareIosVersion } from './ios-release.mjs';
import { SHA, DIGEST, bytes } from './release-plan.mjs';

export const CANDIDATE_MARKER = '.github/unified-release-candidate.json';
export const CANDIDATE_INPUTS = Object.freeze([
  'shared/release.json', 'shared/ios-release.json', 'shared/client-diagnostic-versions.json',
  'package.json', 'package-lock.json', 'backend/package.json', 'backend/package-lock.json',
  'mobile/package.json', 'mobile/app.json', 'mobile/eas.json',
  'mobile/modules/wear-pairing/package.json', 'mobile/modules/wear-pairing/android/build.gradle',
  'wear/app/build.gradle.kts', 'docs/openapi/v1.yaml', 'packages/api-client/src/generated/v1.ts'
]);

export function candidateRequest(value) {
  assert(value && Object.keys(value).sort().join() === 'android,ios,planDigest,runId,schema,serverBump,source', 'Unexpected candidate fields.');
  assert(value.schema === 1 && SHA.test(value.source) && DIGEST.test(value.planDigest) && /^[1-9]\d*$/.test(value.runId), 'Invalid candidate identity.');
  assert(typeof value.android === 'boolean' && typeof value.ios === 'boolean' &&
    [null, 'patch', 'minor', 'major'].includes(value.serverBump), 'Invalid candidate allocations.');
  assert(value.android || value.ios || value.serverBump, 'An OTA-only plan must not create a version candidate.');
  return value;
}

/** Reconstruct metadata using maintained trusted workers, never code from the candidate tree. */
export async function candidateDocuments(originals, request) {
  candidateRequest(request);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-release-metadata-'));
  try {
    for (const name of CANDIDATE_INPUTS) {
      assert(typeof originals[name] === 'string', `Missing candidate input: ${name}`);
      fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
      fs.writeFileSync(path.join(directory, name), originals[name]);
    }
    assert.deepEqual((await checkRepository(directory)).errors, [], 'Source release mirrors are inconsistent.');
    // These are deterministic local transformations. Provider/tag/CI authority is required separately before publication.
    if (request.android) await prepareLocalInternalNativeRelease({ root: directory, bump: 'patch' });
    if (request.ios) prepareIosVersion(directory);
    if (request.serverBump) await prepareServerRelease({ root: directory, bump: request.serverBump,
      latestTag: `v${JSON.parse(originals['shared/release.json']).server.version}` });
    assert.deepEqual((await checkRepository(directory)).errors, [], 'Prepared release mirrors are inconsistent.');
    const documents = Object.fromEntries(CANDIDATE_INPUTS.map(name => [name, fs.readFileSync(path.join(directory, name), 'utf8')])
      .filter(([name, content]) => content !== originals[name]));
    documents[CANDIDATE_MARKER] = bytes(request).toString('utf8');
    return documents;
  } finally {
    // The only recursively removed path is the exact fresh task-owned mkdtemp directory.
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export function candidateGit(root, execute = execFileSync) {
  return args => execute('git', ['--no-replace-objects', '-c', 'core.quotepath=false', ...args],
    { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}

/** Every changed byte and path must be the deterministic transform of the sole pinned parent. */
export async function verifyUnifiedCandidate({ root, commit, parent, request, git = candidateGit(root) }) {
  assert(SHA.test(commit) && SHA.test(parent), 'Candidate verification requires exact commit identities.');
  const parents = git(['rev-list', '--parents', '-n', '1', commit]).trim().split(/\s+/);
  assert.deepEqual(parents, [commit, parent], 'Candidate does not have exactly the pinned source parent.');
  const marker = git(['show', `${commit}:${CANDIDATE_MARKER}`]);
  const observed = candidateRequest(JSON.parse(marker));
  assert.equal(marker, bytes(observed).toString('utf8'), 'Candidate marker has noncanonical bytes.');
  assert.equal(observed.source, parent, 'Candidate marker source differs from its parent.');
  if (request) assert.deepEqual(observed, request, 'Candidate differs from its immutable plan request.');
  const originals = Object.fromEntries(CANDIDATE_INPUTS.map(name => [name, git(['show', `${parent}:${name}`])]));
  const expected = await candidateDocuments(originals, observed);
  const entries = git(['diff-tree', '--no-commit-id', '--name-status', '-r', '--no-renames', parent, commit]).trim().split(/\r?\n/);
  const paths = entries.map(line => {
    const match = /^([AM])\t(.+)$/.exec(line);
    assert(match && (match[1] === 'M' || match[2] === CANDIDATE_MARKER), 'Candidate contains deletions, renames or unexpected additions.');
    return match[2];
  });
  assert.deepEqual(paths.sort(), Object.keys(expected).sort(), 'Candidate changed paths differ from reconstructed metadata.');
  for (const [name, content] of Object.entries(expected)) {
    assert.equal(git(['show', `${commit}:${name}`]), content, `Candidate has noncanonical bytes in ${name}.`);
  }
  return { source: parent, commit, request: observed, paths };
}
