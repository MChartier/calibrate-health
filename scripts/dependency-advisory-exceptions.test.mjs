import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IMAGE_SIZE_ADVISORY_EXCEPTION,
  UUID_ADVISORY_EXCEPTION,
  evaluateImageSizeAdvisoryException,
  evaluateUuidAdvisoryException,
  getLockedImageSizeVersions,
  getLockedUuidVersions,
  isUuidVersionAffected,
  readLockedImageSizeVersions,
  readLockedUuidVersions
} from './dependency-advisory-exceptions.mjs';
import {
  collectAuditAdvisories,
  evaluateProductionAuditReport
} from './production-dependency-audit.mjs';

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
  assert.deepEqual(await readLockedUuidVersions(), ['11.1.1']);
});

test('accepts only the reviewed image-size lock version before its deadline', () => {
  const accepted = evaluateImageSizeAdvisoryException(['1.2.1'], {
    now: new Date('2026-08-20T23:59:59.999Z')
  });
  const changed = evaluateImageSizeAdvisoryException(['1.2.1', '2.0.2'], {
    now: new Date('2026-08-08T00:00:00.000Z')
  });

  assert.equal(accepted.ok, true);
  assert.match(accepted.message, /temporarily accepted/);
  assert.equal(changed.ok, false);
  assert.match(changed.message, /only covers image-size@1\.2\.1/);
});

test('rejects the image-size exception at its deadline and in strict release mode', () => {
  const expired = evaluateImageSizeAdvisoryException(['1.2.1'], {
    now: new Date(IMAGE_SIZE_ADVISORY_EXCEPTION.expiresAt)
  });
  const strict = evaluateImageSizeAdvisoryException(['1.2.1'], {
    now: new Date('2026-08-08T00:00:00.000Z'),
    strict: true
  });

  assert.equal(expired.ok, false);
  assert.match(expired.message, /expired/);
  assert.equal(strict.ok, false);
  assert.match(strict.message, /production release validation requires resolution/);
});

test('collects every locked image-size version', async () => {
  assert.deepEqual(getLockedImageSizeVersions({
    packages: {
      'node_modules/image-size': { version: '1.2.1' },
      'node_modules/other/node_modules/image-size': { version: '2.0.2' }
    }
  }), ['1.2.1', '2.0.2']);
  assert.deepEqual(await readLockedImageSizeVersions(), ['1.2.1']);
});

test('resolves cyclic npm audit entries to their leaf advisories', () => {
  const resolved = collectAuditAdvisories({
    metro: { via: ['image-size', 'metro-config'] },
    'metro-config': { via: ['metro'] },
    'image-size': {
      via: IMAGE_SIZE_ADVISORY_EXCEPTION.advisories.map((advisory) => ({
        url: `https://github.com/advisories/${advisory}`
      }))
    }
  });

  assert.deepEqual(resolved.metro.advisories, [...IMAGE_SIZE_ADVISORY_EXCEPTION.advisories].sort());
  assert.deepEqual(resolved['metro-config'].advisories, [...IMAGE_SIZE_ADVISORY_EXCEPTION.advisories].sort());
  assert.deepEqual(resolved.metro.unresolved, []);
});

test('filters only high findings fully rooted in the reviewed image-size advisories', () => {
  const report = {
    vulnerabilities: {
      metro: { severity: 'high', via: ['image-size'] },
      'image-size': {
        severity: 'high',
        via: IMAGE_SIZE_ADVISORY_EXCEPTION.advisories.map((advisory) => ({
          url: `https://github.com/advisories/${advisory}`
        }))
      },
      unrelated: {
        severity: 'high',
        via: [{ url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz' }]
      },
      moderate: {
        severity: 'moderate',
        via: [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }]
      }
    }
  };
  const result = evaluateProductionAuditReport(report, ['1.2.1'], {
    now: new Date('2026-08-08T00:00:00.000Z')
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.exempted.map((finding) => finding.package), ['metro', 'image-size']);
  assert.deepEqual(result.remaining.map((finding) => finding.package), ['unrelated']);
});
