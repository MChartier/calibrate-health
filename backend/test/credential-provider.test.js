const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { CredentialProvider, CredentialProviderUnavailable } = require('../scripts/lib/credentialProvider');

const identity = { provider: 'firebase', userId: 7, projectId: 'synthetic-project', uid: 'synthetic-uid', email: 'synthetic@example.invalid' };
const tokenClaims = () => ({ uid: identity.uid, aud: identity.projectId, auth_time: Math.floor(Date.now() / 1000) });
function setup(overrides = {}) {
  const calls = [];
  const options = {
    apiKey: 'synthetic-key',
    verifier: { projectId: identity.projectId, verifyIdToken: async () => tokenClaims() },
    fetch: async (url, request) => {
      calls.push({ url, request });
      return { ok: true, json: async () => ({ localId: identity.uid, idToken: 'synthetic-token', refreshToken: 'never-retain' }) };
    },
    ...overrides
  };
  return { calls, options, provider: new CredentialProvider(options) };
}

test('local compatibility works without Firebase configuration', async () => {
  const provider = new CredentialProvider();
  const local = { provider: 'local', userId: 7, passwordHash: await bcrypt.hash('synthetic-password', 10) };
  assert.equal(await provider.verify(local, 'synthetic-password'), true);
  assert.equal(await provider.verify(local, 'wrong-password'), false);
  assert.equal(await provider.verify(local, 'a'.repeat(73)), false);
});

test('Firebase password authentication returns only a boolean and binds verified project and UID', async () => {
  const h = setup();
  assert.equal(await h.provider.verify(identity, 'synthetic-password'), true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].request.redirect, 'error');
  assert.equal(JSON.parse(h.calls[0].request.body).returnSecureToken, true);
  for (const claims of [
    { ...tokenClaims(), uid: 'someone-else' }, { ...tokenClaims(), aud: 'wrong-project' },
    { ...tokenClaims(), auth_time: 0 }, { ...tokenClaims(), auth_time: Math.floor(Date.now() / 1000) + 120 }
  ]) {
    h.options.verifier.verifyIdToken = async () => claims;
    assert.equal(await h.provider.verify(identity, 'synthetic-password'), false);
  }
});

test('wrong configured project and missing configuration never call the network or local bcrypt fallback', async () => {
  const h = setup();
  await assert.rejects(h.provider.verify({ ...identity, projectId: 'other' }, 'synthetic-password'), CredentialProviderUnavailable);
  assert.equal(h.calls.length, 0);
  await assert.rejects(new CredentialProvider().verify(identity, 'synthetic-password'), CredentialProviderUnavailable);
});

test('enumeration-safe credential failures differ from retryable network/configuration failures', async () => {
  for (const code of ['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'USER_DISABLED']) {
    const h = setup({ fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: code } }) }) });
    assert.equal(await h.provider.verify(identity, 'synthetic-password'), false);
  }
  for (const failure of [
    async () => { throw new Error('secret request URL'); },
    async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'secret' } }) }),
    async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'secret' } }) })
  ]) {
    await assert.rejects(setup({ fetch: failure }).provider.verify(identity, 'synthetic-password'), { message: 'Credential provider unavailable' });
  }
});

test('timeout covers hanging transport and token verification', async () => {
  const never = () => new Promise(() => {});
  await assert.rejects(setup({ timeoutMs: 10, fetch: never }).provider.verify(identity, 'synthetic-password'), CredentialProviderUnavailable);
  const h = setup({ timeoutMs: 10 });
  h.options.verifier.verifyIdToken = never;
  await assert.rejects(h.provider.verify(identity, 'synthetic-password'), CredentialProviderUnavailable);
});

test('forged response, verifier rejection and oversized input cannot create an authenticated result', async () => {
  const h = setup();
  h.options.verifier.verifyIdToken = async () => { throw new Error('revoked token'); };
  await assert.rejects(h.provider.verify(identity, 'synthetic-password'), CredentialProviderUnavailable);
  assert.equal(await h.provider.verify(identity, '\ud83d\ude00'.repeat(19)), false);
  const wrong = setup({ fetch: async () => ({ ok: true, json: async () => ({ localId: 'wrong', idToken: 'forged' }) }) });
  assert.equal(await wrong.provider.verify(identity, 'synthetic-password'), false);
});
