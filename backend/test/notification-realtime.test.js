const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const {
  NOTIFICATION_REALTIME_REASONS,
  isNotificationRealtimePayload
} = require('../../shared/notificationRealtime');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadInAppNotificationService({ publishNotificationRealtimeUpdateStub }) {
  const dbPath = require.resolve('../src/config/database');
  const realtimePath = require.resolve('../src/services/notificationRealtime');
  const servicePath = require.resolve('../src/services/inAppNotifications');

  const previousDbModule = require.cache[dbPath];
  const previousRealtimeModule = require.cache[realtimePath];
  delete require.cache[servicePath];

  stubModule(dbPath, {});
  stubModule(realtimePath, {
    publishNotificationRealtimeUpdate: publishNotificationRealtimeUpdateStub
  });

  const loaded = require('../src/services/inAppNotifications');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];

  if (previousRealtimeModule) require.cache[realtimePath] = previousRealtimeModule;
  else delete require.cache[realtimePath];

  return loaded;
}

test('notification realtime publisher fans out only to the subscribed user and cleans up', () => {
  delete require.cache[require.resolve('../src/services/notificationRealtime')];
  const {
    getNotificationRealtimeSubscriberCount,
    publishNotificationRealtimeUpdate,
    subscribeToNotificationRealtimeUpdates
  } = require('../src/services/notificationRealtime');

  const userOnePayloads = [];
  const userTwoPayloads = [];
  const unsubscribeUserOne = subscribeToNotificationRealtimeUpdates({
    userId: 1,
    onUpdate: (payload) => userOnePayloads.push(payload)
  });
  const unsubscribeUserTwo = subscribeToNotificationRealtimeUpdates({
    userId: 2,
    onUpdate: (payload) => userTwoPayloads.push(payload)
  });

  assert.equal(getNotificationRealtimeSubscriberCount(1), 1);
  assert.equal(getNotificationRealtimeSubscriberCount(2), 1);

  publishNotificationRealtimeUpdate({
    userId: 1,
    reason: NOTIFICATION_REALTIME_REASONS.CREATED,
    now: new Date('2026-04-24T12:00:00.000Z')
  });

  assert.equal(userOnePayloads.length, 1);
  assert.equal(userOnePayloads[0].reason, NOTIFICATION_REALTIME_REASONS.CREATED);
  assert.equal(userOnePayloads[0].updated_at, '2026-04-24T12:00:00.000Z');
  assert.equal(userTwoPayloads.length, 0);

  unsubscribeUserOne();
  assert.equal(getNotificationRealtimeSubscriberCount(1), 0);

  publishNotificationRealtimeUpdate({
    userId: 1,
    reason: NOTIFICATION_REALTIME_REASONS.READ
  });

  assert.equal(userOnePayloads.length, 1);
  unsubscribeUserTwo();
});

test('notification realtime payload guard accepts the shared SSE wire shape', () => {
  assert.equal(
    isNotificationRealtimePayload({
      reason: NOTIFICATION_REALTIME_REASONS.DISMISSED,
      updated_at: '2026-04-24T12:00:00.000Z'
    }),
    true
  );
  assert.equal(isNotificationRealtimePayload({ reason: 'other', updated_at: '2026-04-24T12:00:00.000Z' }), false);
  assert.equal(isNotificationRealtimePayload({ reason: NOTIFICATION_REALTIME_REASONS.READ, updated_at: '' }), false);
});

test('in-app notification mutations publish realtime updates when rows change', async () => {
  const publishCalls = [];
  const { markInAppNotificationDismissed, markInAppNotificationRead } = loadInAppNotificationService({
    publishNotificationRealtimeUpdateStub: (args) => {
      publishCalls.push(args);
      return { reason: args.reason, updated_at: args.now.toISOString() };
    }
  });

  const now = new Date('2026-04-24T12:00:00.000Z');
  const db = {
    inAppNotification: {
      updateMany: async () => ({ count: 1 })
    }
  };

  const readCount = await markInAppNotificationRead({
    userId: 7,
    notificationId: 10,
    now,
    db
  });
  const dismissCount = await markInAppNotificationDismissed({
    userId: 7,
    notificationId: 10,
    now,
    db
  });

  assert.equal(readCount, 1);
  assert.equal(dismissCount, 1);
  assert.equal(publishCalls.length, 2);
  assert.deepEqual(
    publishCalls.map((call) => call.reason),
    [NOTIFICATION_REALTIME_REASONS.READ, NOTIFICATION_REALTIME_REASONS.DISMISSED]
  );
  assert.equal(publishCalls[0].userId, 7);
});

test('in-app notification mutations skip realtime publishing when nothing changed', async () => {
  let publishCount = 0;
  const { markInAppNotificationRead } = loadInAppNotificationService({
    publishNotificationRealtimeUpdateStub: () => {
      publishCount += 1;
    }
  });

  const result = await markInAppNotificationRead({
    userId: 7,
    notificationId: 10,
    db: {
      inAppNotification: {
        updateMany: async () => ({ count: 0 })
      }
    }
  });

  assert.equal(result, 0);
  assert.equal(publishCount, 0);
});
