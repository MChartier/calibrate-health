import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UUID_ADVISORY_EXCEPTION,
  evaluateUuidAdvisoryException,
  getLockedUuidVersions,
  isUuidVersionAffected,
  readLockedUuidVersions
} from './dependency-advisory-exceptions.mjs';

test('accepts the affected UUID version only before the exception deadline', () => {
  const result = evaluateUuidAdvisoryException(['7.0.3'], {
    now: new Date('2026-08-11T23:59:59.999Z')
  });

  assert.equal(result.ok, true);
  assert.match(result.message, /temporarily accepted/);
  assert.match(result.message, /issues\/222/);
});

test('rejects the affected UUID version at the exception deadline', () => {
  const result = evaluateUuidAdvisoryException(['7.0.3'], {
    now: new Date(UUID_ADVISORY_EXCEPTION.expiresAt)
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /expired/);
});

test('rejects an active exception immediately in strict release mode', () => {
  const result = evaluateUuidAdvisoryException(['7.0.3'], {
    now: new Date('2026-07-12T00:00:00.000Z'),
    strict: true
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /production release validation requires resolution/);
});

test('models every published affected UUID range', () => {
  assert.equal(isUuidVersionAffected('11.1.0'), true);
  assert.equal(isUuidVersionAffected('11.1.1'), false);
  assert.equal(isUuidVersionAffected('12.0.0'), true);
  assert.equal(isUuidVersionAffected('12.0.1'), false);
  assert.equal(isUuidVersionAffected('13.0.0'), true);
  assert.equal(isUuidVersionAffected('13.0.1'), false);
  assert.equal(isUuidVersionAffected('14.0.0'), false);
});

test('accepts fixed UUID versions after the deadline', () => {
  const result = evaluateUuidAdvisoryException(['11.1.1', '12.0.1', '13.0.1'], {
    now: new Date('2027-01-01T00:00:00.000Z')
  });

  assert.deepEqual(result, {
    ok: true,
    message: 'GHSA-w5hq-g745-h8pq is not present in the locked graph.'
  });
});

test('collects root and nested UUID versions from a lock graph', () => {
  const versions = getLockedUuidVersions({
    packages: {
      'node_modules/uuid': { version: '11.1.1' },
      'node_modules/xcode/node_modules/uuid': { version: '7.0.3' },
      'node_modules/other/node_modules/uuid': { version: '12.0.0' }
    }
  });

  assert.deepEqual(versions, ['7.0.3', '11.1.1', '12.0.0']);
  assert.equal(evaluateUuidAdvisoryException(versions, { strict: true }).ok, false);
});

test('reads every UUID version from the production lock graph', async () => {
  assert.deepEqual(await readLockedUuidVersions(), ['7.0.3']);
});
