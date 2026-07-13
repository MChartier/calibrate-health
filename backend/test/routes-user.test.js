const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadUserRouter({ prismaStub, bcryptStub, accountLifecycleStub }) {
  const dbPath = require.resolve('../src/config/database');
  const bcryptPath = require.resolve('bcryptjs');
  const mobileAuthPath = require.resolve('../src/services/mobileAuth');
  const accountLifecyclePath = require.resolve('../src/services/accountLifecycle');
  const clientOperationsPath = require.resolve('../src/services/clientOperations');
  const userPath = require.resolve('../src/routes/user');

  const previousDbModule = require.cache[dbPath];
  const previousBcryptModule = require.cache[bcryptPath];
  const previousMobileAuthModule = require.cache[mobileAuthPath];
  const previousAccountLifecycleModule = require.cache[accountLifecyclePath];
  const previousClientOperationsModule = require.cache[clientOperationsPath];

  delete require.cache[userPath];
  delete require.cache[mobileAuthPath];
  delete require.cache[accountLifecyclePath];
  delete require.cache[clientOperationsPath];

  const normalizedPrismaStub = {
    ...prismaStub,
    syncChange: {
      create: async () => ({ id: 1n }),
      ...(prismaStub.syncChange ?? {})
    }
  };
  normalizedPrismaStub.$transaction ??= async (callback) => callback(normalizedPrismaStub);
  stubModule(dbPath, normalizedPrismaStub);
  stubModule(bcryptPath, bcryptStub);
  if (accountLifecycleStub) stubModule(accountLifecyclePath, accountLifecycleStub);

  const loaded = require('../src/routes/user');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];

  if (previousBcryptModule) require.cache[bcryptPath] = previousBcryptModule;
  else delete require.cache[bcryptPath];

  if (previousMobileAuthModule) require.cache[mobileAuthPath] = previousMobileAuthModule;
  else delete require.cache[mobileAuthPath];

  if (previousAccountLifecycleModule) require.cache[accountLifecyclePath] = previousAccountLifecycleModule;
  else delete require.cache[accountLifecyclePath];

  if (previousClientOperationsModule) require.cache[clientOperationsPath] = previousClientOperationsModule;
  else delete require.cache[clientOperationsPath];

  return loaded.default ?? loaded;
}

function createRes(locals = {}) {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    clearedCookie: null,
    locals,
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
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookie = { name, options };
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
    reminder_log_weight_enabled: true,
    reminder_log_food_enabled: true,
    haptics_enabled: true,
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
      reminder_log_weight_enabled: dbUser.reminder_log_weight_enabled,
      reminder_log_food_enabled: dbUser.reminder_log_food_enabled,
      haptics_enabled: dbUser.haptics_enabled,
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
    reminder_log_weight_enabled: true,
    reminder_log_food_enabled: true,
    haptics_enabled: true,
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
  let sessionLookup = null;

  const prismaStub = {
    $transaction: async (operations) => Promise.all(operations),
    user: {
      findUnique: async () => ({ id: 7, password_hash: 'old-hash' }),
      update: async () => {
        updated = true;
      }
    },
    mobileAuthSession: {
      findMany: async (args) => {
        sessionLookup = args;
        return [{ id: 12 }];
      },
      updateMany: async () => ({ count: 1 })
    },
    nativePushSubscription: {
      updateMany: async () => ({ count: 1 })
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
  const res = createRes({ mobileAuthSessionId: 11 });

  await handler(req, res);

  assert.equal(updated, true);
  assert.deepEqual(sessionLookup.where.id, { not: 11 });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'Password updated' });
});

