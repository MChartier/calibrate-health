const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadGoalsRouter(prismaStub) {
  const dbPath = require.resolve('../src/config/database');
  const goalsPath = require.resolve('../src/routes/goals');

  const previousDbModule = require.cache[dbPath];
  delete require.cache[goalsPath];

  stubModule(dbPath, prismaStub);
  const loaded = require('../src/routes/goals');

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

test('goals route: rejects unauthenticated requests via router.use middleware', async () => {
  const prismaStub = { goal: {} };
  const router = loadGoalsRouter(prismaStub);
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

test('goals route: GET / returns null when the user has no goal', async () => {
  const prismaStub = {
    goal: {
      findFirst: async () => null
    }
  };
  const router = loadGoalsRouter(prismaStub);
  const isAuthenticated = getIsAuthenticatedMiddleware(router);
  const handler = getRouteHandler(router, 'get', '/');

  const req = {
    isAuthenticated: () => true,
    user: { id: 7, weight_unit: 'KG' }
  };
  const res = createRes();

  let nextCalled = false;
  await isAuthenticated(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});

test('goals route: GET / maps stored gram weights into the user unit', async () => {
  const goalRow = {
    id: 1,
    user_id: 7,
    created_at: new Date('2025-01-01T00:00:00Z'),
    start_weight_grams: 82000,
    target_weight_grams: 76000,
    target_date: null,
    daily_deficit: 500
  };

  const prismaStub = {
    goal: {
      findFirst: async () => goalRow
    }
  };
  const router = loadGoalsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG' }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: goalRow.id,
    user_id: goalRow.user_id,
    created_at: goalRow.created_at,
    target_date: goalRow.target_date,
    daily_deficit: goalRow.daily_deficit,
    start_weight: 82,
    target_weight: 76
  });
});

test('goals route: POST / validates daily_deficit and weight inputs before writing', async () => {
  const prismaStub = {
    goal: {
      create: async () => {
        throw new Error('should not be called');
      }
    }
  };
  const router = loadGoalsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG' },
    body: { start_weight: 82, target_weight: 76, daily_deficit: 123 }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    message: 'daily_deficit must be one of 0, ±250, ±500, ±750, or ±1000'
  });
});

test('goals route: POST / rejects incoherent start/target weights for loss goals', async () => {
  const prismaStub = {
    goal: {
      create: async () => {
        throw new Error('should not be called');
      }
    }
  };
  const router = loadGoalsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG' },
    body: { start_weight: 70, target_weight: 80, daily_deficit: 500 }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    message: 'For a weight loss goal, target weight must be less than start weight.'
  });
});

test('goals route: POST / creates a goal and returns weights in user units', async () => {
  const createdGoalRow = {
    id: 99,
    user_id: 7,
    created_at: new Date('2025-01-01T00:00:00Z'),
    start_weight_grams: 82000,
    target_weight_grams: 76000,
    target_date: null,
    daily_deficit: 500
  };

  const prismaStub = {
    goal: {
      create: async () => createdGoalRow
    }
  };
  const router = loadGoalsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, weight_unit: 'KG' },
    body: { start_weight: 82, target_weight: 76, daily_deficit: 500, target_date: null }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: createdGoalRow.id,
    user_id: createdGoalRow.user_id,
    created_at: createdGoalRow.created_at,
    target_date: createdGoalRow.target_date,
    daily_deficit: createdGoalRow.daily_deficit,
    start_weight: 82,
    target_weight: 76
  });
});

