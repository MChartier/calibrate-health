import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bytes, hash, SHA, DIGEST } from './release-plan.mjs';
import { candidateGit } from './release-candidate.mjs';
import { parseGhcrReleaseWorkflowTrustSet } from './ghcr-release-receipt.mjs';

export const IOS_RECEIPT_CRITICAL_PATHS = Object.freeze([
  '.github/workflows/unified-release.yml', '.github/workflows/unified-release-handler.yml',
  '.github/workflows/native-ios-release.yml', 'scripts/unified-release.mjs',
  '.github/workflows/unified-ota-release.yml', 'scripts/release-ota-worker.mjs',
  'scripts/release-ota-provider.mjs', 'scripts/ios-ota-artifact.mjs', 'scripts/expo-ota-artifact.mjs',
  'scripts/release-baselines.mjs', 'scripts/release-image.mjs', 'scripts/release-server-handoff.mjs',
  'scripts/release-retirement-github.mjs', 'scripts/native-play-receipt.mjs',
  'scripts/release-controller.mjs', 'scripts/release-snapshot.mjs',
  'scripts/release-ios-worker.mjs', 'scripts/release-ios-receipt.mjs', 'scripts/release-providers.mjs',
  'scripts/ios-release.mjs', 'scripts/ios-artifact.mjs', 'scripts/release-source.mjs',
  'scripts/release-candidate.mjs', 'scripts/release-config.mjs', 'scripts/release-plan.mjs',
  'scripts/release-build-config.mjs', 'scripts/release-inputs.mjs', 'scripts/release-operation.mjs',
  'scripts/release-journal.mjs', 'scripts/release-github.mjs', 'scripts/release-ci-gate.mjs',
  'scripts/release-request.mjs', 'scripts/release-retirement.mjs', 'scripts/release-runner.mjs',
  'scripts/native-ota-update.mjs', 'scripts/native-ota-contract.mjs', 'scripts/native-tag-attestation.mjs',
  'scripts/ghcr-release-receipt.mjs', 'scripts/ghcr-release-policy.mjs', 'tools/eas-cli/package.json', 'tools/eas-cli/package-lock.json'
]);
const TRUST_FILE = '.github/ios-release-attestation-trusted-workflow-shas';

export function iosReceipt(value) {
  assert(value && Object.keys(value).sort().join() === ['schema', 'kind', 'platform', 'source', 'workflowSha', 'planDigest',
    'configuration', 'input', 'bundleInput', 'artifactSha256', 'buildId', 'profile', 'runtime'].sort().join(), 'Unexpected iOS receipt fields.');
  assert(value?.schema === 1 && value.kind === 'native' && value.platform === 'ios' &&
    SHA.test(value.source) && SHA.test(value.workflowSha) && DIGEST.test(value.planDigest) &&
    DIGEST.test(value.configuration) && DIGEST.test(value.input) && DIGEST.test(value.bundleInput) &&
    DIGEST.test(value.artifactSha256) && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.buildId) &&
    ['internal', 'production'].includes(value.profile) && /^ios-\d+\.\d+\.\d+-[1-9]\d*$/.test(value.runtime),
  'Malformed source-bound iOS artifact receipt.');
  return value;
}

export function authorizeIosReceipt({ receipt, currentMaster, git }) {
  return authorizeReceipt({ receipt: iosReceipt(receipt), currentMaster, git });
}

function authorizeReceipt({ receipt, currentMaster, git }) {
  assert(SHA.test(currentMaster), 'Current protected master must be exact.');
  const trust = parseGhcrReleaseWorkflowTrustSet(git(['show', `${currentMaster}:${TRUST_FILE}`]));
  assert(!trust.revoked.includes(receipt.workflowSha), 'iOS receipt signer is revoked by current protected master.');
  git(['merge-base', '--is-ancestor', receipt.workflowSha, currentMaster]);
  git(['merge-base', '--is-ancestor', receipt.source, currentMaster]);
  if (!trust.allowed.includes(receipt.workflowSha)) {
    for (const file of IOS_RECEIPT_CRITICAL_PATHS) {
      assert.equal(git(['rev-parse', `${receipt.workflowSha}:${file}`]).trim(), git(['rev-parse', `${currentMaster}:${file}`]).trim(),
        'Historical iOS signer tooling changed; explicit reviewed retention or a current build is required.');
    }
  }
}

