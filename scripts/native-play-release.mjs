import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  NATIVE_RELEASE_BUILD_PROVENANCE_PATH,
  readNativeReleaseBuildProvenance
} from './native-release-build.mjs';
import {
  NATIVE_RELEASE_APPLICATION_ID,
  NATIVE_RELEASE_ARTIFACT_CONTRACTS,
  parseKeytoolSignerFingerprint
} from './native-release-evidence.mjs';
import {
  parseAabManifestMetadata,
  parseApkBadging,
  parseSignerFingerprint,
  resolveNativeReleaseDeviceTooling
} from './native-release-devices.mjs';
import { GOOGLE_PLAY_MAX_VERSION_CODE } from './release-config.mjs';
import {
  createNativePlayReceiptFromPlan,
  nativePlayReceiptSha256,
  NATIVE_PLAY_RECEIPT_PATH,
  readNativePlayReceipt,
  serializeNativePlayReceipt,
  verifyNativePlayReceiptFile
} from './native-play-receipt.mjs';

export { GOOGLE_PLAY_MAX_VERSION_CODE } from './release-config.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const ANDROID_PUBLISHER_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const ANDROID_PUBLISHER_UPLOAD_ROOT = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const NATIVE_PLAY_APPLICATION_ID = NATIVE_RELEASE_APPLICATION_ID;
// Google Play's Publisher API names its built-in internal-test track `qa`; form-factor tracks prefix that alias.
export const NATIVE_PLAY_TRACKS = Object.freeze({
  internal: Object.freeze({ phone: 'qa', watch: 'wear:qa' }),
  closed: Object.freeze({ phone: 'closed', watch: 'wear:closed' }),
  production: Object.freeze({ phone: 'production', watch: 'wear:production' })
});

const PLAY_AAB_CONTRACTS = Object.freeze({
  phone: NATIVE_RELEASE_ARTIFACT_CONTRACTS.find(({ id }) => id === 'phone-aab'),
  watch: NATIVE_RELEASE_ARTIFACT_CONTRACTS.find(({ id }) => id === 'watch-aab')
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function roleManifestKey(role) {
  return role === 'phone' ? 'mobile' : 'wear';
}

function expectedVersion(manifest, role) {
  const version = manifest?.android?.[roleManifestKey(role)];
  return {
    versionName: version?.version_name,
    versionCode: version?.version_code
  };
}

function readReleaseManifest(root) {
  const file = path.join(root, 'shared', 'release.json');
  let content;
  let manifest;
  try {
    content = fs.readFileSync(file);
    manifest = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error('shared/release.json is missing or invalid JSON.');
  }
  return { content, manifest };
}

function releaseSourceMarker(role, sourceCommit) {
  return `${role === 'phone' ? 'cal-p' : 'cal-w'}@${sourceCommit}`;
}

export function createNativePlayReleasePlan(options = {}) {
  const root = options.root ?? repositoryRoot;
  const sourceCommit = options.sourceCommit;
  if (!COMMIT_PATTERN.test(sourceCommit ?? '')) {
    throw new Error('Native Play release requires a lowercase 40-character --source-commit.');
  }

  const { manifest } = readReleaseManifest(root);
  if (manifest?.android?.application_id !== NATIVE_PLAY_APPLICATION_ID) {
    throw new Error(`shared/release.json application_id must be ${NATIVE_PLAY_APPLICATION_ID}.`);
  }

  const candidates = {};
  for (const role of ['phone', 'watch']) {
    const version = expectedVersion(manifest, role);
    if (!STABLE_VERSION_PATTERN.test(version.versionName ?? '')) {
      throw new Error(`shared/release.json ${role} version_name must be a stable x.y.z version.`);
    }
    if (!Number.isSafeInteger(version.versionCode) || version.versionCode < 1) {
      throw new Error(`shared/release.json ${role} version_code must be a positive integer.`);
    }
    if (version.versionCode > GOOGLE_PLAY_MAX_VERSION_CODE) {
      throw new Error(
        `shared/release.json ${role} version_code must not exceed Google Play's ` +
        `${GOOGLE_PLAY_MAX_VERSION_CODE} maximum.`
      );
    }
    const contract = PLAY_AAB_CONTRACTS[role];
    if (!contract) throw new Error(`Native release artifact contract is missing ${role}-aab.`);
    candidates[role] = {
      role,
      artifactId: contract.id,
      artifactPath: contract.path,
      versionName: version.versionName,
      versionCode: version.versionCode,
      internalTrack: NATIVE_PLAY_TRACKS.internal[role],
      closedTrack: NATIVE_PLAY_TRACKS.closed[role],
      productionTrack: NATIVE_PLAY_TRACKS.production[role]
    };
  }

  if (candidates.phone.versionName !== candidates.watch.versionName) {
    throw new Error('Phone and Wear must use one paired native version_name for a Play release.');
  }
  const expectedNativeReleaseTag = `native-v${candidates.phone.versionName}`;
  if (manifest?.android?.mobile?.native_release_tag !== expectedNativeReleaseTag) {
    throw new Error(
      `shared/release.json android.mobile.native_release_tag must be ${expectedNativeReleaseTag} ` +
      'for the paired native version.'
    );
  }
  if (candidates.phone.versionCode === candidates.watch.versionCode) {
    throw new Error('Phone and Wear Play artifacts must use distinct version codes in their shared application ID.');
  }
  if (candidates.phone.versionCode % 2 !== 1 || candidates.watch.versionCode % 2 !== 0) {
    throw new Error('Phone version codes must be odd and Wear version codes must be even.');
  }

  for (const candidate of Object.values(candidates)) {
    candidate.releaseName = releaseSourceMarker(candidate.role, sourceCommit);
  }

  return {
    sourceCommit,
    applicationId: NATIVE_PLAY_APPLICATION_ID,
    versionName: candidates.phone.versionName,
    candidates
  };
}

export function assertNativePlaySourceCheckout(root, sourceCommit, execute = execFileSync) {
  if (!COMMIT_PATTERN.test(sourceCommit ?? '')) {
    throw new Error('Native Play release requires a lowercase 40-character --source-commit.');
  }
  const environment = artifactInspectionEnvironment(process.env);
  let head;
  try {
    head = execute('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: environment
    }).toString().trim();
  } catch {
    throw new Error('Native Play release requires a Git checkout at the requested source commit.');
  }
  if (head !== sourceCommit) {
    throw new Error(`Native Play release source commit does not match checked-out HEAD (${head || 'unknown'}).`);
  }
  let trackedStatus;
  try {
    trackedStatus = execute('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: environment
    }).toString().trim();
  } catch {
    throw new Error('Native Play release could not verify the tracked source checkout.');
  }
  if (trackedStatus) {
    throw new Error('Native Play release requires tracked files to match the requested source commit.');
  }
  return head;
}

function artifactInspectionEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment ?? {}).filter(([name]) => {
    const normalized = name.toUpperCase();
    return !normalized.startsWith('GOOGLE_PLAY_') && normalized !== 'GOOGLE_APPLICATION_CREDENTIALS';
  }));
}

function runArtifactInspection(execute, command, args, errorMessage, environment) {
  try {
    return execute(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      env: environment
    }).toString();
  } catch {
    throw new Error(errorMessage);
  }
}

export function inspectNativePlayArtifact(file, contract, options = {}) {
  const execute = options.execute ?? execFileSync;
  const environment = artifactInspectionEnvironment(options.environment ?? process.env);
  const tooling = options.tooling ?? resolveNativeReleaseDeviceTooling(environment);
  if (contract?.format === 'apk') {
    const badging = runArtifactInspection(
      execute,
      tooling.aapt,
      ['dump', 'badging', file],
      `Unable to inspect ${contract.id} package metadata with aapt.`,
      environment
    );
    const signing = runArtifactInspection(
      execute,
      tooling.java,
      ['-jar', tooling.apksignerJar, 'verify', '--print-certs', file],
      `Unable to inspect ${contract.id} signing certificate with apksigner.`,
      environment
    );
    return {
      ...parseApkBadging(badging),
      signerSha256: parseSignerFingerprint(signing)
    };
  }
  if (contract?.format === 'aab') {
    if (!tooling.bundletoolJar) {
      throw new Error(
        'BUNDLETOOL_JAR must point to the official bundletool all-in-one JAR for AAB metadata inspection.'
      );
    }
    const manifest = runArtifactInspection(
      execute,
      tooling.java,
      ['-jar', tooling.bundletoolJar, 'dump', 'manifest', `--bundle=${file}`],
      `Unable to inspect ${contract.id} manifest metadata with bundletool.`,
      environment
    );
    const signing = runArtifactInspection(
      execute,
      tooling.keytool,
      ['-J-Duser.language=en', '-J-Duser.country=US', '-printcert', '-jarfile', file],
      `Unable to inspect ${contract.id} signing certificate with keytool.`,
      environment
    );
    return {
      ...parseAabManifestMetadata(manifest),
      signerSha256: parseKeytoolSignerFingerprint(signing)
    };
  }
  throw new Error(`Unsupported native release artifact format: ${contract?.format ?? '(missing)'}.`);
}

