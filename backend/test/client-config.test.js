const test = require('node:test');
const assert = require('node:assert/strict');

const loaded = require('../src/routes/clientConfig');
const router = loaded.default ?? loaded;

test('client config advertises the stable v1 API, release floors, and privacy-safe push default', () => {
  const layer = router.stack.find(
    (candidate) => candidate.route && candidate.route.path === '/' && candidate.route.methods?.get
  );
  assert.ok(layer);
  const handler = layer.route.stack[0].handle;
  let body = null;

  handler({}, { json: (payload) => { body = payload; } });

  assert.equal(body.api_version, 1);
  assert.equal(body.api_versions.current, 'v1');
  assert.deepEqual(body.api_versions.supported, ['v1']);
  assert.equal(body.api_versions.legacy_alias, '/api');
  assert.equal(body.min_supported_mobile_version, '0.1.0');
  assert.equal(body.min_supported_wear_version, '0.1.0');
  assert.equal(body.capabilities.native_push, false);
  assert.match(body.api_versions.legacy_deprecation, /migrated/i);
});

test('client config advertises native push only after the operator enables Expo mode', () => {
  const previous = process.env.NATIVE_PUSH_MODE;
  process.env.NATIVE_PUSH_MODE = 'expo';
  try {
    const layer = router.stack.find(
      (candidate) => candidate.route && candidate.route.path === '/' && candidate.route.methods?.get
    );
    let body = null;
    layer.route.stack[0].handle({}, { json: (payload) => { body = payload; } });
    assert.equal(body.capabilities.native_push, true);
  } finally {
    if (previous === undefined) delete process.env.NATIVE_PUSH_MODE;
    else process.env.NATIVE_PUSH_MODE = previous;
  }
});
