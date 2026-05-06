const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadFoodRouter({ prismaStub, foodDataStub }) {
  const dbPath = require.resolve('../src/config/database');
  const foodDataPath = require.resolve('../src/services/foodData');
  const foodRoutePath = require.resolve('../src/routes/food');

  const previousDbModule = require.cache[dbPath];
  const previousFoodDataModule = require.cache[foodDataPath];

  delete require.cache[foodRoutePath];

  stubModule(dbPath, prismaStub);
  stubModule(foodDataPath, foodDataStub);

  const loaded = require('../src/routes/food');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];

  if (previousFoodDataModule) require.cache[foodDataPath] = previousFoodDataModule;
  else delete require.cache[foodDataPath];

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

test('food route: rejects unauthenticated requests via router.use middleware', async () => {
  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
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

test('food route: GET /search requires query or barcode', async () => {
  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });

  const handler = getRouteHandler(router, 'get', '/search');
  const req = { query: {}, headers: {} };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Provide a search query or barcode.' });
});

test('food route: GET /search calls provider.searchFoods and returns provider metadata', async () => {
  let receivedRequest = null;

  const providerStub = {
    name: 'openFoodFacts',
    supportsBarcodeLookup: true,
    searchFoods: async (request) => {
      receivedRequest = request;
      return { items: [{ id: '1', source: 'openFoodFacts', description: 'Test', availableMeasures: [] }] };
    }
  };

  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: {
      getEnabledFoodDataProviders: () => ({
        primary: { name: 'openFoodFacts', label: 'Open Food Facts', supportsBarcodeLookup: true, ready: true },
        providers: [{ name: 'openFoodFacts', label: 'Open Food Facts', supportsBarcodeLookup: true, ready: true }]
      }),
      getFoodDataProviderByName: (name) => {
        if (name === 'openFoodFacts') return { provider: providerStub };
        return { error: 'unknown provider' };
      }
    }
  });

  const handler = getRouteHandler(router, 'get', '/search');
  const req = {
    query: { q: 'apple', page: '2', pageSize: '10', grams: '50', lc: 'en' },
    headers: { 'accept-language': 'fr-FR,fr;q=0.9' }
  };
  const res = createRes();

  await handler(req, res);

  assert.deepEqual(receivedRequest, {
    query: 'apple',
    barcode: undefined,
    page: 2,
    pageSize: 10,
    quantityInGrams: 50,
    languageCode: 'en'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.provider, 'openFoodFacts');
  assert.equal(res.body.supportsBarcodeLookup, true);
  assert.equal(Array.isArray(res.body.items), true);
});

test('food route: GET /search keeps text pagination pinned when a provider returns no matches', async () => {
  const callOrder = [];
  const providerA = {
    name: 'fatsecret',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      callOrder.push('fatsecret');
      return { items: [] };
    }
  };
  const providerB = {
    name: 'usda',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      callOrder.push('usda');
      return { items: [{ id: '2', source: 'usda', description: 'Apple', availableMeasures: [] }] };
    }
  };

  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: {
      getEnabledFoodDataProviders: () => ({
        primary: { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
        providers: [
          { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
          { name: 'usda', label: 'USDA FoodData Central', supportsBarcodeLookup: true, ready: true }
        ]
      }),
      getFoodDataProviderByName: (name) => {
        if (name === 'fatsecret') return { provider: providerA };
        if (name === 'usda') return { provider: providerB };
        return { error: 'unknown provider' };
      }
    }
  });

  const handler = getRouteHandler(router, 'get', '/search');
  const req = { query: { q: 'apple', page: '2' }, headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.provider, 'fatsecret');
  assert.equal(res.body.items.length, 0);
  assert.deepEqual(callOrder, ['fatsecret']);
});

test('food route: GET /search falls back to the next provider when text search errors', async () => {
  const callOrder = [];
  const providerA = {
    name: 'fatsecret',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      callOrder.push('fatsecret');
      throw new Error('upstream unavailable');
    }
  };
  const providerB = {
    name: 'usda',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      callOrder.push('usda');
      return { items: [{ id: '2', source: 'usda', description: 'Apple', availableMeasures: [] }] };
    }
  };

  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: {
      getEnabledFoodDataProviders: () => ({
        primary: { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
        providers: [
          { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
          { name: 'usda', label: 'USDA FoodData Central', supportsBarcodeLookup: true, ready: true }
        ]
      }),
      getFoodDataProviderByName: (name) => {
        if (name === 'fatsecret') return { provider: providerA };
        if (name === 'usda') return { provider: providerB };
        return { error: 'unknown provider' };
      }
    }
  });

  const handler = getRouteHandler(router, 'get', '/search');
  const req = { query: { q: 'apple' }, headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.provider, 'usda');
  assert.equal(res.body.items.length, 1);
  assert.deepEqual(callOrder, ['fatsecret', 'usda']);
});

