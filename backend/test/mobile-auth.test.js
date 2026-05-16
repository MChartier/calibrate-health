const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadMobileAuthService({ prismaStub }) {
  const dbPath = require.resolve('../src/config/database');
  const servicePath = require.resolve('../src/services/mobileAuth');

  const previousDbModule = require.cache[dbPath];
  delete require.cache[servicePath];

  stubModule(dbPath, prismaStub);

  const loaded = require('../src/services/mobileAuth');

  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];

  return loaded;
}

const baseUser = {
  id: 4,
  email: 'native@example.com',
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

test('mobile auth parses Android device metadata', () => {
  const { parseMobileDevicePayload, serializeMobileDevicePlatform } = loadMobileAuthService({
    prismaStub: {}
  });

  const parsed = parseMobileDevicePayload({
    device_id: 'emulator-1',
    device_platform: 'android_phone',
    device_name: 'Pixel'
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.device.deviceId, 'emulator-1');
  assert.equal(serializeMobileDevicePlatform(parsed.device.devicePlatform), 'android_phone');
});

test('mobile auth issues hashed opaque session tokens', async () => {
  const createCalls = [];
  const prismaStub = {
    user: {
      findUnique: async () => baseUser
    },
    mobileAuthSession: {
      create: async (args) => {
        createCalls.push(args);
        return { id: 9 };
      }
    }
  };

  const { issueMobileAuthPayload, parseMobileDevicePayload, hashMobileToken } = loadMobileAuthService({
    prismaStub
  });

  const device = parseMobileDevicePayload({ device_id: 'device-1' });
  assert.equal(device.ok, true);

  const payload = await issueMobileAuthPayload({
    userId: baseUser.id,
    device: device.device
  });

  assert.ok(payload.accessToken);
  assert.ok(payload.refreshToken);
  assert.notEqual(createCalls[0].data.access_token_hash, payload.accessToken);
  assert.equal(createCalls[0].data.access_token_hash, hashMobileToken(payload.accessToken));
  assert.equal(createCalls[0].data.refresh_token_hash, hashMobileToken(payload.refreshToken));
  assert.equal(payload.user.email, baseUser.email);
});

test('mobile auth validates bearer access tokens and hydrates the client user', async () => {
  let updateCall = null;
  const prismaStub = {
    mobileAuthSession: {
      findUnique: async () => ({
        id: 12,
        revoked_at: null,
        access_expires_at: new Date(Date.now() + 60_000),
        user: baseUser
      }),
      update: async (args) => {
        updateCall = args;
        return { id: args.where.id };
      }
    }
  };

  const { authenticateMobileAccessToken } = loadMobileAuthService({ prismaStub });
  const result = await authenticateMobileAccessToken('Bearer test-token');

  assert.equal(result.ok, true);
  assert.equal(result.user.id, baseUser.id);
  assert.equal(updateCall.where.id, 12);
  assert.ok(updateCall.data.last_used_at instanceof Date);
});
