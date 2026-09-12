import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { compareClientServerCompatibility, getClientServerCompatibilityMismatch, parseServerRequirement, serverRequirementMessage } from '../shared/releaseCompatibility.ts';

test('explicit requirements enforce inclusive patch minimum and exclusive upper boundary', () => {
  const range = '>=2.4.1 <3.0.0';
  for (const version of ['2.4.1', '2.4.2', '2.99.0', '2.4.1+build.2', '2.4.1+build-2']) assert.equal(compareClientServerCompatibility(range, version), 'compatible');
  for (const version of ['1.99.9', '2.3.99', '2.4.0']) assert.equal(compareClientServerCompatibility(range, version), 'server_behind');
  for (const version of ['3.0.0', '4.0.0']) assert.equal(compareClientServerCompatibility(range, version), 'client_behind');
  for (const version of [null, 'bad', '2.4.1-beta.1', '2.4.01']) assert.equal(compareClientServerCompatibility(range, version), 'invalid');
});

test('0.x and custom upper bounds have explicit semantics, without caret assumptions', () => {
  assert.equal(compareClientServerCompatibility('>=0.36.0 <1.0.0', '0.37.0'), 'compatible');
  assert.equal(compareClientServerCompatibility('>=0.36.0 <0.38.0', '0.38.0'), 'client_behind');
  for (const invalid of ['^0.36.0', '>=1.0.0', '>=2.0.0 <1.0.0', '>=1.0.0 <1.0.0', '>=01.0.0 <2.0.0']) assert.equal(parseServerRequirement(invalid), null);
});

test('range mismatch preserves the requirement and produces actionable text', () => {
  const mismatch = getClientServerCompatibilityMismatch('>=2.4.1 <3.0.0', '2.4.0');
  assert.equal(mismatch.clientVersion, '>=2.4.1 <3.0.0');
  assert.match(serverRequirementMessage(mismatch), /server 2.4.1 or newer, below 3.0.0/);
  assert.match(serverRequirementMessage(mismatch), /Update the server first/);
});

test('client requirement is explicit and does not import the server release number', () => {
  const client = JSON.parse(fs.readFileSync(new URL('../shared/client-release.json', import.meta.url)));
  assert.ok(parseServerRequirement(client.requiresServer));
  const source = fs.readFileSync(new URL('../mobile/src/config/nativeClient.ts', import.meta.url), 'utf8');
  assert.match(source, /clientRelease.requiresServer/);
  assert.doesNotMatch(source, /release.server.version/);
});