/** Verify retained canonical bytes against GitHub's cryptographic service, then apply current repository policy. */
export const verifyIosReceipt = args => verifyReceipt({ ...args, receipt: iosReceipt(args.receipt), workflow: 'native-ios-release.yml' });

export function otaReceipt(value) {
  assert(value && Object.keys(value).sort().join() === ['schema', 'kind', 'platform', 'source', 'workflowSha', 'planDigest',
    'configuration', 'input', 'bundleInput', 'artifactSha256', 'profile', 'runtime', 'baseline', 'exportDigest', 'group', 'updateId'].sort().join(),
  'Unexpected OTA receipt fields.');
  assert(value.schema === 1 && value.kind === 'ota' && ['android', 'ios'].includes(value.platform) &&
    SHA.test(value.source) && SHA.test(value.workflowSha) &&
    ['planDigest', 'configuration', 'input', 'bundleInput', 'artifactSha256', 'exportDigest'].every(key => DIGEST.test(value[key])) &&
    ['internal', 'production'].includes(value.profile) &&
    (value.platform === 'ios' ? /^ios-\d+\.\d+\.\d+-[1-9]\d*$/ : /^\d+\.\d+\.\d+$/).test(value.runtime) &&
    new RegExp(`^[1-9]\\d*:native-${value.platform}:[1-9]\\d*$`).test(value.baseline) &&
    ['group', 'updateId'].every(key => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value[key])),
  'Malformed source-bound OTA receipt.');
  return value;
}

export const verifyOtaReceipt = args => verifyReceipt({ ...args, receipt: otaReceipt(args.receipt), workflow: 'unified-ota-release.yml' });

async function verifyReceipt({ root, repository, receipt, expected, currentMaster, workflow, ghPath = 'gh', execute = execFileSync,
  git = candidateGit(root) }) {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository), 'Exact repository identity is required.');
  for (const [key, value] of Object.entries(expected)) assert.equal(hash(receipt[key]), hash(value), 'iOS receipt differs from its planned artifact.');
  authorizeReceipt({ receipt, currentMaster, git });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ios-receipt-'));
  try {
    const file = path.join(directory, 'receipt.json'); fs.writeFileSync(file, bytes(receipt), { mode: 0o600 });
    let verified;
    try {
      verified = JSON.parse(execute(ghPath, ['attestation', 'verify', file, '--repo', repository,
        '--signer-workflow', `${repository}/.github/workflows/${workflow}`, '--signer-digest', receipt.workflowSha,
        '--source-digest', receipt.workflowSha, '--source-ref', 'refs/heads/master', '--deny-self-hosted-runners',
        '--predicate-type', 'https://slsa.dev/provenance/v1', '--limit', '100', '--format', 'json'],
      { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch { throw Error('iOS receipt attestation verification failed; no baseline admitted.'); }
    assert(Array.isArray(verified) && verified.length > 0 && verified.length <= 100, 'Missing verified iOS receipt attestation.');
    const uri = `https://github.com/${repository}`;
    assert(verified.some(result => {
      const c = result?.verificationResult?.signature?.certificate;
      return c?.buildSignerDigest === receipt.workflowSha && c.sourceRepositoryDigest === receipt.workflowSha &&
        c.buildConfigDigest === receipt.workflowSha && c.githubWorkflowSHA === receipt.workflowSha &&
        c.buildSignerURI === `${uri}/.github/workflows/${workflow}@refs/heads/master` &&
        c.buildConfigURI === c.buildSignerURI && c.sourceRepositoryURI === uri &&
        c.sourceRepositoryRef === 'refs/heads/master' && c.buildTrigger === 'workflow_dispatch' && c.runnerEnvironment === 'github-hosted';
    }), 'iOS receipt certificate has an unrelated caller, source, trigger or runner.');
    return receipt;
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