test('food route: GET /search falls back to the next provider for barcode lookups', async () => {
  const callOrder = [];
  const providerA = {
    name: 'fatsecret',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      callOrder.push('fatsecret');
      return { items: [] };
    }
  };
  const providerB = {
    name: 'openFoodFacts',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      callOrder.push('openFoodFacts');
      return { items: [{ id: '1', source: 'openFoodFacts', description: 'Test', availableMeasures: [] }] };
    }
  };

  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: {
      getFoodDataProvider: () => {
        throw new Error('getFoodDataProvider should not be called for barcode searches');
      },
      getEnabledFoodDataProviders: () => ({
        primary: { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
        providers: [
          { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
          { name: 'openFoodFacts', label: 'Open Food Facts', supportsBarcodeLookup: true, ready: true }
        ]
      }),
      getFoodDataProviderByName: (name) => {
        if (name === 'fatsecret') return { provider: providerA };
        if (name === 'openFoodFacts') return { provider: providerB };
        return { error: 'unknown provider' };
      }
    }
  });

  const handler = getRouteHandler(router, 'get', '/search');
  const req = { query: { barcode: '1234567890123' }, headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.provider, 'openFoodFacts');
  assert.equal(res.body.supportsBarcodeLookup, true);
  assert.equal(res.body.items.length, 1);
  assert.deepEqual(callOrder, ['fatsecret', 'openFoodFacts']);
});

test('food route: GET /search returns empty results when barcode providers return no matches', async () => {
  const providerA = {
    name: 'fatsecret',
    supportsBarcodeLookup: true,
    searchFoods: async () => ({ items: [] })
  };
  const providerB = {
    name: 'openFoodFacts',
    supportsBarcodeLookup: true,
    searchFoods: async () => ({ items: [] })
  };

  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: {
      getFoodDataProvider: () => {
        throw new Error('getFoodDataProvider should not be called for barcode searches');
      },
      getEnabledFoodDataProviders: () => ({
        primary: { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
        providers: [
          { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
          { name: 'openFoodFacts', label: 'Open Food Facts', supportsBarcodeLookup: true, ready: true }
        ]
      }),
      getFoodDataProviderByName: (name) => {
        if (name === 'fatsecret') return { provider: providerA };
        if (name === 'openFoodFacts') return { provider: providerB };
        return { error: 'unknown provider' };
      }
    }
  });

  const handler = getRouteHandler(router, 'get', '/search');
  const req = { query: { barcode: '1234567890123' }, headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.items, []);
});

test('food route: GET /search skips providers that disable barcode lookup at runtime', async () => {
  const callOrder = [];
  const providerA = {
    name: 'fatsecret',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      callOrder.push('fatsecret');
      providerA.supportsBarcodeLookup = false;
      return { items: [{ id: '1', source: 'fatsecret', description: 'Fallback', availableMeasures: [] }] };
    }
  };
  const providerB = {
    name: 'openFoodFacts',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      callOrder.push('openFoodFacts');
      return { items: [{ id: '2', source: 'openFoodFacts', description: 'Barcode', availableMeasures: [] }] };
    }
  };

  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: {
      getFoodDataProvider: () => {
        throw new Error('getFoodDataProvider should not be called for barcode searches');
      },
      getEnabledFoodDataProviders: () => ({
        primary: { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
        providers: [
          { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
          { name: 'openFoodFacts', label: 'Open Food Facts', supportsBarcodeLookup: true, ready: true }
        ]
      }),
      getFoodDataProviderByName: (name) => {
        if (name === 'fatsecret') return { provider: providerA };
        if (name === 'openFoodFacts') return { provider: providerB };
        return { error: 'unknown provider' };
      }
    }
  });

  const handler = getRouteHandler(router, 'get', '/search');
  const req = { query: { barcode: '1234567890123' }, headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.provider, 'openFoodFacts');
  assert.equal(res.body.items.length, 1);
  assert.deepEqual(callOrder, ['fatsecret', 'openFoodFacts']);
});

