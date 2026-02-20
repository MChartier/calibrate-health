const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const {
  NOTIFICATION_DELIVERY_CHANNELS,
} = require('../../shared/notificationDelivery');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadNotificationDeliveryService({ prismaStub, webPushStub }) {
  const dbPath = require.resolve('../src/config/database');
  const webPushPath = require.resolve('../src/services/webPush');
  const servicePath = require.resolve('../src/services/notificationDelivery');

  const previousDbModule = require.cache[dbPath];
  const previousWebPushModule = require.cache[webPushPath];
  delete require.cache[servicePath];

  stubModule(dbPath, prismaStub);
  stubModule(webPushPath, webPushStub);

  const loaded = require('../src/services/notificationDelivery');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];

  if (previousWebPushModule) require.cache[webPushPath] = previousWebPushModule;
  else delete require.cache[webPushPath];

  return loaded;
}

test('deliverUserNotification creates one in-app notification and dedupes repeated keys', async () => {
  const existingByKey = new Set();
  const createdRows = [];

  const prismaStub = {
    inAppNotification: {
      findUnique: async ({ where }) => {
        const dedupeKey = where.user_id_dedupe_key.dedupe_key;
        return existingByKey.has(dedupeKey) ? { id: 99 } : null;
      },
      create: async ({ data }) => {
        if (data.dedupe_key) {
          existingByKey.add(data.dedupe_key);
        }
        createdRows.push(data);
        return { id: createdRows.length };
      }
    },
    pushSubscription: {
      findUnique: async () => null,
      findMany: async () => [],
      update: async () => {
        throw new Error('should not be called');
      },
      delete: async () => {
        throw new Error('should not be called');
      }
    }
  };

  const webPushStub = {
    ensureWebPushConfigured: () => ({ ok: true }),
    sendWebPushNotification: async () => {
      throw new Error('should not be called');
    }
  };

  const { deliverUserNotification } = loadNotificationDeliveryService({
    prismaStub,
    webPushStub
  });

  const localDate = new Date('2026-02-08T00:00:00.000Z');

  const first = await deliverUserNotification({
    userId: 1,
    channels: [NOTIFICATION_DELIVERY_CHANNELS.IN_APP],
    inApp: {
      type: 'GENERIC',
      localDate,
      title: 'Test title',
      body: 'Test body',
      actionUrl: '/dashboard',
      dedupeKey: 'dev:test:1'
    }
  });

  const second = await deliverUserNotification({
    userId: 1,
    channels: [NOTIFICATION_DELIVERY_CHANNELS.IN_APP],
    inApp: {
      type: 'GENERIC',
      localDate,
      title: 'Test title',
      body: 'Test body',
      actionUrl: '/dashboard',
      dedupeKey: 'dev:test:1'
    }
  });

  assert.equal(first.inApp.created, 1);
  assert.equal(first.inApp.skipped, false);
  assert.equal(first.inApp.deduped, false);
  assert.equal(second.inApp.created, 0);
  assert.equal(second.inApp.skipped, true);
  assert.equal(second.inApp.deduped, true);
  assert.equal(createdRows.length, 1);
  assert.equal(createdRows[0].title, 'Test title');
  assert.equal(createdRows[0].body, 'Test body');
  assert.equal(createdRows[0].action_url, '/dashboard');
});

test('deliverUserNotification skips push when endpoint lookup fails', async () => {
  const prismaStub = {
    inAppNotification: {
      findUnique: async () => null,
      create: async () => {
        throw new Error('should not be called');
      }
    },
    pushSubscription: {
      findUnique: async () => null,
      findMany: async () => {
        throw new Error('should not be called');
      },
      update: async () => {
        throw new Error('should not be called');
      },
      delete: async () => {
        throw new Error('should not be called');
      }
    }
  };

  const webPushStub = {
    ensureWebPushConfigured: () => ({ ok: true }),
    sendWebPushNotification: async () => {
      throw new Error('should not be called');
    }
  };

  const { deliverUserNotification } = loadNotificationDeliveryService({
    prismaStub,
    webPushStub
  });

  const result = await deliverUserNotification({
    userId: 9,
    channels: [NOTIFICATION_DELIVERY_CHANNELS.PUSH],
    push: {
      endpoint: 'https://example.test/push-endpoint',
      payload: {
        title: 'calibrate',
        body: 'hello',
        url: '/'
      }
    }
  });

  assert.equal(result.push.sent, 0);
  assert.equal(result.push.failed, 0);
  assert.equal(result.push.skipped, true);
  assert.equal(result.push.deduped, false);
  assert.match(result.push.message, /No push subscription found/);
});

