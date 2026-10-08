import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { nextReleaseVersion, getNextNativeVersionCodes } from './release-config.mjs';

export const PLATFORMS = Object.freeze(['android', 'ios']);
export const SHA = /^[a-f0-9]{40}$/;
export const DIGEST = /^[a-f0-9]{64}$/;
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const bytes = value => Buffer.from(`${JSON.stringify(canonical(value))}\n`);
export const hash = value => createHash('sha256').update(bytes(value)).digest('hex');
export const byteHash = value => createHash('sha256').update(value).digest('hex');

/** Validate external public build inputs without including their values in diagnostics. */
export function buildConfiguration(value, eas) {
  assert(value && Object.keys(value).sort().join() === 'channel,environment,profile,projectId,serverUrl', 'Unexpected build configuration fields.');
  assert(['internal', 'production'].includes(value.profile), 'Unknown build profile.');
  assert(['preview', 'production'].includes(value.environment), 'Unknown EAS environment.');
  assert(/^[a-z0-9][a-z0-9._-]*$/i.test(value.channel), 'Invalid Expo channel.');
  assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.projectId), 'Invalid EAS project UUID.');
  let url;
  try { url = new URL(value.serverUrl); } catch { throw Error('Build endpoint must be a credential-free HTTPS origin.'); }
  assert(url.protocol === 'https:' && url.origin === value.serverUrl, 'Build endpoint must be a credential-free HTTPS origin.');
  const profile = eas.build?.[value.profile];
  assert(profile && profile.channel === value.channel && profile.environment === value.environment,
    'External configuration must match the selected EAS profile, channel and environment.');
  assert(eas.cli?.appVersionSource === 'local' && !profile.autoIncrement && !profile.android?.autoIncrement && !profile.ios?.autoIncrement,
    'Release plans require local immutable version allocation.');
  assert(profile.distribution === (value.profile === 'production' ? 'store' : 'internal'), 'Unexpected build distribution.');
  return Object.freeze({ ...value });
}

/** Receipts enter only after worker-specific verification; JSON alone is never provenance. */
export async function verifiedReceipts(receipts, verify) {
  const result = [];
  const identities = new Map();
  for (const receipt of receipts) {
    assert(receipt.schema === 1 && SHA.test(receipt.source) && DIGEST.test(receipt.input) &&
      DIGEST.test(receipt.configuration) && DIGEST.test(receipt.artifactSha256), 'Malformed artifact receipt.');
    assert(['server', 'native', 'ota', 'submission'].includes(receipt.kind), 'Unknown artifact receipt kind.');
    assert(receipt.kind === 'server' || PLATFORMS.includes(receipt.platform), 'Missing receipt platform.');
    assert(Number.isSafeInteger(receipt.sequence) && receipt.sequence > 0 && typeof receipt.id === 'string' && receipt.id, 'Missing receipt identity/order.');
    if (identities.has(receipt.id)) assert.equal(hash(receipt), identities.get(receipt.id), 'Conflicting receipt identity.');
    else {
      assert.equal(await verify(receipt), true, 'Worker did not verify artifact receipt.');
      identities.set(receipt.id, hash(receipt));
      result.push(structuredClone(receipt));
    }
  }
  return result;
}

function last(receipts, kind, profile, platform) {
  const matches = receipts.filter(r => r.kind === kind && (kind === 'server' || r.profile === profile && r.platform === platform));
  matches.sort((a, b) => a.sequence - b.sequence);
  for (let i = 1; i < matches.length; i++) assert(matches[i - 1].sequence !== matches[i].sequence, 'Ambiguous receipt order.');
  return matches.at(-1);
}

