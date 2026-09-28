const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');
const { once } = require('node:events');

test('server settings authorize current verified identities and persist strict feature switches', async () => {
  const dbPath = require.resolve('../src/config/database');
  const servicePath = require.resolve('../src/services/serverSettings');
  const routePath = require.resolve('../src/routes/serverSettings');
  const previousDb = require.cache[dbPath];
  const previousEmails = process.env.ADMIN_EMAILS;
  let settings = null;
  let writes = 0;
  let failRead = false;
  const users = new Map([
    [1, { email: 'Operator@Example.com', email_verified_at: new Date() }],
    [2, { email: 'member@example.com', email_verified_at: new Date() }],
    [3, { email: 'unverified@example.com', email_verified_at: null }]
  ]);
  const stub = new Module(dbPath);
  stub.exports = { __esModule: true, default: {
    user: { findUnique: async ({ where }) => users.get(where.id) ?? null },
    serverSettings: {
      findUnique: async ({ where }) => {
        assert.equal(where.id, 1);
        if (failRead) throw new Error('Database unavailable');
        return settings;
      },
      upsert: async ({ where, create, update }) => {
        assert.equal(where.id, 1);
        writes++;
        settings = settings ? { ...settings, ...update } : create;
        return settings;
      }
    }
  } };
  stub.loaded = true;
  require.cache[dbPath] = stub;
  delete require.cache[servicePath];
  delete require.cache[routePath];
  process.env.ADMIN_EMAILS = ' operator@example.com , UNVERIFIED@example.com ';
  const service = require(servicePath);
  const router = require(routePath).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = Number(req.headers['x-test-user']);
    req.isAuthenticated = () => Boolean(id);
    // A forged email in an otherwise authenticated principal must not grant admin access.
    if (id) req.user = { id, email: 'operator@example.com', is_admin: true };
    next();
  });
  app.use('/api/v1/server-settings', router);
  app.use((_error, _req, res, _next) => res.status(500).json({ message: 'Server error' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/v1/server-settings`;
  const request = (id, body) => fetch(url, {
    method: body === undefined ? 'GET' : 'PATCH',
    headers: { ...(id ? { 'x-test-user': String(id) } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const enabled = { features: { nutrition_label_scanning: true } };
  try {
    assert.equal((await request()).status, 401);
    assert.equal((await request(undefined, enabled)).status, 401);
    let response = await request(1);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { is_admin: true, features: { nutrition_label_scanning: false } });
    assert.deepEqual(await (await request(2)).json(), { is_admin: false, features: { nutrition_label_scanning: false } });
    for (const id of [2, 3, 99]) assert.equal((await request(id, enabled)).status, 403);
    for (const invalid of [{}, { features: {} }, { ...enabled, is_admin: true },
      { features: { nutrition_label_scanning: 'false' } },
      { features: { nutrition_label_scanning: true, other_feature: true } }]) {
      assert.equal((await request(1, invalid)).status, 400);
    }
    assert.equal(writes, 0);
    response = await request(1, enabled);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...enabled, is_admin: true });
    assert.equal((await service.getServerFeatures()).nutrition_label_scanning, true);
    assert.equal((await (await request(2)).json()).features.nutrition_label_scanning, true);
    // A new service instance reads the persisted row instead of resetting a process-local switch.
    delete require.cache[servicePath];
    assert.equal((await require(servicePath).getServerFeatures()).nutrition_label_scanning, true);
    assert.equal((await request(1, { features: { nutrition_label_scanning: false } })).status, 200);
    assert.equal((await service.getServerFeatures()).nutrition_label_scanning, false);
    users.get(1).email = 'changed@example.com';
    assert.equal((await request(1, enabled)).status, 403);
    users.get(1).email = 'operator@example.com';
    process.env.ADMIN_EMAILS = '';
    assert.equal((await request(1, enabled)).status, 403);
    assert.equal(writes, 2);
    failRead = true;
    assert.equal((await request(2)).status, 500);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
    delete require.cache[servicePath];
    delete require.cache[routePath];
    if (previousEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousEmails;
  }
});
