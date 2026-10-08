import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { verifyPublishedImage } from './release-image.mjs';

function fixture() {
  const repository = 'example/app', source = 'a'.repeat(40), signer = 'b'.repeat(40), digest = `sha256:${'c'.repeat(64)}`;
  const uri = `https://github.com/${repository}`, calls = [];
  const certificate = { buildSignerDigest: signer, sourceRepositoryDigest: signer, buildConfigDigest: signer, githubWorkflowSHA: signer,
    buildSignerURI: `${uri}/.github/workflows/container.yml@refs/heads/master`,
    buildConfigURI: `${uri}/.github/workflows/cut-release-handler.yml@refs/heads/master`, buildTrigger: 'workflow_run',
    sourceRepositoryURI: uri, sourceRepositoryRef: 'refs/heads/master', runnerEnvironment: 'github-hosted' };
  const manifest = { schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { digest: `sha256:${'d'.repeat(64)}`, mediaType: 'application/vnd.oci.image.config.v1+json' }, layers: [] };
  let moved = false, tags = 0;
  const args = { root: '.', repository, releaseCommit: source, releaseTag: 'v1.2.3', expectedDigest: digest,
    currentWorkflowRevision: signer, trustedMasterCommit: signer,
    verifyPrepared: async value => { assert.equal(value.expectedCommit, source); calls.push('candidate'); },
    authorize: value => { assert.equal(value.candidateWorkflowRevision, signer); calls.push('policy'); },
    execute: (command, parameters) => {
      calls.push([command, parameters]);
      if (command === 'git') return `allow ${signer}\n`;
      if (command === 'docker') {
        if (parameters.includes('--raw')) return JSON.stringify(manifest);
        if (parameters.includes('{{json .Image}}')) return JSON.stringify({ os: 'linux', architecture: 'amd64' });
        tags++; return moved && tags > 1 ? `sha256:${'e'.repeat(64)}` : digest;
      }
      if (command === 'gh') {
        const receipt = JSON.parse(fs.readFileSync(parameters[2]));
        assert.equal(receipt.image_config_digest, manifest.config.digest);
        assert.equal(receipt.release_commit, source);
        return parameters.includes('--format') ? JSON.stringify([{ verificationResult: { signature: { certificate } } }]) : '';
      }
      throw Error('Unexpected command');
    } };
  return { args, calls, certificate, manifest, move: () => { moved = true; } };
}
test('image admission retains exact prepared-tree, config digest, attestation and current signer policy checks', async () => {
  const f = fixture(), receipt = await verifyPublishedImage(f.args);
  assert.equal(receipt.source, f.args.releaseCommit); assert.equal(receipt.artifactSha256, f.args.expectedDigest.slice(7));
  assert.equal(receipt.image, `ghcr.io/example/calibratehealth@${f.args.expectedDigest}`);
  assert.equal(f.calls[0], 'candidate'); assert(f.calls.includes('policy'));
  const verified = f.calls.find(call => Array.isArray(call) && call[0] === 'gh' && call[1].includes('--signer-digest'));
  assert(verified[1].includes('--deny-self-hosted-runners')); assert(verified[1].includes('--source-digest'));
});
test('image admission rejects changed tags, multi-platform manifests, unrelated and revoked signers', async () => {
  const moved = fixture(); moved.move(); await assert.rejects(verifyPublishedImage(moved.args), /changed during/);
  const multi = fixture(); multi.manifest.mediaType = 'application/vnd.oci.image.index.v1+json';
  await assert.rejects(verifyPublishedImage(multi.args), /multi-platform/);
  const unrelated = fixture(); unrelated.certificate.sourceRepositoryURI = 'https://github.com/other/app';
  await assert.rejects(verifyPublishedImage(unrelated.args));
  const revoked = fixture(); revoked.args.authorize = () => { throw Error('revoked'); };
  await assert.rejects(verifyPublishedImage(revoked.args), /no receipt/);
});
