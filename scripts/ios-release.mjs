import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nextReleaseVersion, MAX_CLIENT_DIAGNOSTIC_VERSIONS_PER_PLATFORM } from './release-config.mjs';
import { hash, SHA, DIGEST } from './release-plan.mjs';

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function iosVersion(value) {
  assert(value?.schemaVersion === 1 && VERSION.test(value.version) && VERSION.test(value.minimumSupportedVersion) &&
    /^[1-9]\d{0,8}$/.test(value.buildNumber), 'Invalid immutable iOS version contract.');
  return value;
}
export function nextIosVersion(value) {
  iosVersion(value);
  assert(Number(value.buildNumber) < 999999999, 'iOS build allocation exhausted.');
  return { ...value, version: nextReleaseVersion(value.version, 'patch'), buildNumber: String(Number(value.buildNumber) + 1) };
}

/** A pure exact-byte transformation suitable for reconstructing a candidate before CI/merge. */
export function iosVersionDocuments(originals, next) {
  iosVersion(next);
  const current = iosVersion(JSON.parse(originals['shared/ios-release.json']));
  assert.deepEqual(next, nextIosVersion(current), 'iOS candidate is not the next exact allocation.');
  const app = JSON.parse(originals['mobile/app.json']);
  assert.equal(app.expo.ios.buildNumber, current.buildNumber, 'iOS version mirrors differ before preparation.');
  app.expo.ios.buildNumber = next.buildNumber;
  const diagnostics = JSON.parse(originals['shared/client-diagnostic-versions.json']);
  const old = diagnostics.supported_versions.ios;
  assert(Array.isArray(old) && old[0] === current.version, 'iOS diagnostic versions differ before preparation.');
  const supported = [next.version, ...old.filter(v => v !== next.version)].slice(0, MAX_CLIENT_DIAGNOSTIC_VERSIONS_PER_PLATFORM);
  diagnostics.supported_versions.ios = supported;
  const format = (value, original) => `${JSON.stringify(value, null, 2)}\n`.replaceAll('\n', original.includes('\r\n') ? '\r\n' : '\n');
  const replace = (text, before, after) => {
    assert(text.split(before).length === 2, 'iOS generated mirror has ambiguous or missing content.');
    return text.replace(before, after);
  };
  const api = versions => `- properties: { platform: { const: ios }, version: { enum: [${versions.join(', ')}] } }`;
  const generated = originals['packages/api-client/src/generated/v1.ts'];
  const block = versions => ['platform?: "ios";', '            /** @enum {unknown} */',
    `            version?: "${versions.join('" | "')}";`].join(generated.includes('\r\n') ? '\r\n' : '\n');
  return {
    'shared/ios-release.json': format(next, originals['shared/ios-release.json']),
    'mobile/app.json': format(app, originals['mobile/app.json']),
    'shared/client-diagnostic-versions.json': format(diagnostics, originals['shared/client-diagnostic-versions.json']),
    'docs/openapi/v1.yaml': replace(originals['docs/openapi/v1.yaml'], api(old), api(supported)),
    'packages/api-client/src/generated/v1.ts': replace(generated, block(old), block(supported))
  };
}

export function prepareIosVersion(root) {
  const names = ['shared/ios-release.json', 'mobile/app.json', 'shared/client-diagnostic-versions.json',
    'docs/openapi/v1.yaml', 'packages/api-client/src/generated/v1.ts'];
  const originals = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
  const next = nextIosVersion(JSON.parse(originals[names[0]]));
  const documents = iosVersionDocuments(originals, next);
  try { for (const [name, contents] of Object.entries(documents)) fs.writeFileSync(path.join(root, name), contents); }
  catch (error) { for (const [name, contents] of Object.entries(originals)) fs.writeFileSync(path.join(root, name), contents); throw error; }
  return next;
}

/** Produce exact worker arguments; build auth and upload auth belong to different runners. */
export function iosBuildRequest({ source, configuration, version, planDigest, profile = 'production' }) {
  assert(SHA.test(source) && DIGEST.test(planDigest), 'iOS build requires immutable source and plan.');
  iosVersion(version);
  assert(['internal', 'production'].includes(profile) && configuration.profile === profile, 'iOS profile differs from configuration.');
  return { args: ['build', '--platform', 'ios', '--profile', profile, '--non-interactive', '--freeze-credentials',
    '--no-wait', '--json', '--message', `calibrate:${source}:${planDigest}`],
    binding: { source, configuration: hash(configuration), version: version.version, buildNumber: version.buildNumber,
      runtime: `ios-${version.version}-${version.buildNumber}`, platform: 'ios', profile },
    environment: { EXPO_PUBLIC_CALIBRATE_SERVER_URL: configuration.serverUrl, EXPO_PUBLIC_EAS_PROJECT_ID: configuration.projectId,
      EXPO_UPDATES_CHANNEL: configuration.channel, EAS_ENVIRONMENT: configuration.environment, EAS_BUILD_PLATFORM: 'ios', EXPO_NO_DOTENV: '1' } };
}

export function iosSubmitRequest({ buildId, buildReceipt, appStoreConnectId }) {
  assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(buildId) && buildReceipt?.buildId === buildId && buildReceipt.platform === 'ios' &&
    (buildReceipt.distribution === 'store' || buildReceipt.distribution === undefined && buildReceipt.schema === 1 &&
      buildReceipt.kind === 'native' && buildReceipt.profile === 'production' && DIGEST.test(buildReceipt.planDigest)) &&
    DIGEST.test(buildReceipt.artifactSha256) && SHA.test(buildReceipt.source),
  'Submission requires the exact verified store build; simulator/ad-hoc/latest selection is forbidden.');
  assert(/^[1-9]\d+$/.test(appStoreConnectId), 'External App Store Connect application ID is required.');
  return { args: ['submit', '--platform', 'ios', '--id', buildId, '--profile', 'testflight', '--non-interactive', '--no-auto-testflight-setup', '--no-wait'],
    eas: { submit: { testflight: { ios: { ascAppId: appStoreConnectId } } } },
    binding: { source: buildReceipt.source, buildId, artifactSha256: buildReceipt.artifactSha256,
      application: hash(appStoreConnectId), stage: 'upload' } };
}

/** Values must come from the downloaded IPA's Info.plist and embedded provisioning profile, not EAS labels. */
export function verifyIosArtifact(observed, expected) {
  assert(observed && expected && observed.platform === 'ios' && observed.simulator === false,
    'Expected a device IPA, not simulator output.');
  for (const field of ['bundleIdentifier', 'version', 'buildNumber', 'runtime', 'projectId', 'channel', 'serverUrl']) {
    assert.equal(observed[field], expected[field], `IPA ${field} differs from its immutable build request.`);
  }
  assert(observed.signed === true && observed.entitlements?.['get-task-allow'] === false, 'IPA must have a distribution signature.');
  assert(observed.distribution === expected.distribution && ['store', 'internal'].includes(observed.distribution), 'IPA distribution differs.');
  assert(DIGEST.test(observed.artifactSha256), 'Missing exact IPA byte digest.');
  return { platform: 'ios', source: expected.source, buildId: expected.buildId, artifactSha256: observed.artifactSha256,
    distribution: observed.distribution, version: observed.version, buildNumber: observed.buildNumber,
    runtime: observed.runtime, configuration: expected.configuration };
}
