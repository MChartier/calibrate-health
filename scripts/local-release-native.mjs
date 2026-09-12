import fs from 'node:fs';
import path from 'node:path';
import { prepareNativeRelease, nextReleaseVersion, getNextNativeVersionCodes } from './release-config.mjs';
import { createNativePlayReleasePlan, verifyNativePlayArtifacts, createNativePlayArtifactReceipt,
  resolveGooglePlayAccessToken, createGooglePlayPublisher, uploadNativePlayInternal } from './native-play-release.mjs';
import { serializeNativePlayReceipt } from './native-play-receipt.mjs';
import { REQUIRED_SIGNING_ENV } from './native-release-build.mjs';
import { readNativeOtaBaseline, createNativeRuntimeFingerprint } from './native-ota-contract.mjs';
import { releaseEnvironment, required, readJson, writeJson, publicBuildEnvironment } from './local-release-context.mjs';

export function nativeRecordFile(context, channel) {
  return path.join(context.stateRoot, 'native', context.manifest.android.mobile.version_name + '-' + channel + '.json');
}

export async function prepareLocalNative(context, { bump, dryRun = false } = {}) {
  const current = context.manifest.android.mobile.version_name;
  const version = nextReleaseVersion(current, bump);
  const codes = getNextNativeVersionCodes(context.manifest);
  // Reject allocating from a stale checkout, without requiring a signed published baseline.
  context.git(['fetch', '--no-tags', 'origin', '+refs/heads/master:refs/remotes/origin/master']);
  const remote = JSON.parse(context.git(['show', 'refs/remotes/origin/master:shared/release.json']));
  if (Math.max(remote.android.mobile.version_code, remote.android.wear.version_code) >
      Math.max(context.manifest.android.mobile.version_code, context.manifest.android.wear.version_code)) {
    throw new Error('Native version codes are behind origin/master. Update this checkout before allocating another pair.');
  }
  if (!dryRun) {
    await prepareNativeRelease({ root: context.root, bump,
      verifyNativeReleaseTag: () => ({ latestTag: 'native-v' + current }) });
  }
  return { version, ...codes, dryRun };
}

export function verifyNativeRecord(context, record, channel) {
  const env = publicBuildEnvironment(context, channel);
  const baseline = record?.baseline;
  if (record?.schemaVersion !== 1 || record.repository !== context.repository ||
      !/^[0-9a-f]{40}$/.test(record.sourceCommit ?? '') ||
      baseline?.commit !== record.sourceCommit || baseline.platform !== 'android' ||
      baseline.runtime_version !== context.manifest.android.mobile.version_name ||
      baseline.project_id !== env.EXPO_PUBLIC_EAS_PROJECT_ID ||
      baseline.server_url !== env.EXPO_PUBLIC_CALIBRATE_SERVER_URL || baseline.channel !== channel ||
      !/^[0-9a-f]{64}$/.test(baseline.native_fingerprint_sha256 ?? '')) {
    throw new Error('Native build record does not match this app, runtime, channel, or server URL. Build the selected profile first.');
  }
  context.git(['merge-base', '--is-ancestor', record.sourceCommit, context.sourceCommit]);
  if (createNativeRuntimeFingerprint(context.root).sha256 !== baseline.native_fingerprint_sha256) {
    throw new Error('Native runtime inputs changed. Prepare and install a new native version before publishing OTA.');
  }
  return record;
}

function verifyRecordedArtifacts(context, record, options) {
  if (record.sourceCommit !== context.sourceCommit) throw new Error('This native version was already built from another commit. Prepare a new version.');
  const plan = createNativePlayReleasePlan({ root: context.root, sourceCommit: context.sourceCommit });
  const verification = (options.verifyArtifacts ?? verifyNativePlayArtifacts)({ root: context.root, plan, environment: context.safeEnv });
  const receipt = createNativePlayArtifactReceipt({ repository: context.repository, plan, verification });
  if (serializeNativePlayReceipt(receipt) !== serializeNativePlayReceipt(record.receipt) ||
      verification.signerSha256 !== record.signerSha256) throw new Error('Native artifacts changed after building. Restore the recorded artifacts or allocate a new version.');
  return { plan, verification };
}

