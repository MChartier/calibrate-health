/** Fail closed when SDK discovery returns an incomplete native graph rather than a reliable fingerprint. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeResolution } from './expo-runtime.mjs';

/** Keep the fixture aligned with the locked SDK's normalized fingerprint source shape. */
function resolved() {
  return { runtimeVersion: 'a'.repeat(40), fingerprintSources: [
    { id: 'expoAutolinkingConfig:android', contents: JSON.stringify({ modules: [{ packageName: 'expo-updates' }, { packageName: '@calibrate/wear-pairing' }] }) },
    { id: 'rncoreAutolinkingConfig:android', contents: JSON.stringify({ 'react-native-health-connect': {} }) }
  ] };
}

test('runtime resolution accepts a complete native graph', () => {
  assert.equal(validateRuntimeResolution(resolved()), 'a'.repeat(40));
});

test('a valid-looking hash cannot hide failed autolinking or appVersion policy', () => {
  assert.throws(() => validateRuntimeResolution({ ...resolved(), runtimeVersion: '0.2.8' }), /fingerprint/);
  for (const index of [0, 1]) {
    const value = resolved();
    value.fingerprintSources[index].contents = '{}';
    assert.throws(() => validateRuntimeResolution(value), /Incomplete/);
  }
});
