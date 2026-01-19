const test = require('node:test');
const assert = require('node:assert/strict');

const { PostgresSessionStore } = require('../src/utils/postgresSessionStore');

/**
 * Build a minimal pg Pool stub with injectable query behavior.
 */
const createPoolStub = (responder) => {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return responder({ text, params });
    }
  };
};

/**
 * Wrap store.get in a Promise so tests can await callback results.
 */
const callStoreGet = (store, sid) =>
  new Promise((resolve) => {
    store.get(sid, (err, session) => resolve({ err, session }));
  });

/**
 * Wrap store.set in a Promise so tests can await callback completion.
 */
const callStoreSet = (store, sid, session) =>
  new Promise((resolve) => {
    store.set(sid, session, (err) => resolve(err));
  });

/**
 * Wrap store.touch in a Promise so tests can await callback completion.
 */
const callStoreTouch = (store, sid, session) =>
  new Promise((resolve) => {
    store.touch(sid, session, (err) => resolve(err));
  });

/**
 * Wrap store.destroy in a Promise so tests can await callback completion.
 */
const callStoreDestroy = (store, sid) =>
  new Promise((resolve) => {
    store.destroy(sid, (err) => resolve(err));
  });

test('PostgresSessionStore.initialize verifies the session schema exists', async () => {
  const pool = createPoolStub(() => ({ rows: [] }));
  const store = new PostgresSessionStore(pool);

  await store.initialize();

  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].text, /SELECT 1 FROM session_store/);
});

test('PostgresSessionStore.initialize throws a helpful error for missing tables', async () => {
  const pool = createPoolStub(() => {
    const error = new Error('relation does not exist');
    error.code = '42P01';
    throw error;
  });
  const store = new PostgresSessionStore(pool);

  await assert.rejects(
    () => store.initialize(),
    /Session store table is missing\. Apply database migrations/
  );
});

test('PostgresSessionStore.initialize surfaces unexpected database errors', async () => {
  const pool = createPoolStub(() => {
    const error = new Error('boom');
    error.code = '99999';
    throw error;
  });
  const store = new PostgresSessionStore(pool);

  await assert.rejects(() => store.initialize(), /boom/);
});

test('PostgresSessionStore.get returns null when no session exists', async () => {
  const pool = createPoolStub(() => ({ rows: [] }));
  const store = new PostgresSessionStore(pool);

  const result = await callStoreGet(store, 'missing');

  assert.equal(result.err, null);
  assert.equal(result.session, null);
});

test('PostgresSessionStore.get prunes expired sessions', async () => {
  const pool = createPoolStub(({ text }) => {
    if (text.startsWith('SELECT')) {
      return { rows: [{ sess: '{"userId":1}', expire: new Date(0).toISOString() }] };
    }
    return { rows: [] };
  });
  const store = new PostgresSessionStore(pool);

  const result = await callStoreGet(store, 'expired');

  assert.equal(result.err, null);
  assert.equal(result.session, null);
  assert.equal(pool.calls.length, 2);
  assert.match(pool.calls[1].text, /DELETE FROM session_store/);
  assert.equal(pool.calls[1].params[0], 'expired');
});

test('PostgresSessionStore.get returns parsed JSON sessions', async () => {
  const pool = createPoolStub(() => ({
    rows: [
      {
        sess: '{"userId":123,"roles":["user"]}',
        expire: '2999-01-01T00:00:00.000Z'
      }
    ]
  }));
  const store = new PostgresSessionStore(pool);

  const result = await callStoreGet(store, 'active');

  assert.equal(result.err, null);
  assert.deepEqual(result.session, { userId: 123, roles: ['user'] });
});

test('PostgresSessionStore.get forwards query errors to the callback', async () => {
  const pool = createPoolStub(() => {
    throw new Error('select failed');
  });
  const store = new PostgresSessionStore(pool);

  const result = await callStoreGet(store, 'oops');

  assert.ok(result.err);
  assert.match(result.err.message, /select failed/);
});

test('PostgresSessionStore.set stores sessions using the cookie expiration when provided', async () => {
  const pool = createPoolStub(() => ({ rows: [] }));
  const store = new PostgresSessionStore(pool);

  const expires = new Date('2025-01-03T12:00:00.000Z');
  const session = { cookie: { expires }, userId: 42 };
  const error = await callStoreSet(store, 'sid-1', session);

  assert.equal(error, undefined);
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].text, /INSERT INTO session_store/);
  assert.equal(pool.calls[0].params[0], 'sid-1');
  assert.equal(pool.calls[0].params[1], JSON.stringify(session));
  assert.equal(pool.calls[0].params[2].toISOString(), expires.toISOString());
});

test('PostgresSessionStore.set falls back to the store TTL when no cookie timing is set', async () => {
  const pool = createPoolStub(() => ({ rows: [] }));
  const ttlMs = 60000;
  const store = new PostgresSessionStore(pool, ttlMs);

  const session = { cookie: {}, userId: 7 };
  const before = Date.now();
  await callStoreSet(store, 'sid-ttl', session);
  const after = Date.now();

  const expire = pool.calls[0].params[2];
  assert.ok(expire instanceof Date);
  assert.ok(expire.getTime() >= before + ttlMs);
  assert.ok(expire.getTime() <= after + ttlMs);
});

test('PostgresSessionStore.touch updates expiry using cookie maxAge', async () => {
  const pool = createPoolStub(() => ({ rows: [] }));
  const store = new PostgresSessionStore(pool);

  const session = { cookie: { maxAge: 120000 }, userId: 99 };
  const before = Date.now();
  const error = await callStoreTouch(store, 'sid-touch', session);
  const after = Date.now();

  assert.equal(error, undefined);
  assert.match(pool.calls[0].text, /UPDATE session_store/);
  assert.equal(pool.calls[0].params[0], 'sid-touch');

  const expire = pool.calls[0].params[1];
  assert.ok(expire instanceof Date);
  assert.ok(expire.getTime() >= before + session.cookie.maxAge);
  assert.ok(expire.getTime() <= after + session.cookie.maxAge);
});

test('PostgresSessionStore.destroy deletes stored sessions', async () => {
  const pool = createPoolStub(() => ({ rows: [] }));
  const store = new PostgresSessionStore(pool);

  const error = await callStoreDestroy(store, 'sid-remove');

  assert.equal(error, undefined);
  assert.match(pool.calls[0].text, /DELETE FROM session_store/);
  assert.equal(pool.calls[0].params[0], 'sid-remove');
});