test('food route: GET /search returns 500 when all barcode providers fail', async () => {
  const providerA = {
    name: 'fatsecret',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      throw new Error('FatSecret down');
    }
  };
  const providerB = {
    name: 'openFoodFacts',
    supportsBarcodeLookup: true,
    searchFoods: async () => {
      throw new Error('Open Food Facts down');
    }
  };

  const router = loadFoodRouter({
    prismaStub: {},
    foodDataStub: {
      getFoodDataProvider: () => {
        throw new Error('getFoodDataProvider should not be called for barcode searches');
      },
      getEnabledFoodDataProviders: () => ({
        primary: { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
        providers: [
          { name: 'fatsecret', label: 'FatSecret', supportsBarcodeLookup: true, ready: true },
          { name: 'openFoodFacts', label: 'Open Food Facts', supportsBarcodeLookup: true, ready: true }
        ]
      }),
      getFoodDataProviderByName: (name) => {
        if (name === 'fatsecret') return { provider: providerA };
        if (name === 'openFoodFacts') return { provider: providerB };
        return { error: 'unknown provider' };
      }
    }
  });

  const handler = getRouteHandler(router, 'get', '/search');
  const req = { query: { barcode: '1234567890123' }, headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: 'Unable to search foods right now.' });
});

test('food route: GET /recent returns deduped recent food suggestions', async () => {
  const rows = [
    {
      id: 3,
      name: 'Greek yogurt',
      meal_period: 'BREAKFAST',
      calories: 120,
      my_food_id: null,
      servings_consumed: 1,
      serving_size_quantity_snapshot: 1,
      serving_unit_label_snapshot: 'cup',
      calories_per_serving_snapshot: 120,
      external_source: 'openFoodFacts',
      external_id: 'yogurt-1',
      brand_snapshot: 'Brand',
      locale_snapshot: null,
      barcode_snapshot: null,
      measure_label_snapshot: 'cup',
      grams_per_measure_snapshot: 170,
      measure_quantity_snapshot: 1,
      grams_total_snapshot: 170,
      created_at: new Date('2025-01-03T12:00:00Z')
    },
    {
      id: 2,
      name: 'Greek yogurt',
      meal_period: 'BREAKFAST',
      calories: 120,
      my_food_id: null,
      servings_consumed: 1,
      serving_size_quantity_snapshot: 1,
      serving_unit_label_snapshot: 'cup',
      calories_per_serving_snapshot: 120,
      external_source: 'openFoodFacts',
      external_id: 'yogurt-1',
      brand_snapshot: 'Brand',
      locale_snapshot: null,
      barcode_snapshot: null,
      measure_label_snapshot: 'cup',
      grams_per_measure_snapshot: 170,
      measure_quantity_snapshot: 1,
      grams_total_snapshot: 170,
      created_at: new Date('2025-01-02T12:00:00Z')
    }
  ];

  const prismaStub = {
    foodLog: {
      findMany: async ({ where, take }) => {
        assert.deepEqual(where, { user_id: 7 });
        assert.equal(take, 200);
        return rows;
      }
    }
  };

  const router = loadFoodRouter({
    prismaStub,
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
  const handler = getRouteHandler(router, 'get', '/recent');

  const req = { user: { id: 7 }, query: {} };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].name, 'Greek yogurt');
  assert.equal(res.body.items[0].times_logged, 2);
  assert.equal(res.body.items[0].external_source, 'openFoodFacts');
});

