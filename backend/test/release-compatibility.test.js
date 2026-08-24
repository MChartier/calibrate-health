const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLIENT_SERVER_MAJOR_VERSION_STATUSES,
  compareClientServerMajorVersions,
  formatMajorVersion,
  getClientServerMajorVersionMismatch
} = require('../../shared/releaseCompatibility');

test('client and server releases with the same major version are compatible', () => {
  for (const [clientVersion, serverVersion] of [
    ['0.34.0', '0.99.99'],
    ['1.2.3-internal.4', '1.999.0+build.8'],
    ['10.20.30', '10.0.0']
  ]) {
    assert.equal(
      compareClientServerMajorVersions(clientVersion, serverVersion),
      CLIENT_SERVER_MAJOR_VERSION_STATUSES.COMPATIBLE
    );
    assert.equal(getClientServerMajorVersionMismatch(clientVersion, serverVersion), null);
  }
});

test('major-version comparison identifies which side is behind', () => {
  assert.equal(compareClientServerMajorVersions('1.99.9', '2.0.0'), 'client_behind');
  assert.equal(compareClientServerMajorVersions('2.0.0', '1.999.99'), 'server_behind');
  assert.deepEqual(getClientServerMajorVersionMismatch('2.35.0', '1.34.9'), {
    clientVersion: '2.35.0',
    serverVersion: '1.34.9',
    status: 'server_behind'
  });
});

test('malformed semantic versions fail closed', () => {
  for (const version of ['1.2', '1.2.3.4', '01.2.3', '1.2.3-..', '1.2.3+..', ' future ']) {
    assert.equal(compareClientServerMajorVersions(version, '1.2.3'), 'invalid');
    assert.equal(compareClientServerMajorVersions('1.2.3', version), 'invalid');
    assert.equal(formatMajorVersion(version), null);
    assert.deepEqual(getClientServerMajorVersionMismatch('1.2.3', version), {
      clientVersion: '1.2.3',
      serverVersion: 'invalid',
      status: 'invalid'
    });
  }
  assert.equal(compareClientServerMajorVersions(undefined, '1.2.3'), 'invalid');
  assert.deepEqual(getClientServerMajorVersionMismatch('1.2.3', undefined), {
    clientVersion: '1.2.3',
    serverVersion: 'unknown',
    status: 'invalid'
  });
  assert.equal(formatMajorVersion('12.34.56-internal'), '12.x');
});

test('major-version comparison does not lose precision for large canonical identifiers', () => {
  const largeMajor = `${'9'.repeat(400)}.0.0`;
  assert.equal(compareClientServerMajorVersions(largeMajor, '10.0.0'), 'server_behind');
  assert.equal(compareClientServerMajorVersions(`1.${'9'.repeat(400)}.0`, '1.10.0'), 'compatible');
});
