const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

const verifiedAt = new Date('2026-01-01T00:00:00.000Z');
const account = (id, overrides = {}) => ({
  id, email: `person${id}@example.com`, password_hash: 'private-hash', server_role: 'member',
  created_at: verifiedAt, email_verified_at: verifiedAt, onboarding_completed_at: null,
  weight_unit: 'KG', height_unit: 'CM', timezone: 'UTC', language: 'en',
  reminder_log_weight_enabled: true, reminder_log_food_enabled: true,
  reminder_log_weight_minute: 540, reminder_log_food_minute: 540,
  reminder_quiet_hours_start_minute: null, reminder_quiet_hours_end_minute: null,
  haptics_enabled: true, date_of_birth: null, sex: null, height_mm: null,
  activity_level: null, profile_image: null, profile_image_mime_type: null,
  legal_acceptances: [], metrics: [{ weight_grams: 75000 }], mobile_sessions: ['private-token'],
  ...overrides
});

// The fake checks that transactions take the real singleton FOR UPDATE lock before any work.
// A PostgreSQL smoke test is still needed to verify the database's cross-connection locking itself.
function createDatabase(initialUsers = [], options = {}) {
  let store = {
    users: structuredClone(initialUsers), settings: null,
    state: {
      id: 1, first_user_bootstrap_available: initialUsers.length === 0,
      legacy_admin_imported_at: null, ...options.state
    }
  };
  let nextId = Math.max(0, ...initialUsers.map((user) => user.id)) + 1;
  let tail = Promise.resolve();
  let lockCount = 0;
  const matches = (user, where = {}) => {
    if (typeof where.id === 'number' && user.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(user.id)) return false;
    if (where.id?.not !== undefined && user.id === where.id.not) return false;
    if (where.id?.gt !== undefined && user.id <= where.id.gt) return false;
    if (where.server_role !== undefined && user.server_role !== where.server_role) return false;
    if (where.email_verified_at === null && user.email_verified_at !== null) return false;
    if (where.email_verified_at?.not === null && user.email_verified_at === null) return false;
    if (where.email?.equals !== undefined && user.email.toLowerCase() !== where.email.equals.toLowerCase()) return false;
    if (where.email?.contains !== undefined && !user.email.toLowerCase().includes(where.email.contains.toLowerCase())) return false;
    return true;
  };
  const selectRow = (user, select) => user && (select
    ? Object.fromEntries(Object.entries(select).filter(([, keep]) => keep).map(([key]) => [key, user[key]]))
    : structuredClone(user));
  function models(getStore) {
    return {
      user: {
        findUnique: async ({ where, select }) => selectRow(getStore().users.find((user) => matches(user, where)) ?? null, select),
        findFirst: async ({ where, select }) => selectRow(getStore().users.find((user) => matches(user, where)) ?? null, select),
        findMany: async ({ where, select, take, orderBy }) => {
          assert.deepEqual(orderBy, { id: 'asc' });
          return getStore().users.filter((user) => matches(user, where)).sort((a, b) => a.id - b.id)
            .slice(0, take).map((user) => selectRow(user, select));
        },
        count: async ({ where } = {}) => getStore().users.filter((user) => matches(user, where)).length,
        create: async ({ data, select }) => {
          if (getStore().users.some((user) => user.email === data.email)) throw Object.assign(new Error('Duplicate email'), { code: 'P2002' });
          const user = account(nextId++, { ...data, legal_acceptances: [] });
          getStore().users.push(user);
          return selectRow(user, select);
        },
        updateMany: async ({ where, data }) => {
          let count = 0;
          for (const user of getStore().users) if (matches(user, where)) { Object.assign(user, data); count++; }
          return { count };
        },
        update: async ({ where, data, select }) => {
          const user = getStore().users.find((user) => matches(user, where));
          assert.ok(user);
          Object.assign(user, data);
          return selectRow(user, select);
        },
        deleteMany: async ({ where }) => {
          options.beforeDelete?.(getStore().users, where);
          const before = getStore().users.length;
          getStore().users = getStore().users.filter((user) => !matches(user, where));
          return { count: before - getStore().users.length };
        }
      },
      serverAccessState: {
        update: async ({ where, data }) => {
          assert.equal(where.id, 1);
          Object.assign(getStore().state, data);
          return structuredClone(getStore().state);
        }
      },
      serverSettings: {
        findUnique: async () => getStore().settings,
        upsert: async ({ create, update }) => {
          getStore().settings = getStore().settings ? { ...getStore().settings, ...update } : create;
          return getStore().settings;
        }
      },
      mobileAuthSession: { create: async () => ({ id: 1 }) }
    };
  }
  const db = models(() => store);
  db.$transaction = async (action, options) => {
    assert.deepEqual(options, { isolationLevel: 'ReadCommitted' });
    let lockedStore;
    let release;
    const tx = models(() => { assert.ok(lockedStore, 'Read or write before taking ownership lock'); return lockedStore; });
    tx.$queryRaw = async (query) => {
      assert.match(query.join(''), /FROM "ServerAccessState" WHERE "id" = 1 FOR UPDATE/);
      const previous = tail;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      lockCount++;
      lockedStore = structuredClone(store);
      return [structuredClone(lockedStore.state)];
    };
    try {
      const result = await action(tx);
      assert.ok(lockedStore);
      store = lockedStore;
      return result;
    } finally { release?.(); }
  };
  return { db, read: () => store, locks: () => lockCount };
}

