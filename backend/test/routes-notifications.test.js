const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadNotificationsRouter({ prismaStub, getWebPushPublicKeyStub }) {
  const databasePath = require.resolve('../src/config/database');
  const webPushPath = require.resolve('../src/services/webPush');
  const inAppNotificationsPath = require.resolve('../src/services/inAppNotifications');
  const notificationsRoutePath = require.resolve('../src/routes/notifications');

  const previousDatabaseModule = require.cache[databasePath];
  const previousWebPushModule = require.cache[webPushPath];
  const previousInAppNotificationsModule = require.cache[inAppNotificationsPath];
  delete require.cache[notificationsRoutePath];

  stubModule(databasePath, prismaStub);
  stubModule(webPushPath, {
    getWebPushPublicKey: getWebPushPublicKeyStub || (() => ({ publicKey: 'test-public-key' }))
  });
  stubModule(inAppNotificationsPath, {
    listActiveInAppNotificationsForUser: async () => ({ notifications: [], unreadCount: 0 }),
    markInAppNotificationDismissed: async () => undefined,
    markInAppNotificationRead: async () => undefined,
    resolveInactiveReminderNotificationsForUser: async () => undefined
  });

  const loaded = require('../src/routes/notifications');

  if (previousDatabaseModule) require.cache[databasePath] = previousDatabaseModule;
  else delete require.cache[databasePath];

  if (previousWebPushModule) require.cache[webPushPath] = previousWebPushModule;
  else delete require.cache[webPushPath];

  if (previousInAppNotificationsModule) require.cache[inAppNotificationsPath] = previousInAppNotificationsModule;
  else delete require.cache[inAppNotificationsPath];

  return loaded.default ?? loaded;
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function getRouteHandlers(router, method, path) {
  const layer = router.stack.find(
    (candidate) => candidate.route && candidate.route.path === path && candidate.route.methods?.[method]
  );
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} route to exist`);
  return layer.route.stack.map((stackLayer) => stackLayer.handle);
}

test('notifications route: POST /subscription uses one atomic write for ownership handoff + dedupe reset', async () => {
  const executeRawCalls = [];
  const router = loadNotificationsRouter({
    prismaStub: {
      $executeRaw: async (query, ...values) => {
        executeRawCalls.push({ query, values });
        return 1;
      }
    }
  });

  const [handler] = getRouteHandlers(router, 'post', '/subscription');
  const req = {
    isAuthenticated: () => true,
    user: { id: 9 },
    body: {
      endpoint: 'https://example.test/browser-endpoint',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key'
      }
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(executeRawCalls.length, 1);
  const sqlText = executeRawCalls[0].query.join(' ');
  assert.match(sqlText, /ON CONFLICT \("endpoint"\)/);
  assert.match(sqlText, /"last_sent_local_date" = CASE/);
  assert.match(sqlText, /IS DISTINCT FROM/);
  assert.match(sqlText, /ELSE "PushSubscription"\."last_sent_local_date"/);
  assert.deepEqual(executeRawCalls[0].values, [
    9,
    'https://example.test/browser-endpoint',
    'p256dh-key',
    'auth-key',
    null
  ]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('notifications route: POST /subscription forwards expirationTime to the atomic write', async () => {
  const executeRawCalls = [];
  const expirationTimeMs = Date.UTC(2026, 1, 20, 16, 5, 0, 0);
  const router = loadNotificationsRouter({
    prismaStub: {
      $executeRaw: async (query, ...values) => {
        executeRawCalls.push({ query, values });
        return 1;
      }
    }
  });

  const [handler] = getRouteHandlers(router, 'post', '/subscription');
  const req = {
    isAuthenticated: () => true,
    user: { id: 9 },
    body: {
      endpoint: 'https://example.test/browser-endpoint',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key'
      },
      expirationTime: expirationTimeMs
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(executeRawCalls.length, 1);
  assert.ok(executeRawCalls[0].values[4] instanceof Date);
  assert.equal(executeRawCalls[0].values[4].getTime(), expirationTimeMs);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('notifications route: DELETE /subscription only removes endpoint rows for the authenticated user', async () => {
  const deleteManyCalls = [];
  const router = loadNotificationsRouter({
    prismaStub: {
      pushSubscription: {
        deleteMany: async (args) => {
          deleteManyCalls.push(args);
          return { count: 0 };
        }
      }
    }
  });

  const [handler] = getRouteHandlers(router, 'delete', '/subscription');
  const req = {
    isAuthenticated: () => true,
    user: { id: 9 },
    body: {
      endpoint: 'https://example.test/browser-endpoint'
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(deleteManyCalls.length, 1);
  assert.deepEqual(deleteManyCalls[0].where, {
    user_id: 9,
    endpoint: 'https://example.test/browser-endpoint'
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});