export function verifyNativePlayArtifacts(options = {}) {
  const root = options.root ?? repositoryRoot;
  const plan = options.plan ?? createNativePlayReleasePlan({ root, sourceCommit: options.sourceCommit });
  const { content: manifestContent, manifest } = readReleaseManifest(root);
  let tooling = options.tooling;
  const artifactInspector = options.artifactInspector ?? ((file, contract) => {
    tooling ??= resolveNativeReleaseDeviceTooling(options.environment ?? process.env);
    return inspectNativePlayArtifact(file, contract, {
      execute: options.execute,
      tooling,
      environment: options.environment ?? process.env
    });
  });
  const inspectedArtifacts = NATIVE_RELEASE_ARTIFACT_CONTRACTS.map((contract) => {
    const file = path.resolve(root, contract.path);
    let stat;
    let bytes;
    try {
      stat = fs.statSync(file);
      bytes = fs.readFileSync(file);
    } catch {
      throw new Error(`${contract.id} release artifact is missing at ${contract.path}.`);
    }
    if (!stat.isFile() || stat.size < 1) {
      throw new Error(`${contract.id} release artifact must be a non-empty file at ${contract.path}.`);
    }
    let inspection;
    try {
      inspection = artifactInspector(file, contract);
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(`Unable to inspect ${contract.id} release artifact.`);
    }
    if (inspection?.applicationId !== NATIVE_PLAY_APPLICATION_ID) {
      throw new Error(`${contract.id} application ID must be ${NATIVE_PLAY_APPLICATION_ID}.`);
    }
    const expected = expectedVersion(manifest, contract.role);
    if (
      inspection?.versionName !== expected.versionName ||
      inspection?.versionCode !== expected.versionCode
    ) {
      throw new Error(`${contract.id} version does not match shared/release.json.`);
    }
    const signerSha256 = inspection?.signerSha256?.replaceAll(':', '').toLowerCase();
    if (!SHA256_PATTERN.test(signerSha256 ?? '')) {
      throw new Error(`${contract.id} signing certificate SHA-256 is invalid.`);
    }
    return {
      ...contract,
      sizeBytes: stat.size,
      sha256: sha256(bytes),
      applicationId: inspection.applicationId,
      versionName: inspection.versionName,
      versionCode: inspection.versionCode,
      signerSha256
    };
  });

  const provenance = readNativeReleaseBuildProvenance(root, {
    candidateCommit: plan.sourceCommit,
    manifestContent,
    artifacts: inspectedArtifacts
  });

  const signers = new Set(inspectedArtifacts.map(({ signerSha256 }) => signerSha256));
  if (signers.size !== 1) {
    throw new Error('Phone and Wear APK/AAB artifacts must share one signing certificate.');
  }

  return {
    sourceCommit: plan.sourceCommit,
    applicationId: plan.applicationId,
    releaseManifestSha256: sha256(manifestContent),
    buildProvenancePath: NATIVE_RELEASE_BUILD_PROVENANCE_PATH,
    signerSha256: inspectedArtifacts[0].signerSha256,
    artifacts: inspectedArtifacts
  };
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

export function createGoogleServiceAccountAssertion(credentials, options = {}) {
  if (!isNonEmptyString(credentials?.client_email) || !isNonEmptyString(credentials?.private_key)) {
    throw new Error('Google Play service-account JSON must contain client_email and private_key.');
  }
  const tokenUri = credentials.token_uri?.trim() || GOOGLE_OAUTH_TOKEN_URL;
  if (tokenUri !== GOOGLE_OAUTH_TOKEN_URL) {
    throw new Error(`Google Play service-account token_uri must be ${GOOGLE_OAUTH_TOKEN_URL}.`);
  }
  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email.trim(),
    scope: ANDROID_PUBLISHER_SCOPE,
    aud: tokenUri,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  }));
  const signingInput = `${header}.${claims}`;
  let signature;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), credentials.private_key).toString('base64url');
  } catch {
    throw new Error('Google Play service-account private_key is not a valid RSA signing key.');
  }
  return { assertion: `${signingInput}.${signature}`, tokenUri };
}

