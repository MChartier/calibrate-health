const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadUserRouter({ prismaStub, bcryptStub }) {
  const dbPath = require.resolve('../src/config/database');
  const bcryptPath = require.resolve('bcryptjs');
  const userPath = require.resolve('../src/routes/user');

  const previousDbModule = require.cache[dbPath];
  const previousBcryptModule = require.cache[bcryptPath];

  delete require.cache[userPath];

  stubModule(dbPath, prismaStub);
  stubModule(bcryptPath, bcryptStub);

  const loaded = require('../src/routes/user');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];

  if (previousBcryptModule) require.cache[bcryptPath] = previousBcryptModule;
  else delete require.cache[bcryptPath];

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

test('user route: rejects unauthenticated requests via router.use middleware', async () => {
  const prismaStub = { user: {} };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
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

test('user route: GET /me returns 404 when the user row is missing', async () => {
  const prismaStub = {
    user: {
      findUnique: async () => null
    }
  };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'get', '/me');

  const req = { user: { id: 7 } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: 'User not found' });
});

test('user route: GET /me returns serialized user data', async () => {
  const dbUser = {
    id: 7,
    email: 'user@example.com',
    created_at: new Date('2025-01-01T00:00:00Z'),
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'UTC',
    date_of_birth: null,
    sex: null,
    height_mm: null,
    activity_level: null,
    profile_image: new Uint8Array([1, 2, 3]),
    profile_image_mime_type: 'image/png'
  };

  const prismaStub = {
    user: {
      findUnique: async () => dbUser
    }
  };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'get', '/me');

  const req = { user: { id: 7 } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      created_at: dbUser.created_at,
      weight_unit: dbUser.weight_unit,
      height_unit: dbUser.height_unit,
      timezone: dbUser.timezone,
      language: 'en',
      date_of_birth: dbUser.date_of_birth,
      sex: dbUser.sex,
      height_mm: dbUser.height_mm,
      activity_level: dbUser.activity_level,
      profile_image_url: 'data:image/png;base64,AQID'
    }
  });
});

test('user route: PUT /profile-image validates data_url input', async () => {
  const prismaStub = { user: {} };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'put', '/profile-image');

  const req = { user: { id: 7 }, body: {} };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Missing data_url' });
});

test('user route: PUT /profile-image rejects invalid profile image payloads', async () => {
  const prismaStub = { user: {} };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'put', '/profile-image');

  const req = { user: { id: 7 }, body: { data_url: 'not-a-data-url' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid profile image payload' });
});

test('user route: PUT /profile-image stores bytes and returns a data URL', async () => {
  const updatedUser = {
    id: 7,
    email: 'user@example.com',
    created_at: new Date('2025-01-01T00:00:00Z'),
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'UTC',
    date_of_birth: null,
    sex: null,
    height_mm: null,
    activity_level: null,
    profile_image: new Uint8Array([1, 2, 3]),
    profile_image_mime_type: 'image/png'
  };

  const prismaStub = {
    user: {
      update: async () => updatedUser
    }
  };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'put', '/profile-image');

  const req = {
    user: { id: 7 },
    body: { data_url: 'data:image/png;base64,AQID' }
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.profile_image_url, 'data:image/png;base64,AQID');
});

test('user route: PATCH /password validates request shape and rejects identical passwords', async () => {
  const prismaStub = { user: {} };
  const bcryptStub = { compare: async () => true, hash: async () => 'hash' };

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'patch', '/password');

  const missingBodyRes = createRes();
  await handler({ user: { id: 7 }, body: null }, missingBodyRes);
  assert.equal(missingBodyRes.statusCode, 400);
  assert.deepEqual(missingBodyRes.body, { message: 'Invalid request body' });

  const samePasswordRes = createRes();
  await handler(
    { user: { id: 7 }, body: { current_password: 'password123', new_password: 'password123' } },
    samePasswordRes
  );
  assert.equal(samePasswordRes.statusCode, 400);
  assert.deepEqual(samePasswordRes.body, { message: 'New password must be different from current password' });
});

test('user route: PATCH /password updates password when current password matches', async () => {
  let updated = false;

  const prismaStub = {
    user: {
      findUnique: async () => ({ id: 7, password_hash: 'old-hash' }),
      update: async () => {
        updated = true;
      }
    }
  };
  const bcryptStub = {
    compare: async () => true,
    hash: async () => 'new-hash'
  };

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'patch', '/password');

  const req = {
    user: { id: 7 },
    body: { current_password: 'current', new_password: 'new-password' }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(updated, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'Password updated' });
});
