const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadMiddleware(authenticateMobileAccessToken) {
  const servicePath = require.resolve('../src/services/mobileAuth');
  const middlewarePath = require.resolve('../src/middleware/mobileAuth');
  const previousService = require.cache[servicePath];
  delete require.cache[middlewarePath];

  const serviceModule = new Module(servicePath);
  serviceModule.exports = { authenticateMobileAccessToken };
  serviceModule.loaded = true;
  require.cache[servicePath] = serviceModule;

  const loaded = require('../src/middleware/mobileAuth');
  if (previousService) require.cache[servicePath] = previousService;
  else delete require.cache[servicePath];
  return loaded.authenticateMobileBearerToken;
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('mobile auth middleware lets expired-bearer logout revoke by refresh token', async () => {
  const middleware = loadMiddleware(async () => ({
    ok: false,
    status: 401,
    message: 'Invalid or expired access token'
  }));
  const req = {
    method: 'POST',
    path: '/auth/mobile/logout',
    get: () => 'Bearer expired'
  };
  const res = createResponse();
  let nextCount = 0;

  await middleware(req, res, () => {
    nextCount += 1;
  });

  assert.equal(nextCount, 1);
  assert.equal(res.statusCode, 200);
});

test('mobile auth middleware still rejects expired bearer tokens on protected routes', async () => {
  const middleware = loadMiddleware(async () => ({
    ok: false,
    status: 401,
    message: 'Invalid or expired access token'
  }));
  const req = {
    method: 'GET',
    path: '/api/user/profile',
    get: () => 'Bearer expired'
  };
  const res = createResponse();
  let nextCount = 0;

  await middleware(req, res, () => {
    nextCount += 1;
  });

  assert.equal(nextCount, 0);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Invalid or expired access token' });
});