function safeGoogleMessage(payload) {
  const candidate = payload?.error?.message ?? payload?.error_description ??
    (typeof payload?.error === 'string' ? payload.error : null);
  if (!isNonEmptyString(candidate)) return null;
  return candidate
    .replace(/-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, '[redacted key]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, '[redacted token]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

async function responsePayload(response) {
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return { error: { message: 'Google returned a non-JSON response.' } };
  }
}

async function checkedGoogleResponse(response, operation) {
  const payload = await responsePayload(response);
  if (response.ok) return payload;
  const detail = safeGoogleMessage(payload);
  throw new Error(
    `${operation} failed with Google HTTP ${response.status}${detail ? `: ${detail}` : '.'}`
  );
}

export async function resolveGooglePlayAccessToken(options = {}) {
  const environment = options.environment ?? process.env;
  const serviceAccountFile = options.serviceAccountFile ?? environment.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE;
  if (isNonEmptyString(serviceAccountFile)) {
    let credentials;
    try {
      credentials = JSON.parse(fs.readFileSync(path.resolve(serviceAccountFile.trim()), 'utf8'));
    } catch {
      throw new Error('Google Play service-account file is missing or invalid JSON.');
    }
    const { assertion, tokenUri } = createGoogleServiceAccountAssertion(credentials, { now: options.now });
    const form = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    });
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const response = await fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const payload = await checkedGoogleResponse(response, 'Google OAuth token exchange');
    if (!isNonEmptyString(payload?.access_token)) {
      throw new Error('Google OAuth token exchange returned no access_token.');
    }
    return payload.access_token;
  }

  const suppliedToken = environment.GOOGLE_PLAY_ACCESS_TOKEN?.trim();
  if (suppliedToken) return suppliedToken;
  throw new Error(
    'Google Play credentials are missing. Pass --service-account-file FILE or set GOOGLE_PLAY_ACCESS_TOKEN.'
  );
}

function editRoot(applicationId, upload = false) {
  const apiRoot = upload ? ANDROID_PUBLISHER_UPLOAD_ROOT : ANDROID_PUBLISHER_ROOT;
  return `${apiRoot}/applications/${encodeURIComponent(applicationId)}/edits`;
}

