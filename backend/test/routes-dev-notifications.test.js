const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const {
  NOTIFICATION_DELIVERY_CHANNELS,
  DEFAULT_NOTIFICATION_DELIVERY_CHANNELS
} = require('../../shared/notificationDelivery');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadDevRouter({ deliverUserNotificationStub, buildReminderPayloadStub }) {
  const foodDataPath = require.resolve('../src/services/foodData');
  const notificationDeliveryPath = require.resolve('../src/services/notificationDelivery');
  const pushPayloadPath = require.resolve('../src/services/pushNotificationPayloads');
  const devRoutePath = require.resolve('../src/routes/dev');

  const previousFoodDataModule = require.cache[foodDataPath];
  const previousNotificationDeliveryModule = require.cache[notificationDeliveryPath];
  const previousPushPayloadModule = require.cache[pushPayloadPath];
  delete require.cache[devRoutePath];

  stubModule(foodDataPath, {
    listFoodDataProviders: () => [],
    getFoodDataProviderByName: () => ({ provider: null, error: 'Provider is not available.' })
  });

  stubModule(notificationDeliveryPath, {
    deliverUserNotification: deliverUserNotificationStub
  });

  stubModule(pushPayloadPath, {
    buildReminderPayload:
      buildReminderPayloadStub ||
      (() => ({
        title: 'calibrate',
        body: 'Log your progress for today.',
        url: '/log'
      }))
  });

  const loaded = require('../src/routes/dev');

  if (previousFoodDataModule) require.cache[foodDataPath] = previousFoodDataModule;
  else delete require.cache[foodDataPath];

  if (previousNotificationDeliveryModule) require.cache[notificationDeliveryPath] = previousNotificationDeliveryModule;
  else delete require.cache[notificationDeliveryPath];

  if (previousPushPayloadModule) require.cache[pushPayloadPath] = previousPushPayloadModule;
  else delete require.cache[pushPayloadPath];

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

test('dev notifications: test endpoint defaults to push + in-app delivery', async () => {
  const deliveryCalls = [];
  const router = loadDevRouter({
    deliverUserNotificationStub: async (args) => {
      deliveryCalls.push(args);
      return {
        channels: args.channels,
        inApp: { attempted: true, created: 1, skipped: false },
        push: { attempted: true, sent: 1, failed: 0, skipped: false }
      };
    }
  });

  const [authMiddleware, handler] = getRouteHandlers(router, 'post', '/notifications/test');
  const req = {
    isAuthenticated: () => true,
    user: { id: 3, timezone: 'UTC' },
    body: {
      endpoint: 'https://example.test/browser-endpoint'
    }
  };
  const res = createRes();

  let nextCalled = false;
  await authMiddleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  await handler(req, res);

  assert.equal(deliveryCalls.length, 1);
  assert.deepEqual(deliveryCalls[0].channels, [...DEFAULT_NOTIFICATION_DELIVERY_CHANNELS]);
  assert.equal(deliveryCalls[0].push.endpoint, 'https://example.test/browser-endpoint');
  assert.equal(deliveryCalls[0].inApp.type, 'GENERIC');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
});

test('dev notifications: in-app only delivery does not require a push endpoint', async () => {
  const deliveryCalls = [];
  const router = loadDevRouter({
    deliverUserNotificationStub: async (args) => {
      deliveryCalls.push(args);
      return {
        channels: args.channels,
        inApp: { attempted: true, created: 1, skipped: false },
        push: { attempted: false, sent: 0, failed: 0, skipped: true }
      };
    }
  });

  const [authMiddleware, handler] = getRouteHandlers(router, 'post', '/notifications/log-food');
  const req = {
    isAuthenticated: () => true,
    user: { id: 3, timezone: 'UTC' },
    body: {
      channels: [NOTIFICATION_DELIVERY_CHANNELS.IN_APP]
    }
  };
  const res = createRes();

  let nextCalled = false;
  await authMiddleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  await handler(req, res);

  assert.equal(deliveryCalls.length, 1);
  assert.deepEqual(deliveryCalls[0].channels, [NOTIFICATION_DELIVERY_CHANNELS.IN_APP]);
  assert.equal(deliveryCalls[0].inApp.type, 'LOG_FOOD_REMINDER');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
});

test('dev notifications: returns 400 when push is selected without endpoint', async () => {
  let callCount = 0;
  const router = loadDevRouter({
    deliverUserNotificationStub: async () => {
      callCount += 1;
      return {
        channels: [NOTIFICATION_DELIVERY_CHANNELS.PUSH],
        inApp: { attempted: false, created: 0, skipped: true },
        push: { attempted: true, sent: 0, failed: 0, skipped: true }
      };
    }
  });

  const [authMiddleware, handler] = getRouteHandlers(router, 'post', '/notifications/log-weight');
  const req = {
    isAuthenticated: () => true,
    user: { id: 3, timezone: 'UTC' },
    body: {
      channels: [NOTIFICATION_DELIVERY_CHANNELS.PUSH]
    }
  };
  const res = createRes();

  let nextCalled = false;
  await authMiddleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  await handler(req, res);

  assert.equal(callCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    message: 'Endpoint is required when push delivery is selected.'
  });
});

test('dev notifications: returns 400 when channel selection is empty', async () => {
  let callCount = 0;
  const router = loadDevRouter({
    deliverUserNotificationStub: async () => {
      callCount += 1;
      return {
        channels: [],
        inApp: { attempted: false, created: 0, skipped: true },
        push: { attempted: false, sent: 0, failed: 0, skipped: true }
      };
    }
  });

  const [authMiddleware, handler] = getRouteHandlers(router, 'post', '/notifications/test');
  const req = {
    isAuthenticated: () => true,
    user: { id: 3, timezone: 'UTC' },
    body: {
      channels: []
    }
  };
  const res = createRes();

  let nextCalled = false;
  await authMiddleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  await handler(req, res);

  assert.equal(callCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    message: 'Select at least one notification channel.'
  });
});
