const assert = require('node:assert/strict');
const test = require('node:test');

const { createExpoConfig } = require('./app.config.js');

const originalProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const originalChannel = process.env.EXPO_UPDATES_CHANNEL;

test.afterEach(() => {
  if (originalProjectId === undefined) delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  else process.env.EXPO_PUBLIC_EAS_PROJECT_ID = originalProjectId;
  if (originalChannel === undefined) delete process.env.EXPO_UPDATES_CHANNEL;
  else process.env.EXPO_UPDATES_CHANNEL = originalChannel;
});

test('Expo config leaves updates disabled when no EAS project is configured', () => {
  delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const config = { name: 'calibrate', extra: { router: { origin: false } } };
  assert.strictEqual(createExpoConfig({ config }), config);
});

test('Expo config embeds a project-scoped update URL, runtime, and local-build channel', () => {
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID = '01234567-89ab-4def-8123-456789abcdef';
  process.env.EXPO_UPDATES_CHANNEL = 'internal';
  const result = createExpoConfig({
    config: { name: 'calibrate', extra: { router: { origin: false } } }
  });

  assert.deepEqual(result.runtimeVersion, { policy: 'appVersion' });
  assert.equal(result.updates.url, 'https://u.expo.dev/01234567-89ab-4def-8123-456789abcdef');
  assert.equal(result.updates.requestHeaders['expo-channel-name'], 'internal');
  assert.equal(result.extra.eas.projectId, '01234567-89ab-4def-8123-456789abcdef');
  assert.deepEqual(result.extra.router, { origin: false });
});

test('Expo config accepts the public project link written by eas init', () => {
  delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const result = createExpoConfig({
    config: { extra: { eas: { projectId: '01234567-89ab-4def-8123-456789abcdef' } } }
  });
  assert.equal(result.updates.url, 'https://u.expo.dev/01234567-89ab-4def-8123-456789abcdef');
});

test('Expo config rejects malformed project IDs and channel names', () => {
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID = 'not-a-uuid';
  assert.throws(() => createExpoConfig({ config: {} }), /project UUID/);

  process.env.EXPO_PUBLIC_EAS_PROJECT_ID = '01234567-89ab-4def-8123-456789abcdef';
  process.env.EXPO_UPDATES_CHANNEL = 'internal channel';
  assert.throws(() => createExpoConfig({ config: {} }), /EXPO_UPDATES_CHANNEL/);
});
