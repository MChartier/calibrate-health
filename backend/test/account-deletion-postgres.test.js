const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');
const databaseUrl = process.env.CALIBRATE_AUTH_TEST_DATABASE_URL;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// A persisted synthetic provider, intentionally independent of the SQL transaction under test.
function syntheticProvider(file) {
  const fs = require('node:fs');
  return {
    authenticate: async (identity, password) => password === 'synthetic-password' ? { identity, authenticatedAt: new Date() } : null,
    inspect: async identity => ({ identity, status: fs.existsSync(file) ? 'absent' : 'present' }),
    delete: async () => { fs.writeFileSync(file, 'deleted'); }
  };
}

test('durable deletion survives failures and process crashes and fences real PostgreSQL access', { skip: !databaseUrl, timeout: 180000 }, async t => {
  const url = new URL(databaseUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'disposable local PostgreSQL only');
  assert.match(url.pathname, /^\/(calibrate_ci|calibrate_test[^/]*)$/);
  const schema = `deletion_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-deletion-'));
  let database, scoped;
  try {
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env: process.env, stdio: 'pipe', timeout: 45000 });
    database = require('../src/config/database');
    const db = database.default;
    const { AccountDeletionCoordinator } = require('../src/services/accountDeletion');
    const { issueVerifiedMobileAuthPayload, refreshMobileSession, authenticateMobileAccessToken } = require('../src/services/mobileAuth');
    const { issueAccountActionToken, resetPasswordWithToken } = require('../src/services/accountTokens');
    const { PostgresSessionStore } = require('../src/utils/postgresSessionStore');
    const { markVerifiedBrowserLogin, serializeBrowserLoginUser } = require('../src/utils/browserLoginCredentials');
    scoped = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    const originalTransaction = db.$transaction.bind(db);
    const device = { deviceId: 'synthetic-phone', devicePlatform: 'ANDROID_PHONE', deviceName: null };
    const create = async (mapped = true) => {
      const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, password_hash: 'synthetic-hash', email_verified_at: new Date() } });
      if (mapped) await db.firebaseIdentity.create({ data: { user_id: user.id, installation_id: 'synthetic-install', source_id: 'synthetic-source', project_id: 'synthetic-project', uid: randomUUID() } });
      const file = path.join(temp, randomUUID());
      const provider = syntheticProvider(file);
      const coordinator = new AccountDeletionCoordinator(db, provider, 100);
      const operation = randomUUID();
      const proof = await coordinator.authenticate(user.id, 'synthetic-password');
      return { user, provider, coordinator, operation, proof, file };
    };
    const begin = fixture => fixture.coordinator.begin(fixture.operation, fixture.proof);
    const receipt = fixture => db.accountDeletion.findUnique({ where: { operation_id: fixture.operation } });
    const issue = user => issueVerifiedMobileAuthPayload({ userId: user.id, credentialSecurityVersion: user.credential_security_version, device });
    const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/0046_dormant_account_deletion/migration.sql'), 'utf8');
    const rollback = fs.readFileSync(path.join(__dirname, '../prisma/rollback/0046_dormant_account_deletion.sql'), 'utf8');

    await t.test('populated rollback and re-upgrade preserve ordinary accounts and data before any intent', async () => {
      const local = await create(false);
      await db.bodyMetric.create({ data: { user_id: local.user.id, date: new Date('2026-01-01'), weight_grams: 75000 } });
      const client = await scoped.connect();
      try {
        await client.query(rollback);
        const { rows } = await client.query('SELECT id,password_hash FROM "User" WHERE id=$1', [local.user.id]);
        assert.deepEqual(rows, [{ id: local.user.id, password_hash: 'synthetic-hash' }]);
        await client.query(migration);
      } finally { client.release(); }
      const user = await db.user.findUnique({ where: { id: local.user.id } });
      assert.equal(user.deletion_pending, false);
      assert.equal(user.credential_security_version, 0);
      assert.equal(await db.bodyMetric.count({ where: { user_id: user.id } }), 1);
      assert.ok(await issue(user));
    });

    await t.test('stale or conflicting proofs and failed intent commit have no side effects', async () => {
      const f = await create();
      await db.user.update({ where: { id: f.user.id }, data: { password_hash: 'changed' } });
      await assert.rejects(begin(f), /no longer current/);
      assert.equal(await receipt(f), null);
      const fresh = await create();
      db.$transaction = action => originalTransaction(async tx => { await action(tx); throw Error('synthetic commit failure'); });
      await assert.rejects(begin(fresh), /synthetic commit failure/);
      db.$transaction = originalTransaction;
      assert.equal(await receipt(fresh), null);
      assert.equal((await db.user.findUnique({ where: { id: fresh.user.id } })).deletion_pending, false);
      assert.equal(fs.existsSync(fresh.file), false);
      await begin(fresh);
      assert.equal(await begin(fresh), 'pending_provider');
      await assert.rejects(fresh.coordinator.begin(randomUUID(), fresh.proof), /no longer current/);
    });

    await t.test('intent atomically revokes access and fences older session, recovery, grant and pairing writers', async () => {
      const f = await create();
      const session = await issue(f.user);
      const reset = await issueAccountActionToken(f.user.id, 'PASSWORD_RESET');
      const store = new PostgresSessionStore(scoped);
      const save = (sid, value) => new Promise((resolve, reject) => store.set(sid, value, error => error ? reject(error) : resolve()));
      await save('synthetic-browser', { cookie: { maxAge: 60000 }, passport: { user: f.user.id } });
      const client = await db.mcpOAuthClient.create({ data: { client_id: randomUUID(), metadata_json: {} } });
      const grant = await db.mcpOAuthGrant.create({ data: { client_id: client.client_id, user_id: f.user.id, scopes: ['read'], resource: 'https://synthetic.invalid/mcp' } });
      await begin(f);
      assert.equal((await db.user.findUnique({ where: { id: f.user.id } })).deletion_pending, true);
      assert.equal(await issue(f.user), null);
      assert.equal(await refreshMobileSession(session.refreshToken), null);
      assert.equal((await authenticateMobileAccessToken(`Bearer ${session.accessToken}`)).ok, false);
      assert.equal(await db.sessionStore.count({ where: { user_id: f.user.id } }), 0);
      assert.ok((await db.mcpOAuthGrant.findUnique({ where: { id: grant.id } })).revoked_at);
      await assert.rejects(save('late-browser', { cookie: { maxAge: 60000 }, passport: { user: f.user.id } }), /pending/);
      assert.equal(await resetPasswordWithToken(reset, 'new-password'), false);
      await assert.rejects(issueAccountActionToken(f.user.id, 'EMAIL_VERIFICATION'));
      await assert.rejects(db.user.update({ where: { id: f.user.id }, data: { password_hash: 'older-writer' } }));
      await assert.rejects(db.user.update({ where: { id: f.user.id }, data: { deletion_pending: false } }));
      await assert.rejects(db.user.delete({ where: { id: f.user.id } }));
      await assert.rejects(db.mcpOAuthGrant.create({ data: { client_id: client.client_id, user_id: f.user.id, scopes: [], resource: 'synthetic' } }));
      await assert.rejects(db.mcpOAuthAccessToken.create({ data: { grant_id: grant.id, token_hash: 'a'.repeat(64), scopes: [], expires_at: new Date(Date.now() + 60000) } }));
      await assert.rejects(db.mcpOAuthRefreshToken.create({ data: { grant_id: grant.id, token_hash: 'b'.repeat(64), scopes: [], expires_at: new Date(Date.now() + 60000) } }));
      const phone = await db.mobileAuthSession.findFirst({ where: { user_id: f.user.id } });
      await assert.rejects(db.mobileAuthSession.update({ where: { id: phone.id }, data: { revoked_at: null } }));
      await assert.rejects(db.wearPairingCredential.create({ data: {
        user_id: f.user.id, issuing_mobile_session_id: phone.id, token_hash: randomUUID(), server_origin: 'https://synthetic.invalid',
        watch_device_id: 'watch', protocol_version: 1, challenge: 'challenge', watch_public_key_spki: 'synthetic', expires_at: new Date(Date.now() + 60000)
      } }));
    });

    await t.test('provider timeout, lost response and wrong identity retain SQL until authoritative reconciliation', async () => {
      const f = await create();
      await begin(f);
      f.provider.inspect = async () => new Promise(() => {});
      assert.equal(await f.coordinator.resume(f.operation), 'pending');
      assert.ok(await db.user.findUnique({ where: { id: f.user.id } }));
      f.provider.inspect = async identity => ({ identity: { ...identity, projectId: 'wrong-project' }, status: 'absent' });
      assert.equal(await f.coordinator.resume(f.operation), 'held');
      Object.assign(f.provider, syntheticProvider(f.file));
      f.provider.delete = async () => { fs.writeFileSync(f.file, 'deleted'); throw Error('response lost'); };
      assert.equal(await f.coordinator.resume(f.operation), 'pending');
      assert.equal((await receipt(f)).state, 'pending_provider');
      assert.equal(await f.coordinator.resume(f.operation), 'complete');
      assert.equal(await db.user.findUnique({ where: { id: f.user.id } }), null);
      assert.equal((await receipt(f)).state, 'complete');
      assert.equal(await f.coordinator.resume(f.operation), 'complete');
      await assert.rejects(db.accountDeletion.delete({ where: { operation_id: f.operation } }));
      await assert.rejects(db.user.create({ data: { id: f.user.id, email: `${randomUUID()}@example.invalid`, password_hash: 'stale' } }));
    });

    await t.test('SQL failure after provider confirmation rolls back cleanup and preserves a resumable receipt', async () => {
      const f = await create();
      await begin(f);
      db.$transaction = action => originalTransaction(async tx => {
        const value = await action(tx);
        if (value === 'complete') throw Error('finalization commit failed');
        return value;
      });
      assert.equal(await f.coordinator.resume(f.operation), 'pending');
      db.$transaction = originalTransaction;
      assert.equal((await receipt(f)).state, 'provider_confirmed');
      assert.ok(await db.user.findUnique({ where: { id: f.user.id } }));
      f.provider.inspect = async () => { throw Error('must not repeat confirmed provider work'); };
      assert.equal(await f.coordinator.resume(f.operation), 'complete');
    });

    await t.test('a timed-out delete may finish remotely but cannot prematurely remove SQL data', async () => {
      const f = await create();
      await begin(f);
      f.provider.delete = async () => { fs.writeFileSync(f.file, 'deleted'); await new Promise(() => {}); };
      assert.equal(await f.coordinator.resume(f.operation), 'pending');
      assert.equal((await receipt(f)).state, 'pending_provider');
      assert.ok(await db.user.findUnique({ where: { id: f.user.id } }));
      assert.equal(await f.coordinator.resume(f.operation), 'complete');
      assert.equal(await db.user.findUnique({ where: { id: f.user.id } }), null);
    });

    await t.test('expired claim and delayed old result cannot finalize a replacement worker claim', async () => {
      const f = await create();
      f.coordinator = new AccountDeletionCoordinator(db, f.provider);
      f.proof = await f.coordinator.authenticate(f.user.id, 'synthetic-password');
      await begin(f);
      const entered = deferred(), release = deferred();
      f.provider.inspect = async identity => { entered.resolve(); await release.promise; return { identity, status: 'absent' }; };
      const old = f.coordinator.resume(f.operation);
      await entered.promise;
      assert.equal(await f.coordinator.resume(f.operation), 'busy');
      await db.accountDeletion.update({ where: { operation_id: f.operation }, data: { claim_until: new Date(0) } });
      const replacement = new AccountDeletionCoordinator(db, syntheticProvider(f.file));
      assert.equal(await replacement.resume(f.operation), 'complete');
      release.resolve();
      assert.equal(await old, 'busy');
      assert.equal((await receipt(f)).claim_generation, 2);
    });

    const waitForLock = async pid => {
      for (let i = 0; i < 150; i++) {
        const { rows } = await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid]);
        if (rows[0]?.wait_event_type === 'Lock') return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.fail('competing transaction did not wait on a PostgreSQL lock');
    };
    for (const order of ['intent-first', 'issuance-first']) {
      await t.test(`${order}: mapped account lock orders native issuance and deletion`, async () => {
        const f = await create();
        const locked = deferred(), release = deferred(), waiting = deferred();
        let first = true;
        db.$transaction = action => originalTransaction(async tx => {
          const isFirst = first; first = false;
          if (!isFirst) waiting.resolve((await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid'))[0].pid);
          const result = await action(tx);
          if (isFirst) { locked.resolve(); await release.promise; }
          return result;
        }, { timeout: 15000 });
        const one = order === 'intent-first' ? begin(f) : issue(f.user);
        await locked.promise;
        const two = order === 'intent-first' ? issue(f.user) : begin(f);
        try { await waitForLock(await waiting.promise); } finally { release.resolve(); }
        const [a, b] = await Promise.all([one, two]);
        db.$transaction = originalTransaction;
        if (order === 'intent-first') assert.equal(b, null); else assert.ok(a.accessToken);
        assert.equal(await db.mobileAuthSession.count({ where: { user_id: f.user.id, revoked_at: null } }), 0);
      });
    }

    for (const kind of ['MCP grant', 'Wear pairing']) {
      for (const order of ['intent-first', 'writer-first']) {
        await t.test(`${order}: older ${kind} writer serializes with deletion`, async () => {
          const f = await create();
          await issue(f.user);
          const phone = await db.mobileAuthSession.findFirst({ where: { user_id: f.user.id } });
          const client = await db.mcpOAuthClient.create({ data: { client_id: randomUUID(), metadata_json: {} } });
          const write = () => db.$transaction(tx => kind === 'MCP grant'
            ? tx.mcpOAuthGrant.create({ data: { client_id: client.client_id, user_id: f.user.id, scopes: ['read'], resource: 'https://synthetic.invalid/mcp' } })
            : tx.wearPairingCredential.create({ data: {
              user_id: f.user.id, issuing_mobile_session_id: phone.id, token_hash: randomUUID(), server_origin: 'https://synthetic.invalid',
              watch_device_id: 'watch', protocol_version: 1, challenge: 'challenge', watch_public_key_spki: 'synthetic', expires_at: new Date(Date.now() + 60000)
            } }));
          const locked = deferred(), release = deferred(), waiting = deferred();
          let first = true;
          db.$transaction = action => originalTransaction(async tx => {
            const isFirst = first; first = false;
            if (!isFirst) waiting.resolve((await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid'))[0].pid);
            const value = await action(tx);
            if (isFirst) { locked.resolve(); await release.promise; }
            return value;
          }, { timeout: 15000 });
          const one = order === 'intent-first' ? begin(f) : write();
          await locked.promise;
          const two = order === 'intent-first' ? write() : begin(f);
          const outcomes = Promise.allSettled([one, two]);
          try { await waitForLock(await waiting.promise); } finally { release.resolve(); }
          const [a, b] = await outcomes;
          db.$transaction = originalTransaction;
          assert.equal(a.status, 'fulfilled');
          assert.equal(b.status, order === 'intent-first' ? 'rejected' : 'fulfilled');
          if (b.status === 'rejected') assert.match(b.reason.message, /Account deletion is pending/);
          assert.equal(await db.mcpOAuthGrant.count({ where: { user_id: f.user.id, revoked_at: null } }), 0);
          assert.equal(await db.wearPairingCredential.count({ where: { user_id: f.user.id, consumed_at: null } }), 0);
        });
      }
    }

    await t.test('an older session-first writer can deadlock safely; retry cannot resurrect access', async () => {
      const f = await create();
      await issue(f.user);
      const phone = await db.mobileAuthSession.findFirst({ where: { user_id: f.user.id } });
      const old = await scoped.connect();
      const lockedUser = deferred();
      db.$transaction = action => originalTransaction(tx => action(new Proxy(tx, { get(target, key) {
        if (key !== 'user') return target[key];
        return new Proxy(target.user, { get(model, operation) {
          if (operation !== 'updateMany') return model[operation];
          return async args => { const value = await model.updateMany(args); lockedUser.resolve(); return value; };
        } });
      } })), { timeout: 15000 });
      try {
        await old.query('BEGIN');
        await old.query('SELECT id FROM "MobileAuthSession" WHERE id=$1 FOR UPDATE', [phone.id]);
        const intent = begin(f);
        const intentResult = intent.then(value => ({ value }), error => ({ error }));
        await lockedUser.promise;
        const writer = old.query('UPDATE "MobileAuthSession" SET last_used_at=CURRENT_TIMESTAMP WHERE id=$1', [phone.id])
          .then(async () => { await old.query('COMMIT'); return {}; }, async error => { await old.query('ROLLBACK'); return { error }; });
        const [a, b] = await Promise.all([intentResult, writer]);
        assert.ok(a.error || b.error, 'PostgreSQL must abort a participant in the lock cycle');
        assert.match((a.error || b.error).message, /deadlock|write conflict/i);
        db.$transaction = originalTransaction;
        if (a.error) await begin(f);
        await assert.rejects(old.query('UPDATE "MobileAuthSession" SET revoked_at=NULL WHERE id=$1', [phone.id]), /Account deletion is pending/);
        assert.equal(await db.mobileAuthSession.count({ where: { user_id: f.user.id, revoked_at: null } }), 0);
      } finally { db.$transaction = originalTransaction; await old.query('ROLLBACK'); old.release(); }
    });

    for (const order of ['intent-first', 'reset-first']) {
      await t.test(`${order}: password reset cannot clear pending intent or reuse an old deletion proof`, async () => {
        const f = await create();
        const token = await issueAccountActionToken(f.user.id, 'PASSWORD_RESET');
        const locked = deferred(), release = deferred(), waiting = deferred();
        let first = true;
        db.$transaction = action => originalTransaction(async tx => {
          const isFirst = first; first = false;
          if (!isFirst) waiting.resolve((await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid'))[0].pid);
          const value = await action(tx);
          if (isFirst) { locked.resolve(); await release.promise; }
          return value;
        }, { timeout: 15000 });
        const one = order === 'intent-first' ? begin(f) : resetPasswordWithToken(token, 'replacement-password');
        await locked.promise;
        const two = order === 'intent-first' ? resetPasswordWithToken(token, 'replacement-password') : begin(f);
        const outcomes = Promise.allSettled([one, two]);
        try { await waitForLock(await waiting.promise); } finally { release.resolve(); }
        const [a, b] = await outcomes;
        db.$transaction = originalTransaction;
        assert.equal(a.status, 'fulfilled');
        if (order === 'intent-first') {
          assert.equal((await db.user.findUnique({ where: { id: f.user.id } })).deletion_pending, true);
          assert.ok(b.status === 'rejected' || b.value === false);
          assert.equal((await receipt(f)).state, 'pending_provider');
        } else {
          assert.equal(a.value, true);
          assert.equal(b.status, 'rejected');
          assert.match(b.reason.message, /no longer current/);
          assert.equal(await receipt(f), null);
        }
        assert.equal(fs.existsSync(f.file), false);
      });
    }

    for (const order of ['intent-first', 'browser-first']) {
      await t.test(`${order}: a verified browser save cannot outlive accepted deletion`, async () => {
        const f = await create();
        const locked = deferred(), release = deferred(), waiting = deferred();
        const browserPool = {
          query: (...args) => scoped.query(...args),
          connect: async () => {
            const client = await scoped.connect();
            return { release: () => client.release(), query: async (sql, args) => {
              if (order === 'intent-first' && sql.startsWith('UPDATE "User"')) waiting.resolve(client.processID);
              if (order === 'browser-first' && sql === 'COMMIT') { locked.resolve(); await release.promise; }
              return client.query(sql, args);
            } };
          }
        };
        const store = new PostgresSessionStore(browserPool);
        const principal = { id: f.user.id };
        const sess = { cookie: { maxAge: 60000 }, passport: { user: f.user.id } };
        markVerifiedBrowserLogin(principal, f.user.id, f.user.credential_security_version);
        serializeBrowserLoginUser({ session: sess }, principal, error => { assert.ifError(error); });
        const save = () => new Promise((resolve, reject) => store.set(f.operation, sess, error => error ? reject(error) : resolve()));
        db.$transaction = action => originalTransaction(async tx => {
          if (order === 'browser-first') waiting.resolve((await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid'))[0].pid);
          const result = await action(tx);
          if (order === 'intent-first') { locked.resolve(); await release.promise; }
          return result;
        }, { timeout: 15000 });
        const one = order === 'intent-first' ? begin(f) : save();
        await locked.promise;
        const two = order === 'intent-first' ? save() : begin(f);
        const outcomes = Promise.allSettled([one, two]);
        try { await waitForLock(await waiting.promise); } finally { release.resolve(); }
        const [a, b] = await outcomes;
        db.$transaction = originalTransaction;
        assert.equal(a.status, 'fulfilled');
        assert.equal(b.status, order === 'intent-first' ? 'rejected' : 'fulfilled');
        assert.equal(await db.sessionStore.count({ where: { user_id: f.user.id } }), 0);
        await assert.rejects(save(), /Invalid email or password/);
      });
    }

    for (const stage of ['intent', 'provider', 'complete']) {
      await t.test(`actual process termination after ${stage} resumes the same durable operation`, async () => {
        const f = await create();
        const script = `
          const dbModule = require('./src/config/database');
          const { AccountDeletionCoordinator } = require('./src/services/accountDeletion');
          const provider = (${syntheticProvider.toString()})(${JSON.stringify(f.file)});
          const pause = async () => { process.send('checkpoint'); await new Promise(() => {}); };
          if (${JSON.stringify(stage)} === 'provider') { const remove = provider.delete; provider.delete = async (...args) => { await remove(...args); await pause(); }; }
          (async () => {
            const c = new AccountDeletionCoordinator(dbModule.default, provider);
            const proof = await c.authenticate(${f.user.id}, 'synthetic-password');
            await c.begin(${JSON.stringify(f.operation)}, proof);
            if (${JSON.stringify(stage)} === 'intent') await pause();
            await c.resume(${JSON.stringify(f.operation)});
            await pause();
          })().catch(e => { console.error(e.message); process.exit(1); });`;
        const child = spawn(process.execPath, ['-r', 'ts-node/register', '-e', script], { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        let output = '';
        child.stderr.on('data', chunk => { output += chunk; });
        const ready = new Promise((resolve, reject) => {
          child.once('message', resolve);
          child.once('exit', code => reject(Error(`child exited ${code}: ${output}`)));
        });
        const closed = new Promise(resolve => child.once('close', resolve));
        try { await ready; } finally { child.kill('SIGKILL'); }
        await closed;
        const recorded = await receipt(f);
        if (recorded.state !== 'complete') await db.accountDeletion.update({ where: { operation_id: f.operation }, data: { claim_until: new Date(0) } });
        assert.equal(await f.coordinator.resume(f.operation), 'complete');
        assert.equal(await db.user.findUnique({ where: { id: f.user.id } }), null);
        assert.equal((await receipt(f)).state, 'complete');
      });
    }

    await t.test('rollback refuses accepted receipts, and unrelated local accounts remain usable', async () => {
      const client = await scoped.connect();
      try { await assert.rejects(client.query(rollback), /Refusing rollback/); await client.query('ROLLBACK'); }
      finally { client.release(); }
      const local = await create(false);
      const session = await issue(local.user);
      assert.ok(await refreshMobileSession(session.refreshToken));
      const reset = await issueAccountActionToken(local.user.id, 'PASSWORD_RESET');
      assert.equal(await resetPasswordWithToken(reset, 'replacement-password'), true);
      await db.user.delete({ where: { id: local.user.id } });
    });
  } finally {
    if (database) await database.disconnectDatabase();
    if (scoped) await scoped.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    assert.equal(path.dirname(temp), os.tmpdir());
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
