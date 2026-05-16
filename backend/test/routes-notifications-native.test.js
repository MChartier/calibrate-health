const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadNotificationsRouter({ prismaStub }) {
  const dbPath = require.resolve('../src/config/database');
  const webPushPath = require.resolve('../src/services/webPush');
  const routePath = require.resolve('../src/routes/notifications');

  const previousDbModule = require.cache[dbPath];
  const previousWebPushModule = require.cache[webPushPath];
  delete require.cache[routePath];

  stubModule(dbPath, prismaStub);
  stubModule(webPushPath, {
    getWebPushPublicKey: () => ({ publicKey: 'public-key' })
  });

  const loaded = require('../src/routes/notifications');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];
  if (previousWebPushModule) require.cache[webPushPath] = previousWebPushModule;
  else delete require.cache[webPushPath];

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

test('notifications route: registers native Expo push tokens per device', async () => {
  let upsertArgs = null;
  const router = loadNotificationsRouter({
    prismaStub: {
      nativePushSubscription: {
        upsert: async (args) => {
          upsertArgs = args;
          return { id: 1 };
        }
      }
    }
  });
  const [handler] = getRouteHandlers(router, 'post', '/native-subscription');
  const req = {
    isAuthenticated: () => true,
    user: { id: 5 },
    body: {
      token: 'ExponentPushToken[test]',
      device_id: 'device-1',
      platform: 'android',
      provider: 'expo'
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(upsertArgs.where.user_id_provider_token.user_id, 5);
  assert.equal(upsertArgs.where.user_id_provider_token.provider, 'EXPO');
  assert.equal(upsertArgs.where.user_id_provider_token.token, 'ExponentPushToken[test]');
  assert.equal(upsertArgs.create.device_id, 'device-1');
});

test('notifications route: rejects native subscription without token', async () => {
  const router = loadNotificationsRouter({
    prismaStub: {
      nativePushSubscription: {
        upsert: async () => {
          throw new Error('should not be called');
        }
      }
    }
  });
  const [handler] = getRouteHandlers(router, 'post', '/native-subscription');
  const res = createRes();

  await handler({ user: { id: 5 }, body: { device_id: 'device-1' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'token and device_id are required.' });
});