test('food route: GET / validates local_date/date query params', async () => {
  const prismaStub = {
    foodLog: {
      findMany: async () => {
        throw new Error('should not be called');
      }
    }
  };

  const router = loadFoodRouter({
    prismaStub,
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
  const handler = getRouteHandler(router, 'get', '/');

  const req = { user: { id: 7 }, query: { date: 'not-a-date' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid date' });
});

test('food route: GET / passes local_date filter through to Prisma', async () => {
  let receivedWhere = null;
  const prismaStub = {
    foodLog: {
      findMany: async ({ where }) => {
        receivedWhere = where;
        return [{ id: 1, name: 'Test' }];
      }
    }
  };

  const router = loadFoodRouter({
    prismaStub,
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
  const handler = getRouteHandler(router, 'get', '/');

  const req = { user: { id: 7 }, query: { local_date: '2025-01-01' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ id: 1, name: 'Test' }]);

  assert.equal(receivedWhere.user_id, 7);
  assert.equal(receivedWhere.local_date.toISOString(), '2025-01-01T00:00:00.000Z');
});

test('food route: POST / creates a manual log after validating inputs', async () => {
  let receivedData = null;
  const createdLog = { id: 1, user_id: 7, name: 'Apple', calories: 12 };

  const prismaStub = {
    myFood: {},
    foodLog: {
      create: async ({ data }) => {
        receivedData = data;
        return createdLog;
      }
    }
  };

  const router = loadFoodRouter({
    prismaStub,
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, timezone: 'UTC' },
    body: { meal_period: 'BREAKFAST', name: '  Apple ', calories: '12.4', date: '2025-01-01' }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, createdLog);
  assert.equal(receivedData.user_id, 7);
  assert.equal(receivedData.name, 'Apple');
  assert.equal(receivedData.calories, 12);
  assert.equal(receivedData.meal_period, 'BREAKFAST');
});

test('food route: POST / stores external serving snapshots for search-backed logs', async () => {
  let receivedData = null;
  const createdLog = { id: 1, user_id: 7, name: 'Yogurt', calories: 180 };

  const prismaStub = {
    myFood: {},
    foodLog: {
      create: async ({ data }) => {
        receivedData = data;
        return createdLog;
      }
    }
  };

  const router = loadFoodRouter({
    prismaStub,
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, timezone: 'UTC' },
    body: {
      meal_period: 'LUNCH',
      name: 'Yogurt',
      calories: 180,
      servings_consumed: 1.5,
      serving_size_quantity_snapshot: 1,
      serving_unit_label_snapshot: 'cup',
      external_source: 'openFoodFacts',
      external_id: 'abc',
      brand: 'Brand',
      measure_label: 'cup',
      grams_per_measure_snapshot: 170,
      grams_total_snapshot: 255,
      date: '2025-01-01'
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, createdLog);
  assert.equal(receivedData.servings_consumed, 1.5);
  assert.equal(receivedData.serving_unit_label_snapshot, 'cup');
  assert.equal(receivedData.calories_per_serving_snapshot, 120);
  assert.equal(receivedData.external_source, 'openFoodFacts');
  assert.equal(receivedData.external_id, 'abc');
  assert.equal(receivedData.brand_snapshot, 'Brand');
  assert.equal(receivedData.measure_label_snapshot, 'cup');
  assert.equal(receivedData.grams_total_snapshot, 255);
});

test('food route: POST / can create a my_food-backed log with snapshots', async () => {
  const myFoodRow = {
    id: 123,
    user_id: 7,
    name: 'Granola bar',
    serving_size_quantity: 1,
    serving_unit_label: 'bar',
    calories_per_serving: 100
  };

  let receivedCreateData = null;
  const createdLog = { id: 9, user_id: 7, name: 'Granola bar', calories: 150 };

  const prismaStub = {
    myFood: {
      findFirst: async () => myFoodRow
    },
    foodLog: {
      create: async ({ data }) => {
        receivedCreateData = data;
        return createdLog;
      }
    }
  };

  const router = loadFoodRouter({
    prismaStub,
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
  const handler = getRouteHandler(router, 'post', '/');

  const req = {
    user: { id: 7, timezone: 'UTC' },
    body: { meal_period: 'LUNCH', my_food_id: '123', servings_consumed: '1.5', date: '2025-01-01' }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, createdLog);

  assert.equal(receivedCreateData.my_food_id, 123);
  assert.equal(receivedCreateData.servings_consumed, 1.5);
  assert.equal(receivedCreateData.calories, 150);
  assert.equal(receivedCreateData.calories_per_serving_snapshot, 100);
});

test('food route: PATCH /:id validates and computes updateData', async () => {
  const existingRow = {
    id: 1,
    user_id: 7,
    calories_per_serving_snapshot: 110,
    servings_consumed: 1
  };

  let receivedUpdateData = null;
  const updatedRow = { id: 1, user_id: 7, calories: 220, servings_consumed: 2 };

  const prismaStub = {
    foodLog: {
      findFirst: async () => existingRow,
      update: async ({ data }) => {
        receivedUpdateData = data;
        return updatedRow;
      }
    }
  };

  const router = loadFoodRouter({
    prismaStub,
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
  const handler = getRouteHandler(router, 'patch', '/:id');

  const req = { user: { id: 7 }, params: { id: '1' }, body: { servings_consumed: 2 } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, updatedRow);
  assert.deepEqual(receivedUpdateData, { servings_consumed: 2, calories: 220, calories_per_serving_snapshot: 110 });
});

test('food route: DELETE /:id validates ids and returns 204 on delete', async () => {
  const prismaStub = {
    foodLog: {
      deleteMany: async () => ({ count: 1 })
    }
  };

  const router = loadFoodRouter({
    prismaStub,
    foodDataStub: { getFoodDataProvider: () => ({}) }
  });
  const handler = getRouteHandler(router, 'delete', '/:id');

  const res = createRes();
  await handler({ user: { id: 7 }, params: { id: '123' } }, res);
  assert.equal(res.statusCode, 204);
});
