import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { externalBuildConfiguration, verifyResolvedBuildEnvironment } from './release-build-config.mjs';
import { hash } from './release-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = { EAS_ENVIRONMENT: 'production', EXPO_UPDATES_CHANNEL: 'production',
  EXPO_PUBLIC_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111', EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://synthetic.invalid' };
test('external configuration validates profile/environment/channel without deriving an endpoint', () => {
  const config = externalBuildConfiguration(root, 'production', environment);
  const result = verifyResolvedBuildEnvironment(config, environment);
  assert.equal(result.configurationDigest, hash(config));
  assert(!JSON.stringify(result).includes('synthetic.invalid')); assert(!JSON.stringify(result).includes('11111111'));
  for (const key of Object.keys(environment)) {
    const missing = { ...environment }; delete missing[key];
    assert.throws(() => externalBuildConfiguration(root, 'production', missing));
  }
  assert.throws(() => externalBuildConfiguration(root, 'internal', environment));
});
test('resolved EAS values must match all public build inputs before a paid build starts', () => {
  const config = externalBuildConfiguration(root, 'production', environment);
  for (const key of ['EXPO_PUBLIC_CALIBRATE_SERVER_URL', 'EXPO_PUBLIC_EAS_PROJECT_ID', 'EXPO_UPDATES_CHANNEL']) {
    assert.throws(() => verifyResolvedBuildEnvironment(config, { ...environment, [key]: 'different' }), /Resolved build environment differs/);
  }
});