export function createGooglePlayPublisher(options) {
  const applicationId = options?.applicationId;
  const accessToken = options?.accessToken;
  if (applicationId !== NATIVE_PLAY_APPLICATION_ID) {
    throw new Error(`Google Play publisher applicationId must be ${NATIVE_PLAY_APPLICATION_ID}.`);
  }
  if (!isNonEmptyString(accessToken)) throw new Error('Google Play publisher requires an access token.');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const request = async (url, init, operation) => {
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {})
      }
    });
    return checkedGoogleResponse(response, operation);
  };

  return Object.freeze({
    async createEdit() {
      const payload = await request(editRoot(applicationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }, 'Create Google Play edit');
      if (!isNonEmptyString(payload?.id)) throw new Error('Create Google Play edit returned no edit ID.');
      return payload.id;
    },

    async deleteEdit(editId) {
      await request(`${editRoot(applicationId)}/${encodeURIComponent(editId)}`, {
        method: 'DELETE'
      }, 'Delete Google Play edit');
    },

    async getTrack(editId, track) {
      return request(
        `${editRoot(applicationId)}/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`,
        { method: 'GET' },
        `Read Google Play track ${track}`
      );
    },

    async listBundles(editId) {
      return request(
        `${editRoot(applicationId)}/${encodeURIComponent(editId)}/bundles`,
        { method: 'GET' },
        'List Google Play bundles'
      );
    },

    async uploadBundle(editId, file) {
      let bytes;
      try {
        bytes = fs.readFileSync(file);
      } catch {
        throw new Error('Google Play bundle upload source is missing.');
      }
      return request(
        `${editRoot(applicationId, true)}/${encodeURIComponent(editId)}/bundles?uploadType=media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: bytes
        },
        'Upload Android App Bundle'
      );
    },

    async updateTrack(editId, track, release) {
      return request(
        `${editRoot(applicationId)}/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ track, releases: [release] })
        },
        `Update Google Play track ${track}`
      );
    },

    async commitEdit(editId) {
      return request(
        `${editRoot(applicationId)}/${encodeURIComponent(editId)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
        { method: 'POST' },
        'Commit Google Play edit'
      );
    }
  });
}

function trackReleases(track) {
  return Array.isArray(track?.releases) ? track.releases : [];
}

function releaseVersionCodes(release) {
  return Array.isArray(release?.versionCodes)
    ? release.versionCodes.map((value) => String(value))
    : [];
}

function releasesWithCode(track, versionCode) {
  const wanted = String(versionCode);
  return trackReleases(track).filter((release) => releaseVersionCodes(release).includes(wanted));
}

function assertExactCompletedCandidate(track, candidate, label) {
  const matches = releasesWithCode(track, candidate.versionCode);
  const exact = matches.filter((release) =>
    release.status === 'completed' &&
    release.name === candidate.releaseName &&
    releaseVersionCodes(release).length === 1);
  if (matches.length !== 1 || exact.length !== 1) {
    throw new Error(
      `${label} must contain exactly one completed release for version code ${candidate.versionCode} ` +
      `with source marker ${candidate.releaseName}.`
    );
  }
}

function exactCompletedCandidateExists(track, candidate, label) {
  if (releasesWithCode(track, candidate.versionCode).length === 0) return false;
  assertExactCompletedCandidate(track, candidate, label);
  return true;
}

function assertNoConflictingCandidateCode(track, candidate, label) {
  const conflicts = releasesWithCode(track, candidate.versionCode)
    .filter(({ name }) => name !== candidate.releaseName);
  if (conflicts.length > 0) {
    throw new Error(
      `${label} version code ${candidate.versionCode} belongs to a different source release; ` +
      `expected ${candidate.releaseName}.`
    );
  }
}

function assertDestinationReleasesCompleted(track, label) {
  const unsettled = trackReleases(track).filter(({ status }) => status !== 'completed');
  if (unsettled.length > 0) {
    throw new Error(
      `${label} contains a release whose status is not completed; finish or remove it before this operation.`
    );
  }
}

function assertCandidateIsNewer(track, candidate, label) {
  const existing = trackReleases(track)
    .flatMap(releaseVersionCodes)
    .map(Number)
    .filter((value) => Number.isSafeInteger(value));
  if (existing.length > 0 && candidate.versionCode <= Math.max(...existing)) {
    throw new Error(
      `${label} candidate version code ${candidate.versionCode} must be greater than existing code ${Math.max(...existing)}.`
    );
  }
}

function completedRelease(candidate) {
  return {
    name: candidate.releaseName,
    versionCodes: [String(candidate.versionCode)],
    status: 'completed'
  };
}

async function abandonEdit(publisher, editId) {
  try {
    await publisher.deleteEdit(editId);
  } catch {
    // The original failure is more actionable than cleanup of an uncommitted edit.
  }
}

async function runAtomicEdit(publisher, operation) {
  const editId = await publisher.createEdit();
  let closed = false;
  try {
    const result = await operation(editId);
    if (result?.alreadyComplete) {
      await abandonEdit(publisher, editId);
      closed = true;
      return result;
    }
    await publisher.commitEdit(editId);
    closed = true;
    return result;
  } catch (error) {
    if (!closed) await abandonEdit(publisher, editId);
    throw error;
  }
}

function existingBundleReceipts(payload, plan) {
  const bundles = Array.isArray(payload?.bundles) ? payload.bundles : [];
  const receipts = {};
  for (const role of ['phone', 'watch']) {
    const candidate = plan.candidates[role];
    const matches = bundles.filter(({ versionCode }) => Number(versionCode) === candidate.versionCode);
    if (matches.length !== 1) {
      throw new Error(
        `Google Play must contain exactly one existing ${role} bundle for version code ` +
        `${candidate.versionCode}; found ${matches.length}.`
      );
    }
    const reportedSha256 = typeof matches[0]?.sha256 === 'string'
      ? matches[0].sha256.trim().toLowerCase()
      : null;
    if (!SHA256_PATTERN.test(reportedSha256 ?? '')) {
      throw new Error(
        `Google Play existing ${role} bundle for version code ${candidate.versionCode} ` +
        'must report a valid SHA-256.'
      );
    }
    receipts[role] = {
      versionCode: candidate.versionCode,
      track: candidate.internalTrack,
      sha256: reportedSha256
    };
  }
  return receipts;
}

function verifiedNativePlayAabs(plan, verification) {
  return Object.fromEntries(['phone', 'watch'].map((role) => {
    const candidate = plan.candidates[role];
    const matches = verification?.artifacts?.filter((artifact) =>
      artifact.id === candidate.artifactId && artifact.path === candidate.artifactPath) ?? [];
    if (matches.length !== 1 || !SHA256_PATTERN.test(matches[0]?.sha256 ?? '')) {
      throw new Error(`Native artifact verification is missing the exact ${role} AAB SHA-256.`);
    }
    return [role, matches[0]];
  }));
}

export function createNativePlayArtifactReceipt({ repository, plan, verification }) {
  if (verification?.sourceCommit !== plan?.sourceCommit || verification?.applicationId !== plan?.applicationId) {
    throw new Error('Native artifact verification does not match the requested Play release.');
  }
  return createNativePlayReceiptFromPlan({
    repository,
    plan,
    releases: verifiedNativePlayAabs(plan, verification)
  });
}

export function writeNativePlayArtifactReceipt({ root = repositoryRoot, receiptFile, repository, plan, verification }) {
  const receipt = createNativePlayArtifactReceipt({ repository, plan, verification });
  const relativeOrAbsolute = receiptFile ?? NATIVE_PLAY_RECEIPT_PATH;
  const file = path.resolve(root, relativeOrAbsolute);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = serializeNativePlayReceipt(receipt);
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  return Object.freeze({ receipt, file, sha256: nativePlayReceiptSha256(bytes) });
}

function assertExistingBundleDigests(payload, plan, verifiedAabs) {
  const receipts = existingBundleReceipts(payload, plan);
  for (const role of ['phone', 'watch']) {
    const reportedSha256 = receipts[role].sha256;
    if (reportedSha256 !== verifiedAabs[role].sha256) {
      throw new Error(
        `Google Play existing ${role} bundle SHA-256 ${reportedSha256 ?? 'unknown'}; ` +
        `expected ${verifiedAabs[role].sha256}.`
      );
    }
  }
}

export async function uploadNativePlayInternal(options) {
  const { plan, verification, publisher, repository, receipt } = options;
  const root = options.root ?? repositoryRoot;
  if (verification?.sourceCommit !== plan?.sourceCommit || verification?.applicationId !== plan?.applicationId) {
    throw new Error('Native artifact verification does not match the requested Play release.');
  }
  const verifiedAabs = verifiedNativePlayAabs(plan, verification);
  const expectedReceipt = createNativePlayArtifactReceipt({ repository, plan, verification });
  if (!receipt || serializeNativePlayReceipt(receipt) !== serializeNativePlayReceipt(expectedReceipt)) {
    throw new Error('Native Play upload requires the exact independently attested artifact receipt.');
  }

  return runAtomicEdit(publisher, async (editId) => {
    const phoneTrack = await publisher.getTrack(editId, plan.candidates.phone.internalTrack);
    const watchTrack = await publisher.getTrack(editId, plan.candidates.watch.internalTrack);
    assertDestinationReleasesCompleted(phoneTrack, 'Phone internal track');
    assertDestinationReleasesCompleted(watchTrack, 'Wear internal track');

    assertNoConflictingCandidateCode(phoneTrack, plan.candidates.phone, 'Phone internal track');
    assertNoConflictingCandidateCode(watchTrack, plan.candidates.watch, 'Wear internal track');
    const phoneComplete = exactCompletedCandidateExists(
      phoneTrack,
      plan.candidates.phone,
      'Phone internal track'
    );
    const watchComplete = exactCompletedCandidateExists(
      watchTrack,
      plan.candidates.watch,
      'Wear internal track'
    );
    if (phoneComplete && watchComplete) {
      const existingBundles = await publisher.listBundles(editId);
      assertExistingBundleDigests(existingBundles, plan, verifiedAabs);
      return { alreadyComplete: true, editId: null, tracks: NATIVE_PLAY_TRACKS.internal };
    }
    if (phoneComplete || watchComplete) {
      throw new Error('Internal Play tracks contain only one half of the paired native release.');
    }
    assertCandidateIsNewer(phoneTrack, plan.candidates.phone, 'Phone internal track');
    assertCandidateIsNewer(watchTrack, plan.candidates.watch, 'Wear internal track');

    for (const role of ['phone', 'watch']) {
      const candidate = plan.candidates[role];
      const uploaded = await publisher.uploadBundle(editId, path.resolve(root, candidate.artifactPath));
      if (Number(uploaded?.versionCode) !== candidate.versionCode) {
        throw new Error(
          `Google Play reported ${role} bundle version code ${uploaded?.versionCode ?? 'unknown'}; ` +
          `expected ${candidate.versionCode}.`
        );
      }
      const uploadedSha256 = uploaded?.sha256?.toLowerCase();
      if (uploadedSha256 !== verifiedAabs[role].sha256) {
        throw new Error(
          `Google Play reported ${role} bundle SHA-256 ${uploadedSha256 ?? 'unknown'}; ` +
          `expected ${verifiedAabs[role].sha256}.`
        );
      }
    }
    await publisher.updateTrack(
      editId,
      plan.candidates.phone.internalTrack,
      completedRelease(plan.candidates.phone)
    );
    await publisher.updateTrack(
      editId,
      plan.candidates.watch.internalTrack,
      completedRelease(plan.candidates.watch)
    );
    return { alreadyComplete: false, editId, tracks: NATIVE_PLAY_TRACKS.internal };
  });
}

function candidateTrack(candidate, stage) {
  return candidate[`${stage}Track`];
}

function stageTrackLabel(role, stage) {
  return `${role === 'phone' ? 'Phone' : 'Wear'} ${stage} track`;
}

async function promoteNativePlayStage(options, sourceStage, destinationStage) {
  const { plan, publisher } = options;
  return runAtomicEdit(publisher, async (editId) => {
    const sources = {};
    const destinations = {};
    for (const role of ['phone', 'watch']) {
      const candidate = plan.candidates[role];
      sources[role] = await publisher.getTrack(editId, candidateTrack(candidate, sourceStage));
      assertExactCompletedCandidate(sources[role], candidate, stageTrackLabel(role, sourceStage));
    }
    for (const role of ['phone', 'watch']) {
      const candidate = plan.candidates[role];
      const label = stageTrackLabel(role, destinationStage);
      destinations[role] = await publisher.getTrack(editId, candidateTrack(candidate, destinationStage));
      assertDestinationReleasesCompleted(destinations[role], label);
      assertNoConflictingCandidateCode(destinations[role], candidate, label);
    }

    const phoneComplete = exactCompletedCandidateExists(
      destinations.phone,
      plan.candidates.phone,
      stageTrackLabel('phone', destinationStage)
    );
    const watchComplete = exactCompletedCandidateExists(
      destinations.watch,
      plan.candidates.watch,
      stageTrackLabel('watch', destinationStage)
    );
    if (phoneComplete && watchComplete) {
      return { alreadyComplete: true, editId: null, tracks: NATIVE_PLAY_TRACKS[destinationStage] };
    }
    if (phoneComplete || watchComplete) {
      const stageName = destinationStage[0].toUpperCase() + destinationStage.slice(1);
      throw new Error(`${stageName} Play tracks contain only one half of the paired native release.`);
    }
    for (const role of ['phone', 'watch']) {
      const candidate = plan.candidates[role];
      assertCandidateIsNewer(destinations[role], candidate, stageTrackLabel(role, destinationStage));
      await publisher.updateTrack(
        editId,
        candidateTrack(candidate, destinationStage),
        completedRelease(candidate)
      );
    }
    return { alreadyComplete: false, editId, tracks: NATIVE_PLAY_TRACKS[destinationStage] };
  });
}

export function promoteNativePlayClosed(options) {
  return promoteNativePlayStage(options, 'internal', 'closed');
}

export function promoteNativePlayProduction(options) {
  return promoteNativePlayStage(options, 'closed', 'production');
}

export async function recoverNativePlayInternal(options) {
  const { plan, publisher, repository } = options;
  const editId = await publisher.createEdit();
  try {
    for (const role of ['phone', 'watch']) {
      const candidate = plan.candidates[role];
      const label = stageTrackLabel(role, 'internal');
      const track = await publisher.getTrack(editId, candidate.internalTrack);
      assertExactCompletedCandidate(track, candidate, label);
    }
    const releases = existingBundleReceipts(await publisher.listBundles(editId), plan);
    return createNativePlayReceiptFromPlan({ repository, plan, releases });
  } finally {
    await abandonEdit(publisher, editId);
  }
}

function parseArguments(argv) {
  const command = argv[0];
  const credentialedCommands = new Set([
    'upload-internal',
    'recover-internal',
    'promote-closed',
    'promote-production'
  ]);
  const supported = new Set([
    'plan',
    'verify-artifacts',
    'create-receipt',
    'verify-receipt',
    'upload-internal',
    'recover-internal',
    'promote-closed',
    'promote-production'
  ]);
  if (!supported.has(command)) {
    throw new Error(
      'Usage: node scripts/native-play-release.mjs ' +
      '<plan|verify-artifacts|create-receipt|verify-receipt|upload-internal|recover-internal|promote-closed|promote-production> ' +
      '--source-commit SHA ' +
      '[--repository-root ROOT] [--repository OWNER/REPO] [--receipt-file FILE] [--service-account-file FILE]'
    );
  }
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      ![
        '--source-commit', '--repository-root', '--repository', '--receipt-file', '--service-account-file'
      ].includes(name) ||
      !isNonEmptyString(value)
    ) {
      throw new Error(`Unknown or incomplete native Play release option: ${name ?? '(missing)'}.`);
    }
    if (values[name] !== undefined) throw new Error(`Duplicate native Play release option: ${name}.`);
    values[name] = value;
  }
  if (!isNonEmptyString(values['--source-commit'])) {
    throw new Error('Native Play release requires --source-commit SHA.');
  }
  if (credentialedCommands.has(command) && !isNonEmptyString(values['--repository-root'])) {
    throw new Error(`${command} requires --repository-root ROOT.`);
  }
  const receiptCommands = new Set(['create-receipt', 'verify-receipt', 'upload-internal', 'recover-internal']);
  if (receiptCommands.has(command)) {
    if (!isNonEmptyString(values['--repository'])) throw new Error(`${command} requires --repository OWNER/REPO.`);
    if (!isNonEmptyString(values['--receipt-file'])) throw new Error(`${command} requires --receipt-file FILE.`);
  } else if (values['--repository'] || values['--receipt-file']) {
    throw new Error(`${command} does not accept --repository or --receipt-file.`);
  }
  if (['plan', 'verify-artifacts', 'create-receipt', 'verify-receipt'].includes(command) && values['--service-account-file']) {
    throw new Error(`${command} does not accept --service-account-file.`);
  }
  return {
    command,
    sourceCommit: values['--source-commit'],
    repositoryRoot: values['--repository-root'],
    repository: values['--repository'],
    receiptFile: values['--receipt-file'],
    serviceAccountFile: values['--service-account-file']
  };
}

export async function runNativePlayReleaseCli(argv, options = {}) {
  const parsed = parseArguments(argv);
  const root = path.resolve(parsed.repositoryRoot?.trim() ?? options.root ?? repositoryRoot);
  assertNativePlaySourceCheckout(root, parsed.sourceCommit, options.execute ?? execFileSync);
  const plan = createNativePlayReleasePlan({ root, sourceCommit: parsed.sourceCommit });
  if (parsed.command === 'plan') return plan;

  if (['verify-artifacts', 'create-receipt', 'verify-receipt'].includes(parsed.command)) {
    const verification = verifyNativePlayArtifacts({
      root,
      plan,
      artifactInspector: options.artifactInspector,
      execute: options.artifactExecute,
      tooling: options.tooling,
      environment: options.environment
    });
    if (parsed.command === 'verify-artifacts') return verification;
    const receiptFile = path.resolve(root, parsed.receiptFile);
    const expectedReceipt = createNativePlayArtifactReceipt({
      repository: parsed.repository,
      plan,
      verification
    });
    if (parsed.command === 'verify-receipt') {
      return verifyNativePlayReceiptFile(receiptFile, expectedReceipt);
    }
    return writeNativePlayArtifactReceipt({
      root,
      receiptFile,
      repository: parsed.repository,
      plan,
      verification
    });
  }

  let verification;
  let admittedReceipt;
  if (parsed.command === 'upload-internal') {
    verification = verifyNativePlayArtifacts({
      root,
      plan,
      artifactInspector: options.artifactInspector,
      execute: options.artifactExecute,
      tooling: options.tooling,
      environment: options.environment
    });
    const expectedReceipt = createNativePlayArtifactReceipt({
      repository: parsed.repository,
      plan,
      verification
    });
    const receiptPath = path.resolve(root, parsed.receiptFile);
    verifyNativePlayReceiptFile(receiptPath, expectedReceipt);
    admittedReceipt = readNativePlayReceipt(receiptPath);
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const accessToken = await resolveGooglePlayAccessToken({
    environment: options.environment ?? process.env,
    serviceAccountFile: parsed.serviceAccountFile,
    fetchImpl,
    now: options.now
  });
  const publisher = options.publisher ?? createGooglePlayPublisher({
    applicationId: plan.applicationId,
    accessToken,
    fetchImpl
  });
  if (parsed.command === 'upload-internal') {
    return uploadNativePlayInternal({
      root,
      plan,
      verification,
      publisher,
      repository: parsed.repository,
      receipt: admittedReceipt
    });
  }
  if (parsed.command === 'recover-internal') {
    const receipt = await recoverNativePlayInternal({ plan, publisher, repository: parsed.repository });
    const file = path.resolve(root, parsed.receiptFile);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const bytes = serializeNativePlayReceipt(receipt);
    fs.writeFileSync(file, bytes, { mode: 0o600 });
    return Object.freeze({ receipt, file, sha256: nativePlayReceiptSha256(bytes) });
  }
  if (parsed.command === 'promote-closed') return promoteNativePlayClosed({ plan, publisher });
  return promoteNativePlayProduction({ plan, publisher });
}

async function run() {
  const result = await runNativePlayReleaseCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run().catch((error) => {
    console.error(`[native-play-release] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