test('deliverUserNotification sends push and updates last sent date for successful deliveries', async () => {
  const updateCalls = [];
  const sendCalls = [];

  const prismaStub = {
    inAppNotification: {
      findUnique: async () => null,
      create: async () => {
        throw new Error('should not be called');
      }
    },
    pushSubscription: {
      findUnique: async () => ({
        id: 42,
        endpoint: 'https://example.test/push-endpoint',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        last_sent_local_date: null
      }),
      findMany: async () => [],
      update: async (args) => {
        updateCalls.push(args);
        return { id: args.where.id };
      },
      delete: async () => {
        throw new Error('should not be called');
      }
    }
  };

  const webPushStub = {
    ensureWebPushConfigured: () => ({ ok: true }),
    sendWebPushNotification: async (subscription, payload) => {
      sendCalls.push({ subscription, payload });
      return {};
    }
  };

  const { deliverUserNotification } = loadNotificationDeliveryService({
    prismaStub,
    webPushStub
  });

  const localDate = new Date('2026-02-08T00:00:00.000Z');
  const result = await deliverUserNotification({
    userId: 2,
    channels: [NOTIFICATION_DELIVERY_CHANNELS.PUSH],
    push: {
      endpoint: 'https://example.test/push-endpoint',
      payload: {
        title: 'calibrate',
        body: 'Log your weight for today.',
        url: '/log?quickAdd=weight'
      },
      skipIfLastSentLocalDate: localDate,
      markSentLocalDate: localDate
    }
  });

  assert.equal(result.push.sent, 1);
  assert.equal(result.push.failed, 0);
  assert.equal(result.push.deduped, false);
  assert.equal(sendCalls.length, 1);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].where.id, 42);
  assert.equal(updateCalls[0].data.last_sent_local_date.getTime(), localDate.getTime());
});

test('deliverUserNotification skips push when local-day send already happened', async () => {
  let sendAttempts = 0;

  const localDate = new Date('2026-02-08T00:00:00.000Z');
  const prismaStub = {
    inAppNotification: {
      findUnique: async () => null,
      create: async () => {
        throw new Error('should not be called');
      }
    },
    pushSubscription: {
      findUnique: async () => ({
        id: 11,
        endpoint: 'https://example.test/push-endpoint',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        last_sent_local_date: localDate
      }),
      findMany: async () => [],
      update: async () => {
        throw new Error('should not be called');
      },
      delete: async () => {
        throw new Error('should not be called');
      }
    }
  };

  const webPushStub = {
    ensureWebPushConfigured: () => ({ ok: true }),
    sendWebPushNotification: async () => {
      sendAttempts += 1;
      return {};
    }
  };

  const { deliverUserNotification } = loadNotificationDeliveryService({
    prismaStub,
    webPushStub
  });

  const result = await deliverUserNotification({
    userId: 2,
    channels: [NOTIFICATION_DELIVERY_CHANNELS.PUSH],
    push: {
      endpoint: 'https://example.test/push-endpoint',
      payload: {
        title: 'calibrate',
        body: 'Log your food for today.',
        url: '/log?quickAdd=food'
      },
      skipIfLastSentLocalDate: localDate,
      markSentLocalDate: localDate
    }
  });

  assert.equal(sendAttempts, 0);
  assert.equal(result.push.sent, 0);
  assert.equal(result.push.failed, 0);
  assert.equal(result.push.skipped, true);
  assert.equal(result.push.deduped, true);
  assert.match(result.push.message, /already received this reminder/);
});
