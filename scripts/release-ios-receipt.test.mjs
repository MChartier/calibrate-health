import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeIosReceipt, verifyIosReceipt, IOS_RECEIPT_CRITICAL_PATHS } from './release-ios-receipt.mjs';
import { hash } from './release-plan.mjs';

function fixture() {
  const workflowSha = 'a'.repeat(40), currentMaster = 'b'.repeat(40), repository = 'example/app';
  const receipt = { schema: 1, kind: 'native', platform: 'ios', workflowSha, source: 'c'.repeat(40),
    planDigest: hash('plan'), configuration: hash('config'), input: hash('native'), bundleInput: hash('bundle'),
    artifactSha256: hash('exact IPA bytes'), buildId: '11111111-1111-4111-8111-111111111111', profile: 'production', runtime: 'ios-1.2.3-11' };
  const state = { trust: '', changed: false };
  const git = args => args[0] === 'show' ? state.trust : args[0] === 'rev-parse' ?
    (state.changed && args[1].startsWith(workflowSha) ? 'd'.repeat(40) : 'e'.repeat(40)) : '';
  const uri = `https://github.com/${repository}`, workflowUri = `${uri}/.github/workflows/native-ios-release.yml@refs/heads/master`;
  const certificate = { buildSignerDigest: workflowSha, sourceRepositoryDigest: workflowSha, buildConfigDigest: workflowSha,
    githubWorkflowSHA: workflowSha, buildSignerURI: workflowUri, buildConfigURI: workflowUri, sourceRepositoryURI: uri,
    sourceRepositoryRef: 'refs/heads/master', buildTrigger: 'workflow_dispatch', runnerEnvironment: 'github-hosted' };
  return { state, certificate, args: { root: '.', repository, receipt, expected: { source: receipt.source, configuration: receipt.configuration }, currentMaster, git,
    execute: (_command, args) => {
      assert(args.includes('--deny-self-hosted-runners')); assert(args.includes('--signer-digest'));
      return JSON.stringify([{ verificationResult: { signature: { certificate } } }]);
    } } };
}
test('historical iOS receipts need identical critical tooling or explicit current retention; revocation wins', () => {
  const f = fixture(); authorizeIosReceipt(f.args);
  f.state.changed = true; assert.throws(() => authorizeIosReceipt(f.args), /tooling changed/);
  f.state.trust = `allow ${f.args.receipt.workflowSha}`; authorizeIosReceipt(f.args);
  f.state.trust = `revoke ${f.args.receipt.workflowSha}`; assert.throws(() => authorizeIosReceipt(f.args), /revoked/);
});
test('iOS baseline verification binds the exact canonical receipt and full GitHub signer authority', async () => {
  const f = fixture(); assert.deepEqual(await verifyIosReceipt(f.args), f.args.receipt);
  f.certificate.sourceRepositoryRef = 'refs/heads/feature'; await assert.rejects(verifyIosReceipt(f.args), /unrelated/);
  const g = fixture(); g.args.expected.source = 'd'.repeat(40); await assert.rejects(verifyIosReceipt(g.args), /planned artifact/);
});

test('historical receipt policy covers every local transitive verifier dependency', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const policy = new Set(IOS_RECEIPT_CRITICAL_PATHS);
  for (const file of policy) {
    if (!file.endsWith('.mjs')) continue;
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()'([.][.]?\/[^']+)'/g)) {
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      assert(policy.has(dependency), `Historical receipt authority is missing ${dependency}`);
    }
  }
});
