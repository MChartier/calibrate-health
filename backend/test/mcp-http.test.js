const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const { createCalibrateMcpHttpApp } = require('../src/mcp/server');

async function withServer(run, overrides = {}) {
  const app = createCalibrateMcpHttpApp({
    publicUrl: new URL('https://calibratehealth.app/mcp'),
    allowedHosts: ['127.0.0.1', 'calibratehealth.app'],
    trustedProxyHops: 0,
    oauthApprovalRateLimiter: (_request, _response, next) => next(),
    ...overrides
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('MCP discovery advertises the exact resource and public PKCE authorization server', async () => {
  await withServer(async (baseUrl) => {
    const resourceResponse = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`);
    assert.equal(resourceResponse.status, 200);
    const resource = await resourceResponse.json();
    assert.equal(resource.resource, 'https://calibratehealth.app/mcp');
    assert.deepEqual(resource.scopes_supported, [
      'calibrate:food:read',
      'calibrate:weight:read'
    ]);

    const metadataResponse = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    assert.equal(metadataResponse.status, 200);
    const metadata = await metadataResponse.json();
    assert.equal(metadata.issuer, 'https://calibratehealth.app/');
    assert.equal(metadata.authorization_endpoint, 'https://calibratehealth.app/authorize');
    assert.equal(metadata.token_endpoint, 'https://calibratehealth.app/token');
    assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
    assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['none']);
  });
});

test('unauthenticated MCP calls return a resource-metadata challenge and stateless method guidance', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(
      response.headers.get('www-authenticate'),
      /resource_metadata="https:\/\/calibratehealth\.app\/\.well-known\/oauth-protected-resource\/mcp"/
    );
    const body = await response.json();
    assert.equal(body.error.code, -32001);

    const getResponse = await fetch(`${baseUrl}/mcp`);
    assert.equal(getResponse.status, 405);
    assert.equal(getResponse.headers.get('cache-control'), 'no-store');
    const deleteResponse = await fetch(`${baseUrl}/mcp`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 405);
    assert.equal(deleteResponse.headers.get('cache-control'), 'no-store');
  });
});

test('MCP storage failures return a non-cacheable 503 without an OAuth challenge loop', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer opaque-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('www-authenticate'), null);
    const body = await response.json();
    assert.equal(body.error.code, -32603);
  }, {
    oauthService: {
      verifyAccessToken: async () => { throw new Error('database unavailable'); }
    }
  });
});

test('OAuth approval uses the supplied limiter and configured proxy hop without caching', async () => {
  let observedIp;
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/oauth/approve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': '203.0.113.9'
      },
      body: 'request_id=opaque&decision=approve'
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(observedIp, '203.0.113.9');
  }, {
    trustedProxyHops: 1,
    oauthApprovalRateLimiter: (request, response) => {
      observedIp = request.ip;
      response.status(429).json({ message: 'limited' });
    }
  });
});

test('dynamic registration rejects oversized metadata before persistence', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: `Oversized ${'x'.repeat(17 * 1024)}`,
        redirect_uris: ['https://chatgpt.com/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code']
      })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'invalid_client_metadata');
  });
});

test('dynamic registration rejects insecure non-loopback callbacks before persistence', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Untrusted client',
        redirect_uris: ['http://attacker.example/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code']
      })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'invalid_client_metadata');
  });
});
