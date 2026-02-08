const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadFoodDaysRouter(prismaStub) {
  const dbPath = require.resolve('../src/config/database');
  const routePath = require.resolve('../src/routes/foodDays');

  const previousDbModule = require.cache[dbPath];
  delete require.cache[routePath];

  stubModule(dbPath, prismaStub);
  const loaded = require('../src/routes/foodDays');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];

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

function getIsAuthenticatedMiddleware(router) {
  const layer = router.stack.find((candidate) => !candidate.route);
  assert.ok(layer, 'Expected router.use(isAuthenticated) middleware to exist');
  return layer.handle;
}

function getRouteHandler(router, method, path) {
  const layer = router.stack.find(
    (candidate) => candidate.route && candidate.route.path === path && candidate.route.methods?.[method]
  );
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} route to exist`);
  assert.equal(layer.route.stack.length, 1);
  return layer.route.stack[0].handle;
}

test('food-days route: rejects unauthenticated requests via router.use middleware', async () => {
  const router = loadFoodDaysRouter({ foodLogDay: {} });
  const isAuthenticated = getIsAuthenticatedMiddleware(router);

  const req = { isAuthenticated: () => false };
  const res = createRes();

  let nextCalled = false;
  await isAuthenticated(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Not authenticated' });
});

test('food-days route: GET / returns default incomplete status when no row exists', async () => {
  let receivedWhere = null;
  const prismaStub = {
    foodLogDay: {
      findUnique: async ({ where }) => {
        receivedWhere = where;
        return null;
      }
    }
  };

  const router = loadFoodDaysRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');
  const req = { user: { id: 7 }, query: { date: '2025-01-02' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { date: '2025-01-02', is_complete: false, completed_at: null });
  assert.equal(receivedWhere.user_id_local_date.user_id, 7);
  assert.equal(receivedWhere.user_id_local_date.local_date.toISOString(), '2025-01-02T00:00:00.000Z');
});

test('food-days route: GET /range returns inclusive day statuses for start/end', async () => {
  let receivedWhere = null;
  const completedAt = new Date('2025-01-02T17:00:00Z');

  const prismaStub = {
    foodLogDay: {
      findMany: async ({ where }) => {
        receivedWhere = where;
        return [
          {
            local_date: new Date('2025-01-02T00:00:00Z'),
            is_complete: true,
            completed_at: completedAt
          }
        ];
      }
    }
  };

  const router = loadFoodDaysRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/range');
  const req = { user: { id: 7 }, query: { start: '2025-01-01', end: '2025-01-03' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    start_date: '2025-01-01',
    end_date: '2025-01-03',
    days: [
      { date: '2025-01-01', is_complete: false, completed_at: null },
      { date: '2025-01-02', is_complete: true, completed_at: completedAt },
      { date: '2025-01-03', is_complete: false, completed_at: null }
    ]
  });

  assert.equal(receivedWhere.user_id, 7);
  assert.equal(receivedWhere.local_date.gte.toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(receivedWhere.local_date.lte.toISOString(), '2025-01-03T00:00:00.000Z');
});

test('food-days route: GET /range supports month query', async () => {
  const prismaStub = {
    foodLogDay: {
      findMany: async () => []
    }
  };

  const router = loadFoodDaysRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/range');
  const req = { user: { id: 7 }, query: { month: '2025-02' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.start_date, '2025-02-01');
  assert.equal(res.body.end_date, '2025-02-28');
  assert.equal(Array.isArray(res.body.days), true);
  assert.equal(res.body.days.length, 28);
  assert.equal(res.body.days[0].date, '2025-02-01');
  assert.equal(res.body.days[27].date, '2025-02-28');
});

test('food-days route: GET /range validates query shape', async () => {
  const prismaStub = {
    foodLogDay: {
      findMany: async () => {
        throw new Error('should not be called');
      }
    }
  };

  const router = loadFoodDaysRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/range');

  const mixedReq = { user: { id: 7 }, query: { month: '2025-01', start: '2025-01-01', end: '2025-01-31' } };
  const mixedRes = createRes();
  await handler(mixedReq, mixedRes);
  assert.equal(mixedRes.statusCode, 400);
  assert.deepEqual(mixedRes.body, { message: 'Provide either month or start/end' });

  const invalidMonthReq = { user: { id: 7 }, query: { month: '2025-99' } };
  const invalidMonthRes = createRes();
  await handler(invalidMonthReq, invalidMonthRes);
  assert.equal(invalidMonthRes.statusCode, 400);
  assert.deepEqual(invalidMonthRes.body, { message: 'Invalid month' });

  const missingStartReq = { user: { id: 7 }, query: { end: '2025-01-10' } };
  const missingStartRes = createRes();
  await handler(missingStartReq, missingStartRes);
  assert.equal(missingStartRes.statusCode, 400);
  assert.deepEqual(missingStartRes.body, { message: 'Provide start and end dates' });
});

