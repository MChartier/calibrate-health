import fs from 'node:fs';
import path from 'node:path';
import { resolveLockedEasCliInvocation } from './native-ota-update.mjs';
import { createEnvironmentPublisherProject, createEnvironmentArtifact, verifyEnvironmentArtifact,
  createUpdateArtifact, createUpdatePublisherProject, verifyUpdateArtifact } from './expo-ota-artifact.mjs';
import { nativeRecordFile, verifyNativeRecord } from './local-release-native.mjs';
import { releaseEnvironment, required, readJson, writeJson, publicBuildEnvironment } from './local-release-context.mjs';

export async function publishLocalOta(context, { channel = 'internal', dryRun = false } = {}, options = {}) {
  const publicEnv = publicBuildEnvironment(context, channel);
  const projectId = publicEnv.EXPO_PUBLIC_EAS_PROJECT_ID;
  const serverUrl = publicEnv.EXPO_PUBLIC_CALIBRATE_SERVER_URL;
  const environment = channel === 'production' ? 'production' : 'preview';
  const recordFile = nativeRecordFile(context, channel);
  if (!fs.existsSync(recordFile)) throw new Error('No local build record for this runtime/channel. Build and install the selected native profile first.');
  const verify = options.verifyNativeRecord ?? verifyNativeRecord;
  const record = verify(context, readJson(recordFile), channel);
  const eas = resolveLockedEasCliInvocation(context.root, []);
  const expected = { nativeBuildRef: 'native-v' + record.baseline.runtime_version,
    sourceCommit: context.sourceCommit, projectId, channel, environment };
  if (dryRun) return { sourceCommit: context.sourceCommit, runtimeVersion: record.baseline.runtime_version,
    channel, environment, projectId, serverUrl, requiresServer: context.client.requiresServer, dryRun: true };

  const token = required(context.environment, 'EXPO_TOKEN');
  const directory = path.join(context.stateRoot, 'ota', context.sourceCommit + '-' + channel);
  fs.mkdirSync(directory, { recursive: true });
  const resultFile = path.join(directory, 'published.json');
  const pending = path.join(directory, 'publishing.json');
  if (fs.existsSync(resultFile)) {
    const result = readJson(resultFile);
    if (result.projectId !== projectId || result.serverUrl !== serverUrl) throw new Error('Recorded OTA publication belongs to another instance.');
    return { ...result, alreadyPublished: true };
  }
  if (fs.existsSync(pending)) throw new Error('OTA outcome is uncertain. Inspect Expo before removing ' + pending + ' to allow another publication.');
  const buildDir = fs.mkdtempSync(path.join(directory, 'export-'));
  const environmentFile = path.join(buildDir, 'eas.env');
  const environmentArtifact = path.join(buildDir, 'environment.json');
  const environmentProject = createEnvironmentPublisherProject({ outputDir: path.join(buildDir, 'environment-project'), projectId });
  const publishEnv = releaseEnvironment(context.environment, { EXPO_TOKEN: token, EAS_NO_VCS: '1', EAS_SKIP_AUTO_FINGERPRINT: '1' });
  try {
    context.run(eas.command, [...eas.args, 'env:pull', '--environment', environment, '--path', environmentFile, '--non-interactive'],
      { cwd: environmentProject, env: publishEnv, label: 'EAS environment resolution' });
    createEnvironmentArtifact({ environmentFile, outputFile: environmentArtifact, ...expected });
  } finally { fs.rmSync(environmentFile, { force: true }); }
  const resolved = verifyEnvironmentArtifact({ artifactFile: environmentArtifact, ...expected });
  if (resolved.values.EXPO_PUBLIC_CALIBRATE_SERVER_URL !== serverUrl) throw new Error('EAS environment server URL differs from the local configuration.');
  const sourceEnv = releaseEnvironment(context.environment, { ...resolved.values, NODE_ENV: 'production' });
  const expo = path.join(context.root, 'node_modules/expo/bin/cli');
  const publicConfigFile = path.join(buildDir, 'public-config.json');
  fs.writeFileSync(publicConfigFile, context.run(process.execPath, [expo, 'config', '--type', 'public', '--json'],
    { cwd: path.join(context.root, 'mobile'), env: sourceEnv, label: 'Expo configuration' }));
  const exportDir = path.join(buildDir, 'bundle');
  context.run(process.execPath, [expo, 'export', '--platform', 'android', '--output-dir', exportDir, '--dump-sourcemap', '--dump-assetmap'],
    { cwd: path.join(context.root, 'mobile'), env: sourceEnv, label: 'Android OTA export', stdio: 'inherit' });
  const artifactRoot = path.join(buildDir, 'artifact');
  createUpdateArtifact({ inputDir: exportDir, outputDir: artifactRoot, publicConfigFile,
    packageLockFile: path.join(context.root, 'package-lock.json'), environmentArtifactFile: environmentArtifact, ...expected });
  const { destination } = createUpdatePublisherProject({ outputDir: path.join(buildDir, 'publisher'), artifactRoot, ...expected });
  verifyUpdateArtifact({ artifactRoot, ...expected });
  verify(context, record, channel);
  writeJson(pending, { ...expected, serverUrl, artifactRoot });
  const output = context.run(eas.command, [...eas.args, 'update', '--skip-bundler', '--input-dir', path.join(artifactRoot, 'bundle'),
    '--channel', channel, '--message', 'Client ' + context.sourceCommit, '--environment', environment,
    '--platform', 'android', '--non-interactive', '--json'],
    { cwd: destination, env: publishEnv, label: 'Expo OTA publication' });
  const result = { ...expected, serverUrl, requiresServer: context.client.requiresServer, artifactRoot, updates: JSON.parse(output) };
  writeJson(resultFile, result);
  fs.unlinkSync(pending);
  return result;
}
