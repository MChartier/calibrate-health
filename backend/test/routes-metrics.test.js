const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const POUNDS_PER_KILOGRAM = 2.2046226218487757;
const FLOAT_TOLERANCE = 1e-9;

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadMetricsRouter(prismaStub) {
  const dbPath = require.resolve('../src/config/database');
  const metricsPath = require.resolve('../src/routes/metrics');

  const previousDbModule = require.cache[dbPath];
  delete require.cache[metricsPath];

  stubModule(dbPath, prismaStub);
  const loaded = require('../src/routes/metrics');

  if (previousDbModule) {
    require.cache[dbPath] = previousDbModule;
  } else {
    delete require.cache[dbPath];
  }

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
    },
    send(payload) {
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

function assertNearlyEqual(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= FLOAT_TOLERANCE, `Expected ${actual} to be within ${FLOAT_TOLERANCE} of ${expected}`);
}

test('metrics route: rejects unauthenticated requests via router.use middleware', async () => {
  const prismaStub = { bodyMetric: {} };
  const router = loadMetricsRouter(prismaStub);
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

test('metrics route: GET / validates start/end query params when provided', async () => {
  const prismaStub = {
    bodyMetric: {
      findMany: async () => {
        throw new Error('should not be called');
      }
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG' },
    query: { start: 'not-a-date' }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid date range' });
});

test('metrics route: GET / validates include_trend query values', async () => {
  const prismaStub = {
    bodyMetric: {
      findMany: async () => {
        throw new Error('should not be called');
      }
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG' },
    query: { include_trend: 'maybe' }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid include_trend option' });
});

test('metrics route: GET / validates range query values', async () => {
  const prismaStub = {
    bodyMetric: {
      findMany: async () => {
        throw new Error('should not be called');
      }
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG' },
    query: { range: 'quarter' }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid range option' });
});

test('metrics route: GET / returns metrics with weight converted to the user unit', async () => {
  const rows = [
    {
      id: 2,
      user_id: 7,
      date: new Date('2025-01-01T00:00:00Z'),
      weight_grams: 1000,
      body_fat_percent: 20.5
    },
    {
      id: 1,
      user_id: 7,
      date: new Date('2025-01-02T00:00:00Z'),
      weight_grams: 68039,
      body_fat_percent: null
    }
  ];

  const prismaStub = {
    bodyMetric: {
      findMany: async () => rows
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');

  const req = {
    user: { id: 7, weight_unit: 'LB' },
    query: {}
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  // Query order is ascending; response should remain newest-first.
  assert.deepEqual(res.body, [
    {
      id: 1,
      user_id: 7,
      date: rows[1].date,
      body_fat_percent: null,
      weight: 150
    },
    {
      id: 2,
      user_id: 7,
      date: rows[0].date,
      body_fat_percent: 20.5,
      weight: 2.2
    }
  ]);
});

test('metrics route: GET / returns trend-augmented payload when include_trend=true', async () => {
  const rows = [
    {
      id: 1,
      user_id: 7,
      date: new Date('2025-01-01T00:00:00Z'),
      weight_grams: 80000,
      body_fat_percent: null
    },
    {
      id: 2,
      user_id: 7,
      date: new Date('2025-01-02T00:00:00Z'),
      weight_grams: 79800,
      body_fat_percent: null
    },
    {
      id: 3,
      user_id: 7,
      date: new Date('2025-01-03T00:00:00Z'),
      weight_grams: 79600,
      body_fat_percent: null
    }
  ];

  const prismaStub = {
    bodyMetric: {
      findMany: async () => rows
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG' },
    query: { include_trend: 'true', range: 'week' }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body.metrics), true);
  assert.equal(res.body.metrics.length, 3);
  assert.deepEqual(res.body.meta.total_points, 3);
  assert.equal(typeof res.body.meta.weekly_rate, 'number');
  assert.equal(typeof res.body.meta.total_span_days, 'number');
  assert.ok(['low', 'medium', 'high'].includes(res.body.meta.volatility));

  const newest = res.body.metrics[0];
  assert.equal(typeof newest.weight, 'number');
  assert.equal(typeof newest.trend_weight, 'number');
  assert.equal(typeof newest.trend_ci_lower, 'number');
  assert.equal(typeof newest.trend_ci_upper, 'number');
  assert.equal(typeof newest.trend_std, 'number');
});

test('metrics route: GET / trend payload stays unit-invariant across KG and LB preferences', async () => {
  const rows = [
    {
      id: 1,
      user_id: 7,
      date: new Date('2025-01-01T00:00:00Z'),
      weight_grams: 81200,
      body_fat_percent: null
    },
    {
      id: 2,
      user_id: 7,
      date: new Date('2025-01-03T00:00:00Z'),
      weight_grams: 80850,
      body_fat_percent: null
    },
    {
      id: 3,
      user_id: 7,
      date: new Date('2025-01-06T00:00:00Z'),
      weight_grams: 80650,
      body_fat_percent: null
    },
    {
      id: 4,
      user_id: 7,
      date: new Date('2025-01-10T00:00:00Z'),
      weight_grams: 80400,
      body_fat_percent: null
    }
  ];

  const prismaStub = {
    bodyMetric: {
      findMany: async () => rows
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');

  const kgReq = {
    user: { id: 7, weight_unit: 'KG' },
    query: { include_trend: 'true', range: 'all' }
  };
  const kgRes = createRes();
  await handler(kgReq, kgRes);
  assert.equal(kgRes.statusCode, 200);

  const lbReq = {
    user: { id: 7, weight_unit: 'LB' },
    query: { include_trend: 'true', range: 'all' }
  };
  const lbRes = createRes();
  await handler(lbReq, lbRes);
  assert.equal(lbRes.statusCode, 200);

  assert.equal(lbRes.body.metrics.length, kgRes.body.metrics.length);
  assert.equal(lbRes.body.meta.total_points, kgRes.body.meta.total_points);
  assert.equal(lbRes.body.meta.total_span_days, kgRes.body.meta.total_span_days);
  assert.equal(lbRes.body.meta.volatility, kgRes.body.meta.volatility);
  assertNearlyEqual(lbRes.body.meta.weekly_rate, kgRes.body.meta.weekly_rate * POUNDS_PER_KILOGRAM);

  for (let i = 0; i < kgRes.body.metrics.length; i += 1) {
    const kgMetric = kgRes.body.metrics[i];
    const lbMetric = lbRes.body.metrics[i];

    assert.equal(lbMetric.id, kgMetric.id);
    assert.equal(lbMetric.date.getTime(), kgMetric.date.getTime());
    assertNearlyEqual(lbMetric.trend_weight, kgMetric.trend_weight * POUNDS_PER_KILOGRAM);
    assertNearlyEqual(lbMetric.trend_ci_lower, kgMetric.trend_ci_lower * POUNDS_PER_KILOGRAM);
    assertNearlyEqual(lbMetric.trend_ci_upper, kgMetric.trend_ci_upper * POUNDS_PER_KILOGRAM);
    assertNearlyEqual(lbMetric.trend_std, kgMetric.trend_std * POUNDS_PER_KILOGRAM);
  }
});

test('metrics route: POST / rejects invalid date values', async () => {
  const prismaStub = { bodyMetric: {} };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG', timezone: 'UTC' },
    body: { date: 'bad-date', weight: 70 }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid date' });
});

test('metrics route: POST / rejects empty updates', async () => {
  const prismaStub = { bodyMetric: {} };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG', timezone: 'UTC' },
    body: { date: '2025-01-01' }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'No fields to update' });
});

test('metrics route: POST / requires weight when creating a new day via body_fat_percent-only update', async () => {
  const prismaStub = {
    bodyMetric: {
      findUnique: async () => null
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG', timezone: 'UTC' },
    body: { date: '2025-01-01', body_fat_percent: 20 }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Weight is required for a new day' });
});

test('metrics route: POST / updates existing metrics when weight is omitted', async () => {
  const updatedRow = {
    id: 5,
    user_id: 7,
    date: new Date('2025-01-01T00:00:00Z'),
    weight_grams: 82000,
    body_fat_percent: 18.2
  };

  const prismaStub = {
    bodyMetric: {
      findUnique: async () => ({ id: 5 }),
      update: async () => updatedRow
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG', timezone: 'UTC' },
    body: { date: '2025-01-01', body_fat_percent: 18.2 }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: 5,
    user_id: 7,
    date: updatedRow.date,
    body_fat_percent: 18.2,
    weight: 82
  });
});

test('metrics route: POST / upserts metrics when weight is provided', async () => {
  const upsertedRow = {
    id: 9,
    user_id: 7,
    date: new Date('2025-01-01T00:00:00Z'),
    weight_grams: 68039,
    body_fat_percent: null
  };

  const prismaStub = {
    bodyMetric: {
      upsert: async () => upsertedRow
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, weight_unit: 'LB', timezone: 'UTC' },
    body: { date: '2025-01-01', weight: 150 }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: upsertedRow.id,
    user_id: upsertedRow.user_id,
    date: upsertedRow.date,
    body_fat_percent: upsertedRow.body_fat_percent,
    weight: 150
  });
});

test('metrics route: DELETE /:id validates ids and handles not-found deletes', async () => {
  const prismaStub = {
    bodyMetric: {
      deleteMany: async () => ({ count: 0 })
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'delete', '/:id');

  const invalidReq = { user: { id: 7 }, params: { id: 'abc' } };
  const invalidRes = createRes();
  await handler(invalidReq, invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalidRes.body, { message: 'Invalid metric id' });

  const missingReq = { user: { id: 7 }, params: { id: '123' } };
  const missingRes = createRes();
  await handler(missingReq, missingRes);
  assert.equal(missingRes.statusCode, 404);
  assert.deepEqual(missingRes.body, { message: 'Metric not found' });
});

test('metrics route: DELETE /:id returns 204 when a row is deleted', async () => {
  const prismaStub = {
    bodyMetric: {
      deleteMany: async () => ({ count: 1 })
    }
  };
  const router = loadMetricsRouter(prismaStub);
  const handler = getRouteHandler(router, 'delete', '/:id');

  const req = { user: { id: 7 }, params: { id: '123' } };
  const res = createRes();
  await handler(req, res);

  assert.equal(res.statusCode, 204);
});