test('user route: GET /account/export returns a no-store attachment', async () => {
  const accountExport = {
    format: 'calibrate-account-export',
    version: 2,
    exported_at: '2026-07-11T20:00:00.000Z'
  };
  const router = loadUserRouter({
    prismaStub: { user: {} },
    bcryptStub: {},
    accountLifecycleStub: {
      exportAccountData: async (userId) => {
        assert.equal(userId, 7);
        return accountExport;
      },
      deleteAccountData: async () => false
    }
  });
  const handler = getRouteHandler(router, 'get', '/account/export');
  const res = createRes();

  await handler({ user: { id: 7 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.headers['content-disposition'], /calibrate-account-export-2026-07-11\.json/);
  assert.equal(res.body, accountExport);
});

test('user route: DELETE /account requires and verifies the current password', async () => {
  let deleted = false;
  const router = loadUserRouter({
    prismaStub: {
      user: { findUnique: async () => ({ password_hash: 'stored-hash' }) }
    },
    bcryptStub: { compare: async () => false },
    accountLifecycleStub: {
      exportAccountData: async () => null,
      deleteAccountData: async () => {
        deleted = true;
        return true;
      }
    }
  });
  const handler = getRouteHandler(router, 'delete', '/account');

  const missingRes = createRes();
  await handler({ user: { id: 7 }, body: {} }, missingRes);
  assert.equal(missingRes.statusCode, 400);
  assert.deepEqual(missingRes.body, { message: 'Current password is required' });

  const wrongRes = createRes();
  await handler({ user: { id: 7 }, body: { current_password: 'wrong' } }, wrongRes);
  assert.equal(wrongRes.statusCode, 400);
  assert.deepEqual(wrongRes.body, { message: 'Current password is incorrect' });
  assert.equal(deleted, false);
});

test('user route: DELETE /account deletes data, destroys the request session, and clears the cookie', async () => {
  let deletedUserId = null;
  let sessionDestroyed = false;
  const router = loadUserRouter({
    prismaStub: {
      user: { findUnique: async () => ({ password_hash: 'stored-hash' }) }
    },
    bcryptStub: { compare: async () => true },
    accountLifecycleStub: {
      exportAccountData: async () => null,
      deleteAccountData: async (userId) => {
        deletedUserId = userId;
        return true;
      }
    }
  });
  const handler = getRouteHandler(router, 'delete', '/account');
  const req = {
    user: { id: 7 },
    body: { current_password: 'correct-password' },
    session: {
      destroy: (callback) => {
        sessionDestroyed = true;
        callback();
      }
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(deletedUserId, 7);
  assert.equal(sessionDestroyed, true);
  assert.deepEqual(res.clearedCookie, { name: 'cal.sid', options: { path: '/' } });
  assert.equal(res.statusCode, 204);
});

test('user route: PATCH /preferences validates reminder preference booleans', async () => {
  const prismaStub = {
    user: {
      update: async () => {
        throw new Error('should not be called');
      }
    }
  };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'patch', '/preferences');

  const req = { user: { id: 7 }, body: { reminder_log_weight_enabled: 'yes' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid reminder_log_weight_enabled' });
});

test('user route: PATCH /preferences updates reminder preference fields', async () => {
  const updatedUser = {
    id: 7,
    email: 'user@example.com',
    created_at: new Date('2025-01-01T00:00:00Z'),
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'UTC',
    language: 'en',
    reminder_log_weight_enabled: false,
    reminder_log_food_enabled: true,
    haptics_enabled: true,
    date_of_birth: null,
    sex: null,
    height_mm: null,
    activity_level: null,
    profile_image: null,
    profile_image_mime_type: null
  };

  let updateArgs = null;
  const prismaStub = {
    user: {
      update: async (args) => {
        updateArgs = args;
        return updatedUser;
      }
    }
  };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'patch', '/preferences');

  const req = { user: { id: 7 }, body: { reminder_log_weight_enabled: false } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updateArgs.where.id, 7);
  assert.deepEqual(updateArgs.data, { reminder_log_weight_enabled: false });
  assert.equal(res.body.user.reminder_log_weight_enabled, false);
  assert.equal(res.body.user.reminder_log_food_enabled, true);
});

test('user route: PATCH /preferences validates haptics_enabled boolean', async () => {
  const prismaStub = {
    user: {
      update: async () => {
        throw new Error('should not be called');
      }
    }
  };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'patch', '/preferences');

  const req = { user: { id: 7 }, body: { haptics_enabled: 'on' } };
  const res = createRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: 'Invalid haptics_enabled' });
});

test('user route: PATCH /preferences updates haptics_enabled field', async () => {
  const updatedUser = {
    id: 7,
    email: 'user@example.com',
    created_at: new Date('2025-01-01T00:00:00Z'),
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'UTC',
    language: 'en',
    reminder_log_weight_enabled: true,
    reminder_log_food_enabled: true,
    haptics_enabled: false,
    date_of_birth: null,
    sex: null,
    height_mm: null,
    activity_level: null,
    profile_image: null,
    profile_image_mime_type: null
  };

  let updateArgs = null;
  const prismaStub = {
    user: {
      update: async (args) => {
        updateArgs = args;
        return updatedUser;
      }
    }
  };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'patch', '/preferences');

  const req = { user: { id: 7 }, body: { haptics_enabled: false } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updateArgs.where.id, 7);
  assert.deepEqual(updateArgs.data, { haptics_enabled: false });
  assert.equal(res.body.user.haptics_enabled, false);
});

test('user route: GET /profile reads the latest goal with deterministic ordering', async () => {
  let goalFindFirstArgs = null;
  const dbUser = {
    id: 7,
    timezone: 'UTC',
    date_of_birth: null,
    sex: null,
    height_mm: null,
    activity_level: null,
    weight_unit: 'KG',
    height_unit: 'CM'
  };

  const prismaStub = {
    user: {
      findUnique: async () => dbUser
    },
    goal: {
      findFirst: async (args) => {
        goalFindFirstArgs = args;
        return { daily_deficit: 500 };
      }
    },
    bodyMetric: {
      findFirst: async () => ({ weight_grams: 70000 })
    }
  };
  const bcryptStub = {};

  const router = loadUserRouter({ prismaStub, bcryptStub });
  const handler = getRouteHandler(router, 'get', '/profile');

  const req = { user: { id: 7 } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(goalFindFirstArgs.orderBy, [{ created_at: 'desc' }, { id: 'desc' }]);
  assert.equal(res.body.goal_daily_deficit, 500);
});
