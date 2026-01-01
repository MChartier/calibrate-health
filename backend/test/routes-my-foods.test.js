const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadMyFoodsRouter(prismaStub) {
  const dbPath = require.resolve('../src/config/database');
  const routePath = require.resolve('../src/routes/myFoods');

  const previousDbModule = require.cache[dbPath];
  delete require.cache[routePath];

  stubModule(dbPath, prismaStub);
  const loaded = require('../src/routes/myFoods');

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

test('myFoods route: rejects unauthenticated requests via router.use middleware', async () => {
  const router = loadMyFoodsRouter({});
  const isAuthenticated = getIsAuthenticatedMiddleware(router);

  const req = { isAuthenticated: () => false };
  const res = createRes();

  let nextCalled = false;
  isAuthenticated(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Not authenticated' });
});

test('myFoods route: GET / builds filters from q + type', async () => {
  let receivedWhere = null;
  const prismaStub = {
    myFood: {
      findMany: async ({ where }) => {
        receivedWhere = where;
        return [{ id: 1, name: 'Apple' }];
      }
    }
  };

  const router = loadMyFoodsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/');

  const req = { user: { id: 7 }, query: { q: 'app', type: 'food' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ id: 1, name: 'Apple' }]);

  assert.deepEqual(receivedWhere, {
    user_id: 7,
    name: { contains: 'app', mode: 'insensitive' },
    type: 'FOOD'
  });
});

test('myFoods route: GET /:id validates ids and returns 404 when missing', async () => {
  const prismaStub = {
    myFood: {
      findFirst: async () => null
    }
  };

  const router = loadMyFoodsRouter(prismaStub);
  const handler = getRouteHandler(router, 'get', '/:id');

  const invalidRes = createRes();
  await handler({ user: { id: 7 }, params: { id: 'abc' } }, invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalidRes.body, { message: 'Invalid my food id' });

  const missingRes = createRes();
  await handler({ user: { id: 7 }, params: { id: '123' } }, missingRes);
  assert.equal(missingRes.statusCode, 404);
  assert.deepEqual(missingRes.body, { message: 'My food not found' });
});

test('myFoods route: POST /foods validates inputs', async () => {
  const router = loadMyFoodsRouter({ myFood: {} });
  const handler = getRouteHandler(router, 'post', '/foods');

  const res = createRes();
  await handler({ user: { id: 7 }, body: { name: '', serving_size_quantity: 1, serving_unit_label: 'g', calories_per_serving: 10 } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid name' });
});

test('myFoods route: POST /recipes validates ingredients array', async () => {
  const router = loadMyFoodsRouter({ myFood: {}, $transaction: async () => ({}) });
  const handler = getRouteHandler(router, 'post', '/recipes');

  const res = createRes();
  await handler(
    {
      user: { id: 7 },
      body: {
        name: 'Recipe',
        serving_size_quantity: 1,
        serving_unit_label: 'serving',
        yield_servings: 2,
        ingredients: []
      }
    },
    res
  );
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Recipe must include at least one ingredient' });
});

test('myFoods route: POST /recipes maps validation errors thrown in the transaction', async () => {
  const prismaStub = {
    $transaction: async (fn) => fn({ myFood: {}, recipeIngredient: {} })
  };

  const router = loadMyFoodsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/recipes');

  const res = createRes();
  await handler(
    {
      user: { id: 7 },
      body: {
        name: 'Recipe',
        serving_size_quantity: 1,
        serving_unit_label: 'serving',
        yield_servings: 2,
        ingredients: [{ source: 'BAD' }]
      }
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid ingredient source' });
});

test('myFoods route: POST /recipes returns 404 when a MY_FOOD ingredient is missing', async () => {
  const txStub = {
    myFood: { findFirst: async () => null },
    recipeIngredient: { createMany: async () => {} }
  };

  const prismaStub = {
    $transaction: async (fn) => fn(txStub)
  };

  const router = loadMyFoodsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/recipes');

  const res = createRes();
  await handler(
    {
      user: { id: 7 },
      body: {
        name: 'Recipe',
        serving_size_quantity: 1,
        serving_unit_label: 'serving',
        yield_servings: 2,
        ingredients: [{ source: 'MY_FOOD', my_food_id: 1, quantity_servings: 1 }]
      }
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: 'Ingredient my food not found' });
});

test('myFoods route: POST /recipes creates a recipe and ingredient snapshots', async () => {
  let receivedRecipeData = null;
  let receivedIngredientData = null;

  const txStub = {
    myFood: {
      create: async ({ data }) => {
        receivedRecipeData = data;
        return { id: 55, ...data };
      },
      findFirst: async () => null
    },
    recipeIngredient: {
      createMany: async ({ data }) => {
        receivedIngredientData = data;
      }
    }
  };

  const prismaStub = {
    $transaction: async (fn) => fn(txStub)
  };

  const router = loadMyFoodsRouter(prismaStub);
  const handler = getRouteHandler(router, 'post', '/recipes');

  const req = {
    user: { id: 7 },
    body: {
      name: '  Pasta  ',
      serving_size_quantity: 1,
      serving_unit_label: 'serving',
      yield_servings: 2,
      ingredients: [{ source: 'EXTERNAL', name: ' Tomato  sauce ', calories_total: 100, brand: '  Brand ' }]
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 55);
  assert.equal(receivedRecipeData.user_id, 7);
  assert.equal(receivedRecipeData.type, 'RECIPE');
  assert.equal(receivedRecipeData.name, 'Pasta');
  assert.equal(receivedRecipeData.recipe_total_calories, 100);
  assert.equal(receivedRecipeData.yield_servings, 2);
  assert.equal(receivedRecipeData.calories_per_serving, 50);

  assert.ok(Array.isArray(receivedIngredientData));
  assert.equal(receivedIngredientData.length, 1);
  assert.equal(receivedIngredientData[0].recipe_id, 55);
  assert.equal(receivedIngredientData[0].source, 'EXTERNAL');
  assert.equal(receivedIngredientData[0].name_snapshot, 'Tomato sauce');
  assert.equal(receivedIngredientData[0].brand_snapshot, 'Brand');
  assert.equal(receivedIngredientData[0].calories_total_snapshot, 100);
});