export async function releaseLocalNative(context, { profile = 'internal', buildOnly = false, dryRun = false } = {}, options = {}) {
  const publicEnv = publicBuildEnvironment(context, profile);
  const plan = createNativePlayReleasePlan({ root: context.root, sourceCommit: context.sourceCommit });
  const upload = profile === 'production' && !buildOnly;
  const signer = required(context.environment, 'CALIBRATE_ANDROID_SIGNER_SHA256').replaceAll(':', '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(signer)) throw new Error('Expected Android upload certificate SHA-256 is invalid.');
  const signing = Object.fromEntries(REQUIRED_SIGNING_ENV.map(name => [name, required(context.environment, name)]));
  signing.CALIBRATE_ANDROID_SIGNING_STORE_FILE = path.resolve(signing.CALIBRATE_ANDROID_SIGNING_STORE_FILE);
  if (!fs.statSync(signing.CALIBRATE_ANDROID_SIGNING_STORE_FILE).isFile()) throw new Error('Android keystore must be a file.');
  const serviceAccountFile = upload ? path.resolve(required(context.environment, 'CALIBRATE_PLAY_SERVICE_ACCOUNT_FILE')) : null;
  if (serviceAccountFile && !fs.statSync(serviceAccountFile).isFile()) throw new Error('Play service account must be a file.');
  const file = nativeRecordFile(context, profile);
  let record = fs.existsSync(file) ? verifyNativeRecord(context, readJson(file), profile) : null;
  if (record && record.sourceCommit !== context.sourceCommit) throw new Error('This native version was already built. Prepare a new native version for different source.');
  if (dryRun) return { plan, profile, upload, reuseBuild: Boolean(record), requiresServer: context.client.requiresServer, dryRun: true };
  if (!record) {
    const script = path.join(context.root, 'scripts/native-release-build.mjs');
    const env = releaseEnvironment(context.environment, publicEnv);
    context.run(process.execPath, [script, 'prepare'], { cwd: context.root, env, label: 'native preparation', stdio: 'inherit' });
    context.run(process.execPath, [script, 'build-prepared'], { cwd: context.root, env: { ...env, ...signing }, label: 'phone and Wear build', stdio: 'inherit' });
    const verification = (options.verifyArtifacts ?? verifyNativePlayArtifacts)({ root: context.root, plan, environment: context.safeEnv });
    if (verification.signerSha256 !== signer) throw new Error('Built artifacts use a different Android signing certificate.');
    const { baseline } = readNativeOtaBaseline(context.root);
    record = { schemaVersion: 1, repository: context.repository, sourceCommit: context.sourceCommit,
      requiresServer: context.client.requiresServer, baseline, signerSha256: signer,
      receipt: createNativePlayArtifactReceipt({ repository: context.repository, plan, verification }) };
    verifyNativeRecord(context, record, profile);
    writeJson(file, record);
  }
  if (record.signerSha256 !== signer) throw new Error('Configured Android signing certificate differs from the recorded build.');
  const { verification } = verifyRecordedArtifacts(context, record, options);
  if (upload) {
    const accessToken = await (options.resolveAccessToken ?? resolveGooglePlayAccessToken)({ environment: {}, serviceAccountFile });
    const publisher = options.publisher ?? createGooglePlayPublisher({ applicationId: plan.applicationId, accessToken, fetchImpl: fetch });
    const result = await uploadNativePlayInternal({ root: context.root, plan, verification, publisher,
      repository: context.repository, receipt: record.receipt });
    writeJson(file, { ...record, playInternal: result });
  }
  return { plan, profile, uploadedToPlayInternal: upload, recordFile: file };
}
