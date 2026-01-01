const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadAuthRouter({ prismaStub, passportStub, bcryptStub }) {
  const dbPath = require.resolve('../src/config/database');
  const passportPath = require.resolve('passport');
  const bcryptPath = require.resolve('bcryptjs');
  const authPath = require.resolve('../src/routes/auth');

  const previousDbModule = require.cache[dbPath];
  const previousPassportModule = require.cache[passportPath];
  const previousBcryptModule = require.cache[bcryptPath];

  delete require.cache[authPath];

  stubModule(dbPath, prismaStub);
  stubModule(passportPath, passportStub);
  stubModule(bcryptPath, bcryptStub);

  const loaded = require('../src/routes/auth');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];

  if (previousPassportModule) require.cache[passportPath] = previousPassportModule;
  else delete require.cache[passportPath];

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

function getRouteHandlers(router, method, path) {
  const layer = router.stack.find(
    (candidate) => candidate.route && candidate.route.path === path && candidate.route.methods?.[method]
  );
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} route to exist`);
  return layer.route.stack.map((stackLayer) => stackLayer.handle);
}

test('auth route: POST /register returns 400 when the email already exists', async () => {
  const prismaStub = {
    user: {
      findUnique: async () => ({ id: 1 }),
      create: async () => {
        throw new Error('should not be called');
      }
    }
  };
  const passportStub = { authenticate: () => () => {} };
  const bcryptStub = { genSalt: async () => 'salt', hash: async () => 'hash' };

  const router = loadAuthRouter({ prismaStub, passportStub, bcryptStub });
  const [handler] = getRouteHandlers(router, 'post', '/register');

  const req = { body: { email: 'test@example.com', password: 'password123' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'User already exists' });
});

test('auth route: POST /register creates a user and logs them in', async () => {
  const createdUser = {
    id: 42,
    email: 'test@example.com',
    created_at: new Date('2025-01-01T00:00:00Z'),
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'UTC',
    date_of_birth: null,
    sex: null,
    height_mm: null,
    activity_level: null,
    profile_image: null,
    profile_image_mime_type: null
  };

  const prismaStub = {
    user: {
      findUnique: async () => null,
      create: async () => createdUser
    }
  };
  const passportStub = { authenticate: () => () => {} };
  const bcryptStub = { genSalt: async () => 'salt', hash: async () => 'hash' };

  const router = loadAuthRouter({ prismaStub, passportStub, bcryptStub });
  const [handler] = getRouteHandlers(router, 'post', '/register');

  const req = {
    body: { email: createdUser.email, password: 'password123' },
    login: (_user, cb) => cb(null)
  };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    user: {
      id: createdUser.id,
      email: createdUser.email,
      created_at: createdUser.created_at,
      weight_unit: createdUser.weight_unit,
      height_unit: createdUser.height_unit,
      timezone: createdUser.timezone,
      date_of_birth: createdUser.date_of_birth,
      sex: createdUser.sex,
      height_mm: createdUser.height_mm,
      activity_level: createdUser.activity_level,
      profile_image_url: null
    }
  });
});

test('auth route: POST /login uses passport middleware and returns the serialized user', async () => {
  const authedUser = {
    id: 7,
    email: 'test@example.com',
    created_at: new Date('2025-01-01T00:00:00Z'),
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'UTC',
    date_of_birth: null,
    sex: null,
    height_mm: null,
    activity_level: null,
    profile_image: null,
    profile_image_mime_type: null
  };

  const prismaStub = { user: {} };
  const passportStub = {
    authenticate: () => (req, _res, next) => {
      req.user = authedUser;
      next();
    }
  };
  const bcryptStub = { genSalt: async () => 'salt', hash: async () => 'hash' };

  const router = loadAuthRouter({ prismaStub, passportStub, bcryptStub });
  const [passportMiddleware, handler] = getRouteHandlers(router, 'post', '/login');

  const req = {};
  const res = createRes();

  await new Promise((resolve, reject) => {
    passportMiddleware(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, authedUser.id);
  assert.equal(res.body.user.email, authedUser.email);
});

test('auth route: POST /logout forwards errors from req.logout', async () => {
  const prismaStub = { user: {} };
  const passportStub = { authenticate: () => () => {} };
  const bcryptStub = { genSalt: async () => 'salt', hash: async () => 'hash' };

  const router = loadAuthRouter({ prismaStub, passportStub, bcryptStub });
  const [handler] = getRouteHandlers(router, 'post', '/logout');

  const req = {
    logout: (cb) => cb(new Error('boom'))
  };
  const res = createRes();

  let nextError = null;
  handler(req, res, (err) => {
    nextError = err;
  });

  assert.ok(nextError);
  assert.equal(nextError.message, 'boom');
});

test('auth route: GET /me returns 401 when not authenticated', async () => {
  const prismaStub = { user: {} };
  const passportStub = { authenticate: () => () => {} };
  const bcryptStub = { genSalt: async () => 'salt', hash: async () => 'hash' };

  const router = loadAuthRouter({ prismaStub, passportStub, bcryptStub });
  const [handler] = getRouteHandlers(router, 'get', '/me');

  const req = { isAuthenticated: () => false };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Not authenticated' });
});

