import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConfiguration, planRelease, hash, verifyPlan, verifiedReceipts } from './release-plan.mjs';

const digest = hash('input'), source = 'a'.repeat(40);
const manifest = { server: { version: '1.2.3' }, android: {
  mobile: { version_name: '0.2.7', version_code: 11 }, wear: { version_name: '0.2.7', version_code: 12 }
} };
function fixture() {
  const args = { runId: '10', repository: 'example/app', source, currentSource: source,
    configuration: { profile: 'internal', digest, serverDigest: digest },
    inputs: { server: digest, native: { android: digest, ios: digest }, bundle: { android: digest, ios: digest } },
    manifest, ios: { version: '0.2.7', buildNumber: '11' }, receipts: [] };
  args.receipts = ['server', 'android', 'ios'].map((p, i) => ({ schema: 1, id: p, sequence: i + 1,
    source, profile: 'internal', platform: p, kind: p === 'server' ? p : 'native', input: digest,
    configuration: digest, bundleInput: digest, artifactSha256: digest, runtime: '0.2.7' }));
  return args;
}
test('no change compares per-artifact verified receipts and preserves every allocation', () => {
  const a = fixture(), plan = planRelease(a);
  assert.equal(plan.noChange, true); assert.deepEqual(plan.stages, []);
  assert.deepEqual(plan.versions, { server: '1.2.3', android: manifest.android, ios: a.ios });
  verifyPlan(plan); plan.source = 'b'.repeat(40); assert.throws(() => verifyPlan(plan), /changed/);
});
for (const kind of ['server', 'native', 'bundle']) for (const platform of kind === 'server' ? ['server'] : ['android', 'ios']) {
  test(`selects only ${kind}/${platform}`, () => {
    const a = fixture();
    if (kind === 'server') a.inputs.server = hash('changed'); else a.inputs[kind][platform] = hash('changed');
    const plan = planRelease(a);
    assert.equal(plan.stages.length, 1);
    assert.equal(plan.stages[0].kind, kind === 'bundle' ? 'ota' : kind);
    if (kind !== 'server') assert.equal(plan.stages[0].platform, platform);
    if (kind === 'native' && platform === 'android') {
      assert.equal(plan.versions.android.mobile.version_code, 13);
      assert.equal(plan.versions.android.wear.version_code, 14);
      assert.deepEqual(plan.versions.ios, a.ios);
    }
    if (kind === 'native' && platform === 'ios') {
      assert.deepEqual(plan.versions.android, a.manifest.android);
      assert.deepEqual(plan.versions.ios, { version: '0.2.8', buildNumber: '12' });
    }
  });
}
test('combined first release builds once per platform and does not duplicate embedded bundles as OTA', () => {
  const a = fixture(); a.receipts = [];
  const plan = planRelease(a);
  assert.deepEqual(plan.stages.map(s => s.key), ['native-android', 'native-ios', 'server']);
});
test('incompatible OTA remains explicit, with native rebuild selected', () => {
  const a = fixture(); a.inputs.native.android = hash('native'); a.inputs.bundle.android = hash('bundle');
  const plan = planRelease(a);
  assert.equal(plan.ota.android[0].eligible, false);
  assert.deepEqual(plan.stages.map(s => s.key), ['native-android']);
});
test('partial success advances only that artifact/profile/platform', () => {
  const a = fixture(); a.inputs.bundle.android = hash('new bundle'); a.inputs.bundle.ios = hash('new bundle');
  a.receipts.push({ ...a.receipts[1], id: 'ota-success', kind: 'ota', sequence: 4, bundleInput: a.inputs.bundle.android });
  assert.deepEqual(planRelease(a).stages.map(s => s.platform), ['ios']);
  a.configuration.profile = 'production';
  assert.deepEqual(planRelease(a).stages.map(s => s.key), ['native-android', 'native-ios']);
});

test('OTA success for one installed runtime does not hide another compatible runtime', () => {
  const a = fixture();
  a.receipts.push({ ...a.receipts[1], id: 'second-native', sequence: 4, runtime: '0.2.8' });
  a.inputs.bundle.android = hash('new bundle');
  a.receipts.push({ ...a.receipts[1], id: 'ota-success', kind: 'ota', sequence: 5, runtime: '0.2.8', bundleInput: a.inputs.bundle.android });
  const plan = planRelease(a);
  assert.deepEqual(plan.stages.map(s => s.key), ['ota-android-0.2.7']);
});
test('source drift, conflicting receipt ordering and exhausted allocations reject', () => {
  const a = fixture(); a.currentSource = 'b'.repeat(40); assert.throws(() => planRelease(a), /protected master/);
  a.currentSource = source; a.receipts.push({ ...a.receipts[1], id: 'ambiguous' });
  assert.throws(() => planRelease(a), /Ambiguous/);
  a.receipts = []; a.ios.buildNumber = '999999999'; assert.throws(() => planRelease(a), /exhausted/);
});
test('receipt admission requires real verifier success and rejects contradictory identities', async () => {
  const a = fixture();
  assert.equal((await verifiedReceipts(a.receipts, async () => true)).length, 3);
  await assert.rejects(verifiedReceipts(a.receipts, async () => false), /did not verify/);
  await assert.rejects(verifiedReceipts([...a.receipts, { ...a.receipts[0], source: 'b'.repeat(40) }], async () => true), /Conflicting/);
});
test('external configuration binds environment and channel without guessing the endpoint', () => {
  const value = { profile: 'internal', environment: 'preview', channel: 'internal', serverUrl: 'https://synthetic.invalid',
    projectId: '11111111-1111-4111-8111-111111111111' };
  const eas = { cli: { appVersionSource: 'local' }, build: { internal: { channel: 'internal', environment: 'preview', distribution: 'internal' } } };
  assert.deepEqual(buildConfiguration(value, eas), value);
  for (const change of [{ channel: 'production' }, { serverUrl: 'https://user:password@synthetic.invalid' },
    { serverUrl: 'https://synthetic.invalid/path' }, { credentials: 'private' }, { projectId: 'bad' }]) {
    assert.throws(() => buildConfiguration({ ...value, ...change }, eas));
  }
});
