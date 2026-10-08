import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateDocuments, candidateRequest, verifyUnifiedCandidate, CANDIDATE_INPUTS, CANDIDATE_MARKER } from './release-candidate.mjs';
import { hash } from './release-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originals = Object.fromEntries(CANDIDATE_INPUTS.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
const source = 'a'.repeat(40), commit = 'b'.repeat(40);
const request = { schema: 1, runId: '10', planDigest: hash('plan'), source, android: false, ios: false, serverBump: null };

for (const [android, ios, serverBump] of [[true, false, null], [false, true, null], [false, false, 'patch'], [true, true, 'patch']]) {
  test(`exact metadata reconstruction android=${android} ios=${ios} server=${serverBump}`, async () => {
    const wanted = { ...request, android, ios, serverBump }, documents = await candidateDocuments(originals, wanted);
    const final = { ...originals, ...documents };
    const before = JSON.parse(originals['shared/release.json']), after = JSON.parse(final['shared/release.json']);
    assert.equal(after.android.mobile.version_code, before.android.mobile.version_code + (android ? 2 : 0));
    assert.equal(after.android.wear.version_code, before.android.wear.version_code + (android ? 2 : 0));
    assert.equal(Number(JSON.parse(final['shared/ios-release.json']).buildNumber), Number(JSON.parse(originals['shared/ios-release.json']).buildNumber) + (ios ? 1 : 0));
    const git = args => {
      if (args[0] === 'rev-list') return `${commit} ${source}\n`;
      if (args[0] === 'diff-tree') return Object.keys(documents).map(name => `${name === CANDIDATE_MARKER ? 'A' : 'M'}\t${name}`).join('\n');
      if (args[0] === 'show') {
        const [revision, name] = args[1].split(':'); return (revision === source ? originals : final)[name];
      }
      throw Error('Unexpected Git command');
    };
    const result = await verifyUnifiedCandidate({ root, parent: source, commit, request: wanted, git });
    assert.deepEqual(result.paths, Object.keys(documents).sort());
    // A synchronized extra change in an allowed file cannot ride along with metadata.
    final['mobile/app.json'] = final['mobile/app.json'].replace('calibrate-health-app', 'unreviewed-app');
    if (documents['mobile/app.json']) await assert.rejects(verifyUnifiedCandidate({ root, parent: source, commit, request: wanted, git }), /noncanonical bytes/);
    await assert.rejects(verifyUnifiedCandidate({ root, parent: source, commit, request: { ...wanted, runId: '11' }, git }), /immutable plan/);
  });
}

test('candidate request rejects an empty allocation and unknown authority fields', () => {
  assert.throws(() => candidateRequest(request), /OTA-only/);
  assert.throws(() => candidateRequest({ ...request, ios: true, bypassCi: true }), /Unexpected/);
});

test('candidate verification rejects merge parents before reading candidate files', async () => {
  await assert.rejects(verifyUnifiedCandidate({ root, parent: source, commit, git: () => `${commit} ${source} ${'c'.repeat(40)}` }), /pinned source parent/);
});
