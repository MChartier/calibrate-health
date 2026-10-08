import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { candidateDocuments, CANDIDATE_INPUTS } from './release-candidate.mjs';
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

test('locked build compiler dependencies are included without importing unrelated test tool graphs', () => {
  const lock = { packages: { mobile: { dependencies: {}, devDependencies: { typescript: '6', jest: '29' } },
    'node_modules/typescript': { version: '6.0.1' }, 'node_modules/jest': { version: '29.0.0' } } };
  const snapshot = () => dependencyClosure(lock, 'mobile', { buildTools: ['typescript'] });
  const before = snapshot(); assert(before['node_modules/typescript']); assert(!before['node_modules/jest']);
  lock.packages['node_modules/typescript'].version = '6.0.2'; assert.notDeepEqual(snapshot(), before);
  delete lock.packages['node_modules/typescript']; assert.throws(snapshot, /Unresolved direct dependency/);
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
  const modes = new Map();
  const execute = (_command, args) => {
    if (args.includes('ls-tree')) return Buffer.from([...files.keys()].map(name => `${modes.get(name) ?? '100644'} blob ${'a'.repeat(40)}\t${name}`).join('\0') + '\0');
    if (args.includes('show')) return Buffer.from(files.get(args.at(-1).split(':').slice(1).join(':')));
    throw Error('Unexpected Git command');
  };
  const inputs = (profile = 'production') => releaseInputs('.', 'a'.repeat(40), { execute, profile, nativePackages: { android: new Set(), ios: new Set() } });
  return { files, inputs, modes };
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

test('every canonical allocation leaves input fingerprints unchanged', async () => {
  const originals = Object.fromEntries(CANDIDATE_INPUTS.map(name => [name, fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')]));
  const f = fixture();
  for (const [name, text] of Object.entries(originals)) f.files.set(name, text);
  const before = f.inputs();
  for (const [android, ios, serverBump] of [[true, false, null], [false, true, null], [false, false, 'patch'], [true, true, 'patch']]) {
    const documents = await candidateDocuments(originals, { schema: 1, runId: '10', planDigest: 'b'.repeat(64),
      source: 'a'.repeat(40), android, ios, serverBump });
    for (const [name, text] of Object.entries({ ...originals, ...documents })) f.files.set(name, text);
    assert.deepEqual(f.inputs(), before, `Metadata-only allocation must not trigger another release: ${android}/${ios}/${serverBump}`);
  }
});

test('planner edits do not rebuild artifacts while native build settings do', () => {
  const f = fixture();
  f.files.set('scripts/release-plan.mjs', 'first planner');
  const before = f.inputs();
  f.files.set('scripts/release-plan.mjs', 'new planner');
  assert.deepEqual(f.inputs(), before);
  f.files.set('mobile/gradle/libs.versions.toml', 'native toolchain');
  assert.notEqual(f.inputs().native.android, before.native.android);
});

test('profile/platform build settings cannot spend on another platform or publish a needless OTA/image', () => {
  const f = fixture();
  const eas = { cli: { version: '22.4.0' }, build: {
    production: { channel: 'production', ios: { image: 'one' }, android: { buildType: 'app-bundle' } },
    internal: { channel: 'internal', ios: { image: 'one' }, android: { buildType: 'apk' } }
  } };
  f.files.set('mobile/eas.json', JSON.stringify(eas));
  const production = f.inputs(), internal = f.inputs('internal');
  eas.build.internal.ios.image = 'two'; f.files.set('mobile/eas.json', JSON.stringify(eas));
  assert.deepEqual(f.inputs(), production);
  const changed = f.inputs('internal');
  assert.notEqual(changed.native.ios, internal.native.ios);
  assert.equal(changed.native.android, internal.native.android);
  assert.equal(changed.server, internal.server); assert.deepEqual(changed.bundle, internal.bundle);
  eas.build.production.extends = 'internal'; f.files.set('mobile/eas.json', JSON.stringify(eas));
  assert.throws(f.inputs, /inherited profiles/);
});

test('the production image fingerprints every actual web build helper copied by Dockerfile.app', () => {
  for (const name of ['expo-cli-environment', 'expo-web-build', 'expo-web-release']) {
    const f = fixture(); f.files.set(`scripts/${name}.mjs`, 'first helper'); const before = f.inputs();
    f.files.set(`scripts/${name}.mjs`, 'changed helper'); const after = f.inputs();
    assert.notEqual(after.server, before.server);
    assert.deepEqual(after.native, before.native); assert.deepEqual(after.bundle, before.bundle);
  }
});

test('executable-bit changes affect artifact inputs and source symlinks cannot bypass inspection', () => {
  const f = fixture(), before = f.inputs();
  f.modes.set('backend/src/main.ts', '100755'); assert.notEqual(f.inputs().server, before.server);
  f.modes.set('mobile/app.json', '120000'); assert.throws(f.inputs, /regular source file/);
});
