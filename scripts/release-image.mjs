import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateSingleAmd64Manifest } from './ghcr-release-policy.mjs';
import { serializeGhcrReleaseReceipt, parseGhcrAttestationWorkflowCandidates, authorizeGhcrReleaseWorkflow } from './ghcr-release-receipt.mjs';
import { verifyPreparedRelease } from './release-config.mjs';
import { SHA } from './release-plan.mjs';

/** Read-only image admission reuses the existing exact candidate, registry and signer authorities. */
export async function verifyPublishedImage({ root, repository, releaseCommit, releaseTag, expectedDigest,
  currentWorkflowRevision, trustedMasterCommit, ghPath = 'gh', execute = execFileSync, verifyPrepared = verifyPreparedRelease,
  authorize = authorizeGhcrReleaseWorkflow }) {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository) && SHA.test(releaseCommit) && /^v\d+\.\d+\.\d+$/.test(releaseTag) &&
    SHA.test(currentWorkflowRevision) && SHA.test(trustedMasterCommit) && /^sha256:[a-f0-9]{64}$/.test(expectedDigest), 'Image verification requires exact authority identities.');
  // This is the maintained container worker's image identity, not the Git repository's name.
  const image = `ghcr.io/${repository.split('/')[0].toLowerCase()}/calibratehealth`, exactRef = `${image}@${expectedDigest}`;
  const run = (command, args) => {
    try { return execute(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { throw Error('Image authority verification failed; no receipt admitted.'); }
  };
  await verifyPrepared({ root, releaseTag, expectedCommit: releaseCommit, publishLatest: false });
  const observed = run('docker', ['buildx', 'imagetools', 'inspect', '--format', '{{.Manifest.Digest}}', `${image}:${releaseTag}`]).trim();
  assert.equal(observed, expectedDigest, 'Immutable image tag moved from the recorded digest.');
  const manifest = JSON.parse(run('docker', ['buildx', 'imagetools', 'inspect', '--raw', exactRef]));
  const config = JSON.parse(run('docker', ['buildx', 'imagetools', 'inspect', '--format', '{{json .Image}}', exactRef]));
  const { configDigest } = validateSingleAmd64Manifest(manifest, config);
  const receiptBytes = serializeGhcrReleaseReceipt({ repository, ghcrImage: image, releaseTag, releaseCommit, imageConfigDigest: configDigest });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-image-receipt-'));
  try {
    const file = path.join(directory, 'receipt.json'); fs.writeFileSync(file, receiptBytes, { mode: 0o600 });
    const args = ['attestation', 'verify', file, '--repo', repository, '--signer-workflow', `${repository}/.github/workflows/container.yml`,
      '--source-ref', 'refs/heads/master', '--predicate-type', 'https://slsa.dev/provenance/v1', '--limit', '100', '--deny-self-hosted-runners'];
    const discovery = run(ghPath, [...args, '--format', 'json']);
    const candidates = parseGhcrAttestationWorkflowCandidates(discovery, repository);
    const trustSet = run('git', ['--no-replace-objects', 'show', `${trustedMasterCommit}:.github/release-image-attestation-trusted-workflow-shas`]);
    let signer;
    for (const candidateWorkflowRevision of candidates) {
      try {
        authorize({ repositoryRoot: root, trustSet, candidateWorkflowRevision, currentWorkflowRevision, trustedMasterCommit, releaseCommit });
        run(ghPath, [...args, '--signer-digest', candidateWorkflowRevision, '--source-digest', candidateWorkflowRevision]);
        signer = candidateWorkflowRevision; break;
      } catch { /* A revoked or unrelated certificate cannot admit this image; inspect the next verified certificate. */ }
    }
    assert(signer, 'Image has no receipt under the current protected-master signer policy.');
    const readback = run('docker', ['buildx', 'imagetools', 'inspect', '--format', '{{.Manifest.Digest}}', `${image}:${releaseTag}`]).trim();
    assert.equal(readback, expectedDigest, 'Immutable image tag changed during receipt verification.');
    return { source: releaseCommit, releaseTag, artifactSha256: expectedDigest.slice(7), image: exactRef,
      imageConfigDigest: configDigest, signer, receipt: JSON.parse(receiptBytes) };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
