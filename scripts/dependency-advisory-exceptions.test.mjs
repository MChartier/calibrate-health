import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IMAGE_SIZE_ADVISORY_EXCEPTION,
  UUID_ADVISORY_EXCEPTION,
  evaluateImageSizeAdvisoryException,
  evaluateProductionAuditReport,
  evaluateUuidAdvisoryException,
  getLockedImageSizeInstalls,
  getLockedUuidVersions,
  isImageSizeVersionAffected,
  isUuidVersionAffected,
  readLockedUuidVersions
} from './dependency-advisory-exceptions.mjs';

/** Build deterministic image size audit report for regression coverage. */
const imageSizeAuditReport = (additionalVulnerabilities = {}) => ({
  auditReportVersion: 2,
  vulnerabilities: {
    'image-size': {
      severity: 'high',
      via: IMAGE_SIZE_ADVISORY_EXCEPTION.advisories.map((advisory) => ({
        name: 'image-size',
        dependency: 'image-size',
        url: advisory.url,
        severity: 'high'
      })),
      nodes: ['node_modules/image-size']
    },
    metro: {
      severity: 'high',
      via: ['image-size', 'metro-config'],
      nodes: ['node_modules/metro']
    },
    'metro-config': {
      severity: 'high',
      via: ['metro'],
      nodes: ['node_modules/metro-config']
    },
    ...additionalVulnerabilities
  }
});

/** Build deterministic image size lockfile for regression coverage. */
const imageSizeLockfile = (packagePath = 'node_modules/image-size', version = '1.2.1') => ({
  packages: {
    [packagePath]: { version }
  }
});

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

test('models the full published image-size affected range', () => {
  assert.equal(isImageSizeVersionAffected('1.2.1'), true);
  assert.equal(isImageSizeVersionAffected('2.0.2'), true);
  assert.equal(isImageSizeVersionAffected('2.0.3'), false);
});

test('accepts only the reviewed image-size install before its deadline', () => {
  const installs = getLockedImageSizeInstalls(imageSizeLockfile());
  const accepted = evaluateImageSizeAdvisoryException(installs, {
    now: new Date('2026-08-15T23:59:59.999Z')
  });
  const wrongPath = evaluateImageSizeAdvisoryException(
    getLockedImageSizeInstalls(imageSizeLockfile('node_modules/metro/node_modules/image-size')),
    { now: new Date('2026-08-10T00:00:00.000Z') }
  );
  const oldWrongVersion = evaluateImageSizeAdvisoryException(
    getLockedImageSizeInstalls(imageSizeLockfile('node_modules/image-size', '2.0.2')),
    { now: new Date('2026-08-10T00:00:00.000Z') }
  );
  const futureWrongVersion = evaluateImageSizeAdvisoryException(
    getLockedImageSizeInstalls(imageSizeLockfile('node_modules/image-size', '2.0.3')),
    { now: new Date('2026-08-10T00:00:00.000Z') }
  );

  assert.equal(accepted.ok, true);
  assert.match(accepted.message, /repository-owned assets/);
  assert.match(accepted.message, /github\.com\/advisories\/GHSA-w3rx-r6r6-pgpr/);
  assert.equal(wrongPath.ok, false);
  assert.equal(oldWrongVersion.ok, false);
  assert.equal(futureWrongVersion.ok, false);
});

test('rejects the image-size exception at expiry and in strict release mode', () => {
  const installs = getLockedImageSizeInstalls(imageSizeLockfile());
  assert.equal(evaluateImageSizeAdvisoryException(installs, {
    now: new Date(IMAGE_SIZE_ADVISORY_EXCEPTION.expiresAt)
  }).ok, false);
  assert.equal(evaluateImageSizeAdvisoryException(installs, {
    now: new Date('2026-08-10T00:00:00.000Z'),
    strict: true
  }).ok, false);
});

test('accepts only transitive npm effects of the exact reviewed image-size advisories', () => {
  const result = evaluateProductionAuditReport(
    imageSizeAuditReport(),
    imageSizeLockfile(),
    { now: new Date('2026-08-10T00:00:00.000Z') }
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /limited to the reviewed image-size exception/);
});

test('rejects an unrelated high advisory even when the reviewed image-size finding is present', () => {
  const result = evaluateProductionAuditReport(
    imageSizeAuditReport({
      unrelated: {
        severity: 'critical',
        via: [{
          name: 'unrelated',
          dependency: 'unrelated',
          url: 'https://github.com/advisories/GHSA-0000-1111-2222',
          severity: 'critical'
        }],
        nodes: ['node_modules/unrelated']
      }
    }),
    imageSizeLockfile(),
    { now: new Date('2026-08-10T00:00:00.000Z') }
  );

  assert.equal(result.ok, false);
  assert.match(result.message, /unreviewed high or critical/);
  assert.match(result.message, /unrelated/);
});

test('rejects a new non-Metro consumer of the reviewed image-size advisories', () => {
  const result = evaluateProductionAuditReport(
    imageSizeAuditReport({
      'runtime-image-loader': {
        severity: 'high',
        via: ['image-size'],
        nodes: ['node_modules/runtime-image-loader']
      }
    }),
    imageSizeLockfile(),
    { now: new Date('2026-08-10T00:00:00.000Z') }
  );

  assert.equal(result.ok, false);
  assert.match(result.message, /unreviewed high or critical/);
  assert.match(result.message, /runtime-image-loader/);
});

test('rejects drift in the reviewed advisory IDs or npm install path', () => {
  const advisoryDrift = imageSizeAuditReport();
  advisoryDrift.vulnerabilities['image-size'].via.push({
    name: 'image-size',
    dependency: 'image-size',
    url: 'https://github.com/advisories/GHSA-0000-1111-2222',
    severity: 'high'
  });
  const pathDrift = imageSizeAuditReport();
  pathDrift.vulnerabilities['image-size'].nodes = ['node_modules/metro/node_modules/image-size'];

  assert.equal(evaluateProductionAuditReport(advisoryDrift, imageSizeLockfile(), {
    now: new Date('2026-08-10T00:00:00.000Z')
  }).ok, false);
  assert.equal(evaluateProductionAuditReport(pathDrift, imageSizeLockfile(), {
    now: new Date('2026-08-10T00:00:00.000Z')
  }).ok, false);
});
