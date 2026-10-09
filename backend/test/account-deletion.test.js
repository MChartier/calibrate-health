const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AccountDeletionCoordinator } = require('../src/services/accountDeletion');

test('dormant deletion has no runtime imports or provider construction and local configuration still rejects activation', () => {
  const knip = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../knip.json'), 'utf8'));
  assert.ok(knip.workspaces.backend.project.includes('!src/services/accountDeletion.ts!'), 'only the production graph excludes the maintained dormant coordinator');
  const root = path.resolve(__dirname, '../src');
  for (const name of fs.readdirSync(root, { recursive: true })) {
    if (!name.endsWith('.ts') || name === path.join('services', 'accountDeletion.ts')) continue;
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert.doesNotMatch(source, /(?:from\s+|require\s*\(|import\s*\()\s*['"][^'"]*accountDeletion['"]/, name);
    assert.doesNotMatch(source, /new\s+AccountDeletionCoordinator\b/, name);
  }
  const { validateCredentialProviderConfiguration } = require('../src/config/credentialProvider');
  validateCredentialProviderConfiguration({ AUTH_PROVIDER: 'local' });
  assert.throws(() => validateCredentialProviderConfiguration({ AUTH_PROVIDER: 'firebase' }), /must remain local/);
});

test('proofs require a mapped identity, recent matching provider authentication, and the same coordinator', async () => {
  let transactions = 0;
  const mapping = { user_id: 7, installation_id: 'synthetic-installation', source_id: 'synthetic-source', project_id: 'synthetic-project', uid: 'synthetic-uid' };
  const database = { user: { findUnique: async () => ({ credential_security_version: 3, firebase_identity: mapping }) }, $transaction: () => { transactions++; throw Error('unexpected transaction'); } };
  const provider = { authenticate: async identity => ({ identity, authenticatedAt: new Date() }) };
  const coordinator = new AccountDeletionCoordinator(database, provider, 10);
  await assert.rejects(coordinator.begin(randomUUID(), {}), /Invalid deletion proof/);
  const proof = await coordinator.authenticate(7, 'synthetic');
  assert.ok(proof);
  await assert.rejects(new AccountDeletionCoordinator(database, provider).begin(randomUUID(), proof), /Invalid deletion proof/);
  provider.authenticate = async identity => ({ identity: { ...identity, uid: 'another-account' }, authenticatedAt: new Date() });
  assert.equal(await coordinator.authenticate(7, 'synthetic'), null);
  provider.authenticate = async identity => ({ identity, authenticatedAt: new Date(Date.now() - 61_000) });
  assert.equal(await coordinator.authenticate(7, 'synthetic'), null);
  provider.authenticate = async identity => ({ identity, authenticatedAt: 'not-a-date' });
  assert.equal(await coordinator.authenticate(7, 'synthetic'), null);
  provider.authenticate = async () => new Promise(() => {});
  assert.equal(await coordinator.authenticate(7, 'synthetic'), null);
  assert.equal(transactions, 0, 'authentication failures never create intent or revoke access');
});
