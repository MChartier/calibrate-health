import assert from 'node:assert/strict';
import test from 'node:test';
import { ipaObservation, inspectIosBuild } from './ios-artifact.mjs';
import { hash } from './release-plan.mjs';
import { verifyIosArtifact } from './ios-release.mjs';

function fixture() {
  const teamId = 'ABCDEFGHIJ', bundleIdentifier = 'app.calibratehealth.mobile';
  const expected = { source: 'a'.repeat(40), buildId: '11111111-1111-4111-8111-111111111111', configuration: hash('configuration'),
    bundleIdentifier, version: '1.2.3', buildNumber: '11', runtime: 'ios-1.2.3-11', projectId: '11111111-1111-4111-8111-111111111111',
    channel: 'production', serverUrl: 'https://synthetic.invalid', distribution: 'store' };
  const entitlements = { 'application-identifier': `${teamId}.${bundleIdentifier}`, 'com.apple.developer.team-identifier': teamId, 'get-task-allow': false };
  const input = { teamId, artifactSha256: hash('exact IPA bytes'), bundleHasEndpoint: true,
    info: { CFBundleIdentifier: bundleIdentifier, CFBundleShortVersionString: '1.2.3', CFBundleVersion: '11', DTPlatformName: 'iphoneos',
      DTSDKName: 'iphoneos26.6', DTXcode: '2660', CFBundleSupportedPlatforms: ['iPhoneOS'] },
    updates: { EXUpdatesRuntimeVersion: 'ios-1.2.3-11', EXUpdatesURL: `https://u.expo.dev/${expected.projectId}`, EXUpdatesRequestHeaders: { 'expo-channel-name': 'production' } },
    provisioning: { TeamIdentifier: [teamId], Entitlements: entitlements, ExpirationDate: '2999-01-01T00:00:00Z' },
    signedEntitlements: structuredClone(entitlements) };
  return { expected, input };
}
test('IPA metadata binds signed app, provisioning, endpoint, runtime and exact artifact bytes', () => {
  const { input, expected } = fixture();
  const receipt = verifyIosArtifact(ipaObservation(input, expected), expected);
  assert.equal(receipt.artifactSha256, input.artifactSha256); assert.equal(receipt.source, expected.source);
});
test('IPA rejects expired, mismatched, development, enterprise and simulator metadata', () => {
  for (const mutate of [i => i.provisioning.ExpirationDate = '2000-01-01', i => i.signedEntitlements['application-identifier'] = 'wrong',
    i => { i.provisioning.Entitlements['get-task-allow'] = true; i.signedEntitlements['get-task-allow'] = true; },
    i => i.provisioning.ProvisionsAllDevices = true, i => i.info.DTPlatformName = 'iphonesimulator', i => i.bundleHasEndpoint = false,
    i => i.updates.EXUpdatesRuntimeVersion = 'other', i => i.info.DTXcode = '1640', i => i.info.DTSDKName = 'iphoneos18.5']) {
    const { input, expected } = fixture(); mutate(input);
    assert.throws(() => verifyIosArtifact(ipaObservation(input, expected), expected));
  }
});
test('IPA inspection fails before network or commands on a non-macOS runner', async () => {
  await assert.rejects(inspectIosBuild({}, {}, { platform: 'win32', fetchImpl: () => { throw Error('must not fetch'); } }), /macOS/);
});
