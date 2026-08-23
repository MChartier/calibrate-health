const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLIENT_SERVER_RELEASE_STATUSES,
  compareClientServerReleaseLines,
  formatReleaseLine,
  getClientServerReleaseMismatch
} = require('../../shared/releaseCompatibility');

test('client and server patch releases share a compatible release line', () => {
  for (const [clientVersion, serverVersion] of [
    ['0.34.0', '0.34.99'],
    ['1.2.3-internal.4', '1.2.0+build.8'],
    ['10.20.30', '10.20.0']
  ]) {
    assert.equal(
      compareClientServerReleaseLines(clientVersion, serverVersion),
      CLIENT_SERVER_RELEASE_STATUSES.COMPATIBLE
    );
    assert.equal(getClientServerReleaseMismatch(clientVersion, serverVersion), null);
  }
});

test('release-line comparison identifies which side is behind', () => {
  assert.equal(compareClientServerReleaseLines('0.33.9', '0.34.0'), 'client_behind');
  assert.equal(compareClientServerReleaseLines('0.35.0', '0.34.99'), 'server_behind');
  assert.equal(compareClientServerReleaseLines('1.0.0', '0.99.9'), 'server_behind');
  assert.equal(compareClientServerReleaseLines('0.99.9', '1.0.0'), 'client_behind');
  assert.deepEqual(getClientServerReleaseMismatch('0.35.0', '0.34.9'), {
    clientVersion: '0.35.0',
    serverVersion: '0.34.9',
    status: 'server_behind'
  });
});

test('malformed semantic versions fail closed', () => {
  for (const version of ['1.2', '1.2.3.4', '01.2.3', '1.2.3-..', '1.2.3+..', ' future ']) {
    assert.equal(compareClientServerReleaseLines(version, '1.2.3'), 'invalid');
    assert.equal(compareClientServerReleaseLines('1.2.3', version), 'invalid');
    assert.equal(formatReleaseLine(version), null);
    assert.deepEqual(getClientServerReleaseMismatch('1.2.3', version), {
      clientVersion: '1.2.3',
      serverVersion: 'invalid',
      status: 'invalid'
    });
  }
  assert.equal(compareClientServerReleaseLines(undefined, '1.2.3'), 'invalid');
  assert.deepEqual(getClientServerReleaseMismatch('1.2.3', undefined), {
    clientVersion: '1.2.3',
    serverVersion: 'unknown',
    status: 'invalid'
  });
  assert.equal(formatReleaseLine('12.34.56-internal'), '12.34.x');
});

test('release-line comparison does not lose precision for large canonical identifiers', () => {
  const largeMajor = `${'9'.repeat(400)}.0.0`;
  assert.equal(compareClientServerReleaseLines(largeMajor, '10.0.0'), 'server_behind');
  assert.equal(compareClientServerReleaseLines(`1.${'9'.repeat(400)}.0`, '1.10.0'), 'server_behind');
});