function loadServices(database) {
  const modulePaths = [
    '../src/config/database', '../src/services/serverAccess', '../src/services/serverSettings',
    '../src/services/accountLifecycle', '../src/routes/serverSettings', '../src/routes/auth',
    '../src/services/mobileAuth', '../src/services/mobileSessionCredentials', '../src/services/wearPairing',
    '../src/services/accountTokens'
  ].map(require.resolve);
  const previous = modulePaths.map((modulePath) => require.cache[modulePath]);
  for (const modulePath of modulePaths) delete require.cache[modulePath];
  const stub = new Module(modulePaths[0]);
  stub.exports = { __esModule: true, default: database.db };
  stub.loaded = true;
  require.cache[modulePaths[0]] = stub;
  const tokenStub = new Module(modulePaths.at(-1));
  tokenStub.exports = { sendEmailVerification: async () => false };
  tokenStub.loaded = true;
  require.cache[modulePaths.at(-1)] = tokenStub;
  const environmentKeys = ['ADMIN_USER_IDS', 'ADMIN_EMAILS', 'CALIBRATE_HOSTED_SERVICE', 'NODE_ENV', 'EMAIL_DELIVERY_MODE', 'SMTP_HOST', 'SMTP_FROM', 'PUBLIC_APP_ORIGIN'];
  const env = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  process.env.ADMIN_USER_IDS = '';
  process.env.CALIBRATE_HOSTED_SERVICE = 'false';
  process.env.NODE_ENV = 'development';
  process.env.EMAIL_DELIVERY_MODE = 'disabled';
  return {
    service: require('../src/services/serverAccess'),
    settings: require('../src/services/serverSettings'),
    lifecycle: require('../src/services/accountLifecycle'),
    router: require('../src/routes/serverSettings').default,
    authRouter: require('../src/routes/auth').default,
    close: () => {
      modulePaths.forEach((modulePath, index) => {
        if (previous[index]) require.cache[modulePath] = previous[index];
        else delete require.cache[modulePath];
      });
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}

const registration = (email) => ({ email, password_hash: 'hash', email_verified_at: verifiedAt });
const hasCode = (code) => (error) => error.code === code;

async function runServer(loaded, callback) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = Number(req.headers['x-test-user']);
    req.isAuthenticated = () => Boolean(id);
    if (id) req.user = { id, email: 'forged-admin@example.com', is_admin: true, server_role: 'admin' };
    req.login = (_user, done) => done(null);
    next();
  });
  app.use('/api/v1/server-settings', loaded.router);
  app.use('/api/v1/auth', loaded.authRouter);
  app.use((_error, _req, res, _next) => res.status(500).json({ message: 'Server error' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const request = (route, id, body, method) => fetch(`${base}${route}`, {
    method: method ?? (body === undefined ? 'GET' : 'PATCH'),
    headers: { ...(id ? { 'x-test-user': String(id) } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  try { await callback(request); } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('first-user bootstrap is atomic, self-hosted only, and ignores caller-supplied roles', async () => {
  const database = createDatabase();
  const loaded = loadServices(database);
  try {
    const users = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      loaded.service.createRegisteredUser({ ...registration(`new${index}@example.com`), server_role: 'admin' })));
    assert.equal(users.length, 12);
    assert.equal(database.read().users.filter((user) => user.server_role === 'admin').length, 1);
    assert.equal(database.read().users[0].server_role, 'admin');
    assert.equal(database.read().state.first_user_bootstrap_available, false);
    assert.equal(database.locks(), 12);
    assert.equal(users[0].password_hash, undefined);
    assert.equal(users[0].server_role, undefined);
  } finally { loaded.close(); }
});

test('managed deployment never auto-promotes, independent of NODE_ENV, and ownership does not reopen', async () => {
  for (const nodeEnv of ['development', 'test', 'staging', 'production']) {
    const database = createDatabase();
    const loaded = loadServices(database);
    try {
      process.env.NODE_ENV = nodeEnv;
      process.env.CALIBRATE_HOSTED_SERVICE = 'true';
      await loaded.service.initializeServerAccess();
      process.env.CALIBRATE_HOSTED_SERVICE = 'false';
      await loaded.service.createRegisteredUser(registration('member@example.com'));
      assert.equal(database.read().users[0].server_role, 'member');
      assert.equal(database.read().state.first_user_bootstrap_available, false);
    } finally { loaded.close(); }
  }
});

test('bootstrap policy accepts self-hosted defaults and fails closed for unknown hosting flags', () => {
  const database = createDatabase();
  const loaded = loadServices(database);
  try {
    for (const value of [undefined, '', 'false', ' FALSE ']) assert.equal(loaded.service.allowsFirstUserAdmin({ CALIBRATE_HOSTED_SERVICE: value }), true);
    for (const value of ['true', ' TRUE ', '1', 'typo']) assert.equal(loaded.service.allowsFirstUserAdmin({ CALIBRATE_HOSTED_SERVICE: value }), false);
  } finally { loaded.close(); }
});

test('populated upgrades and later empty databases never grant a new signup ownership', async () => {
  const database = createDatabase([account(1)]);
  const loaded = loadServices(database);
  try {
    await loaded.service.initializeServerAccess();
    assert.equal(await loaded.lifecycle.deleteAccountData(1), true);
    await loaded.service.createRegisteredUser(registration('later@example.com'));
    assert.equal(database.read().users[0].server_role, 'member');
  } finally { loaded.close(); }
});

test('legacy grants import existing strict ids exactly once and never reserve nonexistent ids', async () => {
  const database = createDatabase([account(1), account(2), account(3, { email_verified_at: null })]);
  const loaded = loadServices(database);
  try {
    process.env.ADMIN_USER_IDS = ' 1 , 3 , 4 ,0,-1,02,2.0,2e0,0x2,2oops,9007199254740993,2147483648';
    assert.deepEqual(loaded.service.parseLegacyAdminUserIds(process.env.ADMIN_USER_IDS), [1, 3, 4]);
    await Promise.all([loaded.service.initializeServerAccess(), loaded.service.initializeServerAccess()]);
    assert.equal(await loaded.service.isServerAdmin(1), true);
    assert.equal(await loaded.service.isServerAdmin(3), false);
    assert.equal(database.read().users[2].server_role, 'admin');
    const later = await loaded.service.createRegisteredUser({ ...registration('future@example.com'), server_role: 'admin' });
    assert.equal(later.id, 4);
    assert.equal(await loaded.service.isServerAdmin(4), false);
    await loaded.service.updateServerUserRole(1, 2, 'admin');
    await loaded.service.updateServerUserRole(2, 1, 'member');
    process.env.ADMIN_USER_IDS = '1,2,3,4';
    await loaded.service.initializeServerAccess();
    assert.equal(await loaded.service.isServerAdmin(1), false);
    assert.equal(await loaded.service.isServerAdmin(4), false);
    assert.ok(database.read().state.legacy_admin_imported_at instanceof Date);
  } finally { loaded.close(); }
});

test('the sole admin, including an unverified bootstrap owner, cannot be removed or replaced by an unverified account', async () => {
  const database = createDatabase([account(1, { server_role: 'admin' }), account(2, { email_verified_at: null })]);
  const loaded = loadServices(database);
  try {
    await loaded.service.initializeServerAccess();
    await assert.rejects(loaded.service.updateServerUserRole(1, 1, 'member'), hasCode('LAST_ADMIN_REQUIRED'));
    await assert.rejects(loaded.lifecycle.deleteAccountData(1), hasCode('LAST_ADMIN_REQUIRED'));
    await assert.rejects(loaded.service.updateServerUserRole(1, 2, 'admin'), hasCode('EMAIL_VERIFICATION_REQUIRED'));
    database.read().users[0].email_verified_at = null;
    await assert.rejects(loaded.lifecycle.deleteAccountData(1), hasCode('LAST_ADMIN_REQUIRED'));
    assert.equal(await loaded.service.cleanupFailedRegistration(1), false);
    assert.equal(database.read().users[0].server_role, 'admin');
  } finally { loaded.close(); }
});

test('concurrent admin demotions/deletions retain a verified administrator and immediately reject stale privileges', async () => {
  for (const operation of ['demote', 'delete', 'mixed']) {
    const database = createDatabase([account(1, { server_role: 'admin' }), account(2, { server_role: 'admin' })]);
    const loaded = loadServices(database);
    try {
      await loaded.service.initializeServerAccess();
      const first = operation === 'delete' ? loaded.lifecycle.deleteAccountData(1) : loaded.service.updateServerUserRole(1, 1, 'member');
      const second = operation === 'demote' ? loaded.service.updateServerUserRole(2, 2, 'member') : loaded.lifecycle.deleteAccountData(2);
      const results = await Promise.allSettled([first, second]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'LAST_ADMIN_REQUIRED');
      const admins = database.read().users.filter((user) => user.server_role === 'admin' && user.email_verified_at);
      assert.equal(admins.length, 1);
      assert.equal(await loaded.service.isServerAdmin(1), false);
      await assert.rejects(loaded.service.updateServerFeaturesAsAdmin(1, true), hasCode('ADMIN_REQUIRED'));
      await assert.rejects(loaded.service.listServerUsers(1, { limit: 25 }), hasCode('ADMIN_REQUIRED'));
    } finally { loaded.close(); }
  }
});

test('directory, role changes, and settings enforce database authorization with safe bounded responses', async () => {
  const database = createDatabase([account(1, { server_role: 'admin' }), account(2), account(3, { email_verified_at: null })]);
  const loaded = loadServices(database);
  try {
    await loaded.service.initializeServerAccess();
    await runServer(loaded, async (request) => {
      const settingsRoute = '/server-settings';
      const usersRoute = `${settingsRoute}/users`;
      const enabled = { features: { nutrition_label_scanning: true } };
      assert.equal((await request(usersRoute)).status, 401);
      assert.equal((await request(usersRoute, 2)).status, 403);
      assert.equal((await request(`${usersRoute}/1/role`, 2, { role: 'admin' })).status, 403);
      assert.equal((await request(settingsRoute, 2, enabled)).status, 403);
      let response = await request(usersRoute + '?limit=2', 1);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const page = await response.json();
      assert.deepEqual(page.users.map((user) => user.id), [1, 2]);
      assert.equal(page.next_cursor, 2);
      for (const user of page.users) assert.deepEqual(Object.keys(user).sort(), ['created_at', 'email', 'email_verified', 'id', 'role']);
      assert.doesNotMatch(JSON.stringify(page), /password|hash|token|metrics|weight|mobile_sessions/);
      assert.deepEqual((await (await request(usersRoute + '?cursor=2&limit=2', 1)).json()).users.map((user) => user.id), [3]);
      assert.deepEqual((await (await request(usersRoute + '?search=PERSON2', 1)).json()).users.map((user) => user.id), [2]);
      for (const suffix of ['?limit=0', '?limit=101', '?cursor=-1', '?cursor=1e0', '?search=x&search=y', '?role=admin']) {
        assert.equal((await request(usersRoute + suffix, 1)).status, 400);
      }
      for (const invalid of [{}, { role: 'owner' }, { role: 'ADMIN' }, { role: 'admin', is_admin: true }]) {
        assert.equal((await request(`${usersRoute}/2/role`, 1, invalid)).status, 400);
      }
      for (const id of ['0', '01', '1e0', '2147483648']) assert.equal((await request(`${usersRoute}/${id}/role`, 1, { role: 'member' })).status, 400);
      assert.equal((await request(`${usersRoute}/99/role`, 1, { role: 'admin' })).status, 404);
      response = await request(`${usersRoute}/1/role`, 1, { role: 'member' });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'LAST_ADMIN_REQUIRED');
      response = await request(`${usersRoute}/3/role`, 1, { role: 'admin' });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'EMAIL_VERIFICATION_REQUIRED');
      assert.equal((await request(settingsRoute, 1, enabled)).status, 200);
      assert.equal((await loaded.settings.getServerFeatures()).nutrition_label_scanning, true);
      assert.equal((await request(`${usersRoute}/2/role`, 1, { role: 'admin' })).status, 200);
      assert.equal((await request(`${usersRoute}/1/role`, 1, { role: 'member' })).status, 200);
      assert.equal((await (await request(settingsRoute, 1)).json()).is_admin, false);
      assert.equal((await request(usersRoute, 1)).status, 403);
      assert.equal((await request(settingsRoute, 1, enabled)).status, 403);
      assert.equal((await request(`${usersRoute}/1/role`, 1, { role: 'admin' })).status, 403);
      database.read().users.find((user) => user.id === 2).email_verified_at = null;
      assert.equal((await request(usersRoute, 2)).status, 403);
    });
  } finally { loaded.close(); }
});

test('both browser and mobile signup use first-user ownership and cannot request extra roles', async () => {
  for (const firstRoute of ['/auth/register', '/auth/mobile/register']) {
    const database = createDatabase();
    const loaded = loadServices(database);
    try {
      await runServer(loaded, async (request) => {
        for (const [index, route] of [firstRoute, firstRoute === '/auth/register' ? '/auth/mobile/register' : '/auth/register'].entries()) {
          const response = await request(route, undefined, {
            email: `signup${index}@example.com`, password: 'password123', device_id: `device-${index}`,
            id: 1, role: 'admin', server_role: 'admin', is_admin: true
          }, 'POST');
          assert.equal(response.status, 200);
          const { user } = await response.json();
          assert.equal(await loaded.service.isServerAdmin(user.id), index === 0);
          assert.equal(user.password_hash, undefined);
        }
      });
    } finally { loaded.close(); }
  }
});

test('failed SMTP delivery retains the unverified owner with a recovery message and no effective privileges', async () => {
  for (const route of ['/auth/register', '/auth/mobile/register']) {
    const database = createDatabase();
    const loaded = loadServices(database);
    try {
      process.env.EMAIL_DELIVERY_MODE = 'smtp';
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_FROM = 'accounts@example.com';
      process.env.PUBLIC_APP_ORIGIN = 'https://selfhost.example.com';
      await runServer(loaded, async (request) => {
        const response = await request(route, undefined, {
          email: 'owner@example.com', password: 'password123', device_id: 'phone'
        }, 'POST');
        assert.equal(response.status, 503);
        const error = await response.json();
        assert.match(error.message, /Sign in and resend verification/);
        assert.equal(error.code, 'ACCOUNT_CREATED_EMAIL_DELIVERY_UNAVAILABLE');
        assert.equal(error.retryable, false);
        assert.equal(database.read().users.length, 1);
        assert.equal(database.read().users[0].server_role, 'admin');
        assert.equal(database.read().users[0].email_verified_at, null);
        assert.equal(await loaded.service.isServerAdmin(1), false);
        await loaded.service.createRegisteredUser({ ...registration('second@example.com'), email_verified_at: null });
        assert.equal(await loaded.service.cleanupFailedRegistration(2), true);
        assert.equal(database.read().state.first_user_bootstrap_available, false);
      });
    } finally { loaded.close(); }
  }
});

test('a member verified during failed-delivery cleanup is preserved by the atomic delete predicate', async () => {
  const database = createDatabase([account(1, { email_verified_at: null })], {
    beforeDelete: (users, where) => {
      assert.deepEqual(where, { id: 1, server_role: 'member', email_verified_at: null });
      users[0].email_verified_at = verifiedAt;
    }
  });
  const loaded = loadServices(database);
  try {
    assert.equal(await loaded.service.cleanupFailedRegistration(1), false);
    assert.equal(database.read().users.length, 1);
    assert.deepEqual(database.read().users[0].email_verified_at, verifiedAt);
  } finally { loaded.close(); }
});

test('operator recovery grants only an existing verified account and preserves the one-time import boundary', async () => {
  const database = createDatabase([account(1), account(2, { email_verified_at: null })]);
  const loaded = loadServices(database);
  try {
    await assert.rejects(loaded.service.grantServerAdminToExistingAccount('future@example.com'), hasCode('USER_NOT_FOUND'));
    await assert.rejects(loaded.service.grantServerAdminToExistingAccount('person2@example.com'), hasCode('EMAIL_VERIFICATION_REQUIRED'));
    const user = await loaded.service.grantServerAdminToExistingAccount('PERSON1@example.com');
    assert.equal(user.role, 'admin');
    assert.equal(user.password_hash, undefined);
    assert.equal(await loaded.service.isServerAdmin(1), true);
    process.env.ADMIN_USER_IDS = '2';
    await loaded.service.initializeServerAccess();
    assert.equal(database.read().users[1].server_role, 'member');
  } finally { loaded.close(); }
});

test('operator recovery fails closed on legacy case-variant duplicate emails and accepts an explicit existing id', async () => {
  const database = createDatabase([
    account(1, { email: 'Owner@example.com' }), account(2, { email: 'owner@example.com' })
  ]);
  const loaded = loadServices(database);
  try {
    await assert.rejects(loaded.service.grantServerAdminToExistingAccount('owner@example.com'), hasCode('AMBIGUOUS_ACCOUNT'));
    assert.ok(database.read().users.every((user) => user.server_role === 'member'));
    assert.equal((await loaded.service.grantServerAdminToExistingAccount(2)).id, 2);
    assert.equal(database.read().users[0].server_role, 'member');
    assert.equal(database.read().users[1].server_role, 'admin');
    await assert.rejects(loaded.service.grantServerAdminToExistingAccount(99), hasCode('USER_NOT_FOUND'));
  } finally { loaded.close(); }
});

test('role migration defaults existing users to member and records empty-install eligibility once', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/0042_persistent_server_roles/migration.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN "server_role" "ServerRole" NOT NULL DEFAULT 'member'/);
  assert.match(migration, /CHECK \("id" = 1\)/);
  assert.match(migration, /SELECT 1, NOT EXISTS \(SELECT 1 FROM "User"\)/);
  assert.doesNotMatch(migration, /SET "server_role" = 'admin'/);
});
