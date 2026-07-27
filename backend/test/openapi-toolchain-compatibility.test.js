const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const test = require('node:test');

const redoclyPackagePath = require.resolve('@redocly/openapi-core/package.json');
const requireFromRedocly = createRequire(redoclyPackagePath);

test('Redocly minimatch supports brace-bearing OpenAPI paths', () => {
  const minimatch = requireFromRedocly('minimatch');

  assert.equal(
    minimatch('docs/openapi/v1.yaml', 'docs/openapi/{v1,v2}.yaml'),
    true
  );
});
