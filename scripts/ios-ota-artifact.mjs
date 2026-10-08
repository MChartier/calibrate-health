import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { listFiles, validateExpoExport, verifyEnvironmentArtifact } from './expo-ota-artifact.mjs';
import { SHA, DIGEST, bytes, hash } from './release-plan.mjs';

function bind(target, baseline) {
  assert(SHA.test(target.source) && SHA.test(baseline.source) && baseline.kind === 'native' && baseline.platform === 'ios' &&
    DIGEST.test(baseline.artifactSha256) && DIGEST.test(baseline.input) && typeof baseline.id === 'string', 'OTA requires an exact verified iOS build receipt.');
  assert(baseline.profile === target.configuration.profile && baseline.configuration === hash(target.configuration) &&
    baseline.input === target.nativeFingerprint && /^ios-\d+\.\d+\.\d+-[1-9]\d*$/.test(baseline.runtime), 'iOS OTA is incompatible with the installed build or configuration.');
  for (const version of [target.sdkVersion, target.expoUpdatesVersion]) {
    assert(/^\d+\.\d+\.\d+$/.test(version), 'OTA requires exact SDK and locked Expo Updates versions.');
  }
  return { source: target.source, baseline: baseline.id, baselineReceipt: hash(baseline), nativeSource: baseline.source,
    nativeFingerprint: baseline.input, runtime: baseline.runtime, configuration: baseline.configuration,
    sdkVersion: target.sdkVersion, expoUpdatesVersion: target.expoUpdatesVersion };
}

/** Caller verifies the original receipt authority and native-source ancestry before packaging. */
export function createIosOtaArtifact({ inputDir, outputDir, publicConfig, environmentArtifact, target, baseline }) {
  const binding = bind(target, baseline), configuration = target.configuration;
  const environment = verifyEnvironmentArtifact({ artifactFile: environmentArtifact, sourceCommit: target.source,
    channel: configuration.channel, environment: configuration.environment, projectId: configuration.projectId });
  assert.equal(environment.values.EXPO_PUBLIC_CALIBRATE_SERVER_URL, configuration.serverUrl, 'iOS export endpoint changed.');
  assert(publicConfig.ios?.bundleIdentifier === 'app.calibratehealth.mobile' &&
    publicConfig.sdkVersion === target.sdkVersion &&
    (publicConfig.ios?.runtimeVersion ?? publicConfig.runtimeVersion) === baseline.runtime &&
    publicConfig.extra?.eas?.projectId === configuration.projectId &&
    publicConfig.updates?.url === `https://u.expo.dev/${configuration.projectId}` &&
    publicConfig.updates?.requestHeaders?.['expo-channel-name'] === configuration.channel, 'iOS public export configuration differs.');
  validateExpoExport(inputDir, 'ios');
  const files = listFiles(inputDir);
  assert(files.length > 0 && !fs.existsSync(outputDir), 'iOS OTA output must be fresh and nonempty.');
  const provenance = { schema: 1, kind: 'ios-ota-export', ...binding, files, bundleDigest: hash(files) };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.cpSync(inputDir, path.join(outputDir, 'bundle'), { recursive: true, dereference: false, errorOnExist: true });
  fs.writeFileSync(path.join(outputDir, 'provenance.json'), bytes(provenance), { flag: 'wx' });
  return provenance;
}

export function verifyIosOtaArtifact({ artifactRoot, target, baseline }) {
  const binding = bind(target, baseline);
  assert.deepEqual(fs.readdirSync(artifactRoot).sort(), ['bundle', 'provenance.json'], 'Unexpected iOS OTA artifact files.');
  const provenancePath = path.join(artifactRoot, 'provenance.json'), bundlePath = path.join(artifactRoot, 'bundle');
  assert(fs.lstatSync(provenancePath).isFile() && !fs.lstatSync(provenancePath).isSymbolicLink() &&
    fs.lstatSync(bundlePath).isDirectory() && !fs.lstatSync(bundlePath).isSymbolicLink(), 'iOS OTA root must contain regular files/directories.');
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  assert.equal(fs.readFileSync(provenancePath, 'utf8'), bytes(provenance).toString('utf8'), 'iOS OTA provenance bytes changed.');
  for (const [key, value] of Object.entries(binding)) assert.equal(provenance[key], value, 'iOS OTA provenance binding changed.');
  validateExpoExport(bundlePath, 'ios');
  const files = listFiles(bundlePath);
  assert.deepEqual(provenance, { schema: 1, kind: 'ios-ota-export', ...binding, files, bundleDigest: hash(files) }, 'iOS OTA bundle bytes changed.');
  return provenance;
}

/** An inert publisher has no source scripts, private account settings, environment loaders or automatic export. */
export function createIosOtaPublisher({ outputDir, artifactRoot, target, baseline }) {
  const provenance = verifyIosOtaArtifact({ artifactRoot, target, baseline });
  assert(!fs.existsSync(outputDir), 'A fresh publisher is required.');
  fs.mkdirSync(outputDir, { recursive: true });
  const json = (name, data) => fs.writeFileSync(path.join(outputDir, name), bytes(data), { flag: 'wx' });
  json('app.json', { expo: { name: 'Calibrate', slug: 'calibrate-health-app', runtimeVersion: baseline.runtime, sdkVersion: provenance.sdkVersion,
    ios: { bundleIdentifier: 'app.calibratehealth.mobile' }, extra: { eas: { projectId: target.configuration.projectId } },
    updates: { url: `https://u.expo.dev/${target.configuration.projectId}`, requestHeaders: { 'expo-channel-name': target.configuration.channel } } } });
  json('package.json', { name: '@calibrate/ios-ota-publisher', private: true, version: '0.0.0', dependencies: { 'expo-updates': provenance.expoUpdatesVersion } });
  json('eas.json', { cli: { version: '22.4.0' } });
  return { provenance, args: ['update', '--platform', 'ios', '--channel', target.configuration.channel,
    '--environment', target.configuration.environment, '--input-dir', path.resolve(artifactRoot, 'bundle'), '--skip-bundler',
    '--message', `calibrate:${target.source}:${hash(provenance)}`, '--non-interactive', '--json'] };
}
