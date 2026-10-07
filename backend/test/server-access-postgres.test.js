const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const databaseUrl = process.env.CALIBRATE_SERVER_ACCESS_TEST_DATABASE_URL;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('operation was blocked')), 3000); })]); }
  finally { clearTimeout(timer); }
}

test('PostgreSQL preserves server ownership without locking directory reads', { skip: !databaseUrl, timeout: 90000 }, async (t) => {
  const url = new URL(databaseUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'disposable local PostgreSQL only');
  assert.match(url.pathname, /^\/(calibrate_ci|calibrate_test[^/]*)$/);
  const schema = 'server_access_' + randomUUID().replaceAll('-', '');
  const upgradedSchema = schema + '_upgrade';
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query('CREATE SCHEMA "' + schema + '"');
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  process.env.CALIBRATE_HOSTED_SERVICE = 'false';
  process.env.ADMIN_USER_IDS = '';
  let database;
  try {
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env: process.env, stdio: 'pipe', timeout: 45000 });
    database = require('../src/config/database');
    const prisma = database.default;
    const service = require('../src/services/serverAccess');
    const { deleteAccountData } = require('../src/services/accountLifecycle');
    const registration = () => ({ email: randomUUID() + '@example.invalid', password_hash: 'synthetic', email_verified_at: new Date('2026-01-01Z') });
    const reset = async (hosted = false) => {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "' + schema + '"."User" CASCADE');
      await prisma.serverAccessState.update({ where: { id: 1 }, data: { first_user_bootstrap_available: true, legacy_admin_imported_at: null } });
      process.env.CALIBRATE_HOSTED_SERVICE = String(hosted);
      process.env.ADMIN_USER_IDS = '';
    };
    const adminPair = async () => {
      await reset();
      const first = await service.createRegisteredUser(registration());
      const second = await service.createRegisteredUser(registration());
      await service.updateServerUserRole(first.id, second.id, 'admin');
      return [first, second];
    };
    await t.test('simultaneous first registrations grant exactly one administrator', async () => {
      const users = await Promise.all(Array.from({ length: 12 }, () => service.createRegisteredUser({ ...registration(), server_role: 'admin' })));
      assert.equal(users.length, 12);
      assert.equal(await prisma.user.count({ where: { server_role: 'admin' } }), 1);
      assert.equal((await prisma.serverAccessState.findUnique({ where: { id: 1 } })).first_user_bootstrap_available, false);
    });
    await t.test('managed hosting never grants bootstrap ownership', async () => {
      await reset(true);
      await Promise.all([service.createRegisteredUser(registration()), service.createRegisteredUser(registration())]);
      assert.equal(await prisma.user.count({ where: { server_role: 'admin' } }), 0);
    });
    for (const operation of ['demote', 'delete']) {
      await t.test('competing demotion and ' + operation + ' preserve a verified administrator', async () => {
        const [first, second] = await adminPair();
        const results = await Promise.allSettled([
          service.updateServerUserRole(first.id, first.id, 'member'),
          operation === 'delete' ? deleteAccountData(second.id) : service.updateServerUserRole(second.id, second.id, 'member')
        ]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal(results.find(r => r.status === 'rejected').reason.code, 'LAST_ADMIN_REQUIRED');
        assert.equal(await prisma.user.count({ where: { server_role: 'admin', email_verified_at: { not: null } } }), 1);
      });
    }
    await t.test('directory reads complete while another connection holds the ownership lock', async () => {
      const [first] = await adminPair();
      const connection = await admin.connect();
      let pending;
      try {
        await connection.query('BEGIN');
        await connection.query('SELECT id FROM "' + schema + '"."ServerAccessState" WHERE id = 1 FOR UPDATE');
        pending = service.listServerUsers(first.id, { search: '@example.invalid', limit: 25 });
        const result = await bounded(pending);
        assert.equal(result.users.length, 2);
        for (const user of result.users) assert.deepEqual(Object.keys(user).sort(), ['created_at', 'email', 'email_verified', 'id', 'role']);
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
        if (pending) await pending.catch(() => undefined);
      }
    });
    await t.test('revocation during a directory scan hides its results and does not block a registration', async () => {
      const [first, second] = await adminPair();
      const scanning = deferred(), release = deferred();
      const findMany = prisma.user.findMany.bind(prisma.user);
      prisma.user.findMany = async args => { const rows = await findMany(args); scanning.resolve(); await release.promise; return rows; };
      const pending = service.listServerUsers(first.id, { limit: 25 });
      const denied = assert.rejects(pending, error => error.code === 'ADMIN_REQUIRED');
      try {
        await bounded(scanning.promise);
        await bounded(Promise.all([service.createRegisteredUser(registration()), service.updateServerUserRole(second.id, first.id, 'member')]));
      } finally { release.resolve(); prisma.user.findMany = findMany; }
      await denied;
      await assert.rejects(service.updateServerFeaturesAsAdmin(first.id, true), error => error.code === 'ADMIN_REQUIRED');
    });
    await t.test('failed delivery preserves an unverified first owner and recovery requires a verified existing account', async () => {
      await reset();
      const owner = await service.createRegisteredUser({ ...registration(), email_verified_at: null });
      assert.equal(await service.cleanupFailedRegistration(owner.id), false);
      assert.equal(await prisma.user.count(), 1);
      await assert.rejects(service.grantServerAdminToExistingAccount(owner.id), error => error.code === 'EMAIL_VERIFICATION_REQUIRED');
      await prisma.user.update({ where: { id: owner.id }, data: { email_verified_at: new Date('2026-01-01Z') } });
      assert.equal((await service.grantServerAdminToExistingAccount(owner.id)).role, 'admin');
      await assert.rejects(service.grantServerAdminToExistingAccount(2147483647), error => error.code === 'USER_NOT_FOUND');
    });
    await t.test('populated base migration disables bootstrap and imports only existing legacy IDs once', async () => {
      const connection = await admin.connect();
      const directory = path.join(__dirname, '../prisma/migrations');
      try {
        await connection.query('CREATE SCHEMA "' + upgradedSchema + '"');
        await connection.query('SET search_path TO "' + upgradedSchema + '"');
        for (const name of fs.readdirSync(directory).sort()) {
          const sql = path.join(directory, name, 'migration.sql');
          if (name !== '0042_persistent_server_roles' && fs.existsSync(sql)) await connection.query(fs.readFileSync(sql, 'utf8'));
        }
        await connection.query('INSERT INTO "User" (email, password_hash) VALUES ($1, $2)', ['existing@example.invalid', 'synthetic']);
        await connection.query(fs.readFileSync(path.join(directory, '0042_persistent_server_roles/migration.sql'), 'utf8'));
        assert.equal((await connection.query('SELECT first_user_bootstrap_available FROM "ServerAccessState"')).rows[0].first_user_bootstrap_available, false);
        assert.equal((await connection.query('SELECT server_role FROM "User"')).rows[0].server_role, 'member');
      } finally { await connection.query('RESET search_path'); connection.release(); }
      await reset();
      const user = await prisma.user.create({ data: registration() });
      process.env.ADMIN_USER_IDS = String(user.id) + ',2147483647';
      await Promise.all([service.initializeServerAccess(), service.initializeServerAccess()]);
      assert.equal(await service.isServerAdmin(user.id), true);
      await prisma.user.update({ where: { id: user.id }, data: { server_role: 'member' } });
      await service.initializeServerAccess();
      assert.equal(await service.isServerAdmin(user.id), false);
      assert.equal((await prisma.serverAccessState.findUnique({ where: { id: 1 } })).first_user_bootstrap_available, false);
      const later = await service.createRegisteredUser(registration());
      assert.equal(await service.isServerAdmin(later.id), false);
    });
  } finally {
    if (database) await database.disconnectDatabase();
    await admin.query('DROP SCHEMA IF EXISTS "' + upgradedSchema + '" CASCADE');
    await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
    await admin.end();
  }
});
