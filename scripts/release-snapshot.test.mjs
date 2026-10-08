import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { snapshotEnvironment, sourceSnapshots } from './release-snapshot.mjs';

test('snapshot commands receive neither provider credentials nor inherited Node/Git injection settings', () => {
  const env = snapshotEnvironment({ PATH: 'tools', SystemRoot: 'system', EXPO_TOKEN: 'private', GITHUB_TOKEN: 'private',
    GOOGLE_APPLICATION_CREDENTIALS: 'private-file', NODE_OPTIONS: '--require=untrusted', GIT_CONFIG_COUNT: '1', NPM_TOKEN: 'private' });
  assert.equal(env.PATH, 'tools'); assert.equal(env.SystemRoot, 'system');
  for (const name of ['EXPO_TOKEN', 'GITHUB_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS', 'NODE_OPTIONS', 'GIT_CONFIG_COUNT', 'NPM_TOKEN']) assert(!Object.hasOwn(env, name));
  assert.equal(env.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
});

test('each exact source owns a credential-free dependency snapshot; repeated reads are cached and isolated', async t => {
  const calls = [], source = 'a'.repeat(40), other = 'b'.repeat(40);
  const cache = sourceSnapshots({ root: '.', environment: { npm_execpath: fileURLToPath(import.meta.url) }, execute: (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === '--no-replace-objects') return options.cwd.endsWith(source) ? source : other;
    return '';
  }, fingerprint: (_root, revision, { profile }) => ({ source: revision, profile }) });
  t.after(cache.close);
  const first = await cache.snapshot(source); first.source = 'mutated local result';
  assert.deepEqual(await cache.snapshot(source), { source, profile: 'production' });
  assert.deepEqual(await cache.snapshot(source, 'internal'), { source, profile: 'internal' });
  assert.deepEqual(await cache.snapshot(other), { source: other, profile: 'production' });
  assert.equal(calls.filter(c => c.args.includes('ci')).length, 2);
  for (const call of calls.filter(c => c.args.includes('ci'))) assert(call.args.includes('--ignore-scripts'));
  await assert.rejects(cache.snapshot('master'), /exact source/);
  cache.close(); await assert.rejects(cache.snapshot(source), /open cache/);
});