/** Pure planner. The caller supplies only receipts verified against the original worker authority. */
export function planRelease({ runId, requestRunId, requestRunAttempt, repository, source, currentSource, configuration, inputs, manifest, ios, receipts = [], bump = 'patch' }) {
  assert(/^[1-9]\d*$/.test(runId) && SHA.test(source) && source === currentSource, 'Release source must be exact current protected master.');
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository), 'Release repository identity is required.');
  assert(DIGEST.test(configuration.digest), 'Missing immutable configuration identity.');
  assert(DIGEST.test(configuration.serverDigest), 'Missing immutable image configuration identity.');
  assert(['internal', 'production'].includes(configuration.profile), 'Unknown profile.');
  for (const input of [inputs.server, ...PLATFORMS.flatMap(p => [inputs.native[p], inputs.bundle[p]])]) assert(DIGEST.test(input), 'Invalid artifact input digest.');
  const server = last(receipts, 'server');
  const native = {}, ota = {}, previous = { server: server?.id ?? null };
  const stages = [];
  const versions = { server: manifest.server.version, android: structuredClone(manifest.android), ios: structuredClone(ios) };
  const serverChanged = !server || server.input !== inputs.server || server.configuration !== configuration.serverDigest;
  if (serverChanged) {
    versions.server = nextReleaseVersion(manifest.server.version, bump);
  }
  for (const platform of PLATFORMS) {
    const baseline = last(receipts, 'native', configuration.profile, platform);
    const update = last(receipts, 'ota', configuration.profile, platform);
    previous[platform] = { native: baseline?.id ?? null, ota: update?.id ?? null };
    native[platform] = !baseline || baseline.input !== inputs.native[platform] || baseline.configuration !== configuration.digest;
    if (native[platform]) stages.push({ key: `native-${platform}`, kind: 'native', platform,
      reason: baseline ? 'changed native inputs or build configuration' : 'missing verified native build' });
    ota[platform] = [];
    {
      for (const receipt of receipts.filter(r => r.kind === 'native' && r.profile === configuration.profile && r.platform === platform)) {
        assert(typeof receipt.runtime === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(receipt.runtime), 'Invalid native receipt runtime.');
        const compatible = receipt.input === inputs.native[platform] && receipt.configuration === configuration.digest;
        const successes = receipts.filter(r => ['native', 'ota'].includes(r.kind) && r.profile === configuration.profile &&
          r.platform === platform && r.runtime === receipt.runtime && r.configuration === receipt.configuration);
        successes.sort((a, b) => a.sequence - b.sequence);
        for (let i = 1; i < successes.length; i++) assert(successes[i - 1].sequence !== successes[i].sequence, 'Ambiguous runtime receipt order.');
        const current = successes.at(-1)?.bundleInput === inputs.bundle[platform];
        ota[platform].push({ baseline: receipt.id, runtime: receipt.runtime, eligible: compatible,
          required: compatible && !current,
          reason: !compatible ? 'incompatible native inputs or configuration' : current ? 'runtime already has this bundle' : 'verified compatible runtime' });
      }
      // A new native build already includes this bundle; never spend on a duplicate OTA for it.
      const eligible = [...new Map(ota[platform].filter(t => t.required).map(t => [t.runtime, t])).values()];
      for (const target of eligible) stages.push({ key: `ota-${platform}-${target.runtime}`, kind: 'ota', platform, ...target });
    }
  }
  if (native.android) {
    const pair = getNextNativeVersionCodes(manifest);
    const version = nextReleaseVersion(manifest.android.mobile.version_name, 'patch');
    Object.assign(versions.android.mobile, { version_name: version, version_code: pair.mobileVersionCode, native_release_tag: `native-v${version}` });
    Object.assign(versions.android.wear, { version_name: version, version_code: pair.wearVersionCode });
  }
  if (native.ios) {
    assert(/^[1-9]\d{0,8}$/.test(ios.buildNumber), 'Invalid iOS build allocation.');
    const number = Number(ios.buildNumber) + 1;
    assert(number <= 999999999, 'iOS build allocation exhausted.');
    versions.ios = { ...ios, version: nextReleaseVersion(ios.version, 'patch'), buildNumber: String(number) };
  }
  // Native signing and compatible OTA use the exact merged native metadata source first.
  // The maintained server worker then creates its independent server-only candidate.
  if (serverChanged) stages.push({ key: 'server', kind: 'server', reason: server ? 'changed image inputs' : 'missing verified image' });
  const plan = { schema: 1, runId, ...(requestRunId ? { requestRunId, requestRunAttempt } : {}), repository, source, serverBump: bump, profile: configuration.profile, configuration: configuration.digest, serverConfiguration: configuration.serverDigest,
    inputs, previous, versions, stages, ota, noChange: stages.length === 0 };
  return { ...plan, digest: hash(plan) };
}

export function verifyPlan(plan) {
  const { digest, ...value } = plan;
  assert(DIGEST.test(digest) && hash(value) === digest, 'Release plan changed.');
  return plan;
}
