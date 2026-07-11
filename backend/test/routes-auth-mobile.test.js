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
  const mobileAuthPath = require.resolve('../src/services/mobileAuth');
  const authPath = require.resolve('../src/routes/auth');

  const previousDbModule = require.cache[dbPath];
  const previousPassportModule = require.cache[passportPath];
  const previousBcryptModule = require.cache[bcryptPath];
  const previousMobileAuthModule = require.cache[mobileAuthPath];
  delete require.cache[authPath];
  delete require.cache[mobileAuthPath];

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
  if (previousMobileAuthModule) require.cache[mobileAuthPath] = previousMobileAuthModule;
  else delete require.cache[mobileAuthPath];

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

function getRouteHandler(router, method, path) {
  const layer = router.stack.find(
    (candidate) => candidate.route && candidate.route.path === path && candidate.route.methods?.[method]
  );
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} route to exist`);
  return layer.route.stack.at(-1).handle;
}

const dbUser = {
  id: 7,
  email: 'native@example.com',
  password_hash: 'hash',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  weight_unit: 'KG',
  height_unit: 'CM',
  timezone: 'UTC',
  language: 'en',
  reminder_log_weight_enabled: true,
  reminder_log_food_enabled: true,
  haptics_enabled: true,
  date_of_birth: null,
  sex: null,
  height_mm: null,
  activity_level: null,
  profile_image: null,
  profile_image_mime_type: null
};

test('auth route: POST /mobile/login returns mobile tokens for valid credentials', async () => {
  const sessionCreates = [];
  const userLookups = [];
  const prismaStub = {
    user: {
      findFirst: async (args) => {
        userLookups.push(args);
        return dbUser;
      },
      findUnique: async () => dbUser
    },
    mobileAuthSession: {
      create: async (args) => {
        sessionCreates.push(args);
        return { id: 1 };
      }
    }
  };
  const router = loadAuthRouter({
    prismaStub,
    passportStub: { authenticate: () => () => {} },
    bcryptStub: { compare: async () => true, genSalt: async () => 'salt', hash: async () => 'hash' }
  });
  const handler = getRouteHandler(router, 'post', '/mobile/login');
  const res = createRes();

  await handler(
    {
      body: {
        email: 'NATIVE@example.com',
        password: 'password123',
        device_id: 'device-1',
        device_platform: 'android_phone'
      }
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.email, dbUser.email);
  assert.ok(res.body.access_token);
  assert.ok(res.body.refresh_token);
  assert.deepEqual(userLookups[0].where, {
    email: { equals: 'native@example.com', mode: 'insensitive' }
  });
  assert.equal(sessionCreates[0].data.device_id, 'device-1');
});

test('auth route: POST /mobile/refresh rejects missing refresh token', async () => {
  const router = loadAuthRouter({
    prismaStub: { user: {}, mobileAuthSession: {} },
    passportStub: { authenticate: () => () => {} },
    bcryptStub: { compare: async () => false, genSalt: async () => 'salt', hash: async () => 'hash' }
  });
  const handler = getRouteHandler(router, 'post', '/mobile/refresh');
  const res = createRes();

  await handler({ body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'refresh_token is required' });
});
