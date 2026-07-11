const test = require('node:test');
const assert = require('node:assert/strict');

const loaded = require('../src/routes/clientConfig');
const router = loaded.default ?? loaded;

test('client config advertises the stable v1 API and legacy migration alias', () => {
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
  assert.match(body.api_versions.legacy_deprecation, /migrated/i);
});
