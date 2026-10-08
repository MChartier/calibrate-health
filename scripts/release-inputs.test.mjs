import assert from 'node:assert/strict';
import test from 'node:test';
import { relevantPlatformFile, dependencyClosure, releaseInputs } from './release-inputs.mjs';

test('platform resolution excludes overridden implementations, tests and unrelated web modules', () => {
  const files = new Set(['mobile/src/View.tsx', 'mobile/src/View.native.tsx', 'mobile/src/View.ios.tsx', 'mobile/src/View.web.tsx']);
  assert.equal(relevantPlatformFile('mobile/src/View.native.tsx', 'android', files), true);
  assert.equal(relevantPlatformFile('mobile/src/View.native.tsx', 'ios', files), false);
  assert.equal(relevantPlatformFile('mobile/src/View.ios.tsx', 'ios', files), true);
  assert.equal(relevantPlatformFile('mobile/src/View.web.tsx', 'android', files), false);
  assert.equal(relevantPlatformFile('mobile/src/View.tsx', 'web', files), false);
  assert.equal(relevantPlatformFile('shared/value.test.ts', 'web', files), false);
});
test('dependency closure follows workspace links and nested resolution, ignoring unrelated tooling', () => {
  const lock = { packages: { mobile: { dependencies: { core: '*', ui: '1' } },
    'node_modules/core': { link: true, resolved: 'packages/core' }, 'packages/core': { version: '1', dependencies: { zod: '1' } },
    'node_modules/ui': { version: '1', dependencies: { zod: '2' } }, 'node_modules/zod': { version: '1' },
    'node_modules/ui/node_modules/zod': { version: '2' }, 'node_modules/unrelated': { version: '1' } } };
  const before = dependencyClosure(lock, 'mobile');
  lock.packages['node_modules/unrelated'].version = '2'; assert.deepEqual(dependencyClosure(lock, 'mobile'), before);
  lock.packages['node_modules/ui/node_modules/zod'].version = '3'; assert.notDeepEqual(dependencyClosure(lock, 'mobile'), before);
  delete lock.packages['node_modules/zod']; assert.throws(() => dependencyClosure(lock, 'mobile'), /Unresolved/);
});
function fixture() {
  const files = new Map(Object.entries({
    'mobile/src/View.tsx': 'native view', 'mobile/src/View.web.tsx': 'web view', 'backend/src/main.ts': 'server',
    'mobile/app.json': JSON.stringify({ expo: { version: '1.0.0', android: { versionCode: 1 }, ios: { buildNumber: '1' } } }),
    'mobile/modules/example/android/code.kt': 'android', 'mobile/modules/example/ios/code.swift': 'ios',
    'wear/app/build.gradle.kts': 'versionCode = 2\nversionName = "1.0.0"\n',
    'package-lock.json': JSON.stringify({ packages: { mobile: { version: '1', dependencies: {} } } }),
    'backend/package-lock.json': JSON.stringify({ packages: { '': { version: '1', dependencies: {} } } })
  }));
  const execute = (_command, args) => {
    if (args.includes('ls-tree')) return Buffer.from([...files.keys()].join('\0') + '\0');
    if (args.includes('show')) return Buffer.from(files.get(args.at(-1).split(':').slice(1).join(':')));
    throw Error('Unexpected Git command');
  };
  const inputs = () => releaseInputs('.', 'a'.repeat(40), { execute, nativePackages: { android: new Set(), ios: new Set() } });
  return { files, inputs };
}
test('exact snapshots detect platform changes, deletions and renames without allocating for metadata', () => {
  const f = fixture(), before = f.inputs();
  f.files.set('mobile/src/View.web.tsx', 'new web');
  const web = f.inputs(); assert.notEqual(web.server, before.server); assert.deepEqual(web.native, before.native);
  assert.deepEqual(web.bundle, before.bundle);
  f.files.set('mobile/src/View.web.tsx', 'web view');
  f.files.set('mobile/modules/example/ios/code.swift', 'new ios');
  const ios = f.inputs(); assert.notEqual(ios.native.ios, before.native.ios); assert.equal(ios.native.android, before.native.android);
  assert.equal(ios.server, before.server);
  f.files.set('mobile/modules/example/ios/code.swift', 'ios');
  f.files.set('mobile/app.json', JSON.stringify({ expo: { version: '2.0.0', android: { versionCode: 3 }, ios: { buildNumber: '5' } } }));
  assert.deepEqual(f.inputs(), before);
  f.files.delete('backend/src/main.ts'); assert.notEqual(f.inputs().server, before.server);
  f.files.set('backend/src/renamed.ts', 'server'); assert.notEqual(f.inputs().server, before.server);
});
