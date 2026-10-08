import assert from 'node:assert/strict';
import { hash, byteHash, SHA, DIGEST } from './release-plan.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

/** Existing channels only. Rollouts, paused channels and branch remapping require operator reconciliation. */
export async function resolveOtaChannel(execute, channel) {
  assert(/^[a-z0-9][a-z0-9._-]*$/i.test(channel), 'Invalid OTA channel.');
  const value = (await execute(['channel:view', channel, '--json', '--non-interactive', '--limit', '25']))?.currentPage;
  assert(value?.name === channel && UUID.test(value.id) && value.isPaused === false &&
    Array.isArray(value.updateBranches) && value.updateBranches.length === 1, 'OTA requires one existing active channel branch.');
  let mapping;
  try { mapping = JSON.parse(value.branchMapping); } catch { throw Error('Unknown OTA channel mapping.'); }
  const branch = value.updateBranches[0];
  assert(UUID.test(branch.id) && typeof branch.name === 'string' && branch.name.length > 0 &&
    mapping.version === 0 && mapping.data?.length === 1 && mapping.data[0].branchId === branch.id &&
    mapping.data[0].branchMappingLogic === 'true', 'OTA channel has a rollout or unsupported branch mapping.');
  return { channelId: value.id, branchId: branch.id, branch: branch.name, mapping: hash(mapping) };
}

async function download(url, limit, fetchImpl) {
  const target = new URL(url);
  assert(target.protocol === 'https:' && !target.username && !target.password, 'OTA artifact URL is not credential-free HTTPS.');
  const response = await fetchImpl(target, { headers: { Accept: 'application/expo+json, application/json' }, signal: AbortSignal.timeout(120_000) });
  assert(response.ok && response.body, 'Published OTA bytes are unavailable; retain the operation for reconciliation.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length; assert(size <= limit, 'Published OTA data exceeds its expected size.'); chunks.push(chunk);
  }
  assert(size > 0, 'Published OTA artifact is empty.'); return Buffer.concat(chunks);
}

/** Compare the actual delivered manifest and asset bytes to the independently verified export. */
async function verifyPublishedOta({ update, identity, metadata, files, fetchImpl = fetch }) {
  const manifestBytes = await download(update.manifestPermalink, 5 * 1024 * 1024, fetchImpl);
  const manifest = JSON.parse(manifestBytes);
  assert(manifest.id === update.id && manifest.runtimeVersion === identity.runtime &&
    manifest.extra?.eas?.projectId === identity.configuration.projectId && Array.isArray(manifest.assets),
  'Published OTA manifest has an unrelated update, runtime or project.');
  const selected = metadata.fileMetadata?.[identity.platform];
  assert(selected && Array.isArray(selected.assets), 'Verified export is missing the selected platform.');
  const file = name => {
    const found = files.filter(file => file.path === name.replaceAll('\\', '/'));
    assert(found.length === 1 && DIGEST.test(found[0].sha256) && Number.isSafeInteger(found[0].size) && found[0].size > 0,
      'Verified export has an ambiguous or invalid file.'); return found[0];
  };
  const launch = file(selected.bundle), assets = selected.assets.map(asset => file(asset.path));
  const encoded = value => Buffer.from(value, 'hex').toString('base64url');
  const assetHashes = [...new Set(assets.map(asset => encoded(asset.sha256)))].sort();
  assert(manifest.launchAsset?.hash === encoded(launch.sha256), 'Published OTA launch bundle differs from the verified export.');
  assert.deepEqual(manifest.assets.map(asset => asset.hash).sort(), assetHashes, 'Published OTA assets differ from the verified export.');
  const observed = [];
  for (const asset of [manifest.launchAsset, ...manifest.assets]) {
    const expected = [launch, ...assets].find(file => encoded(file.sha256) === asset.hash);
    assert(expected, 'Unexpected published OTA asset.');
    const contents = await download(asset.url, expected.size, fetchImpl);
    assert(contents.length === expected.size && byteHash(contents) === expected.sha256, 'Published OTA asset bytes changed.');
    observed.push({ sha256: expected.sha256, size: expected.size });
  }
  return { source: identity.source, configuration: identity.configurationDigest, runtime: identity.runtime,
    platform: identity.platform, group: update.group, updateId: update.id,
    artifactSha256: byteHash(manifestBytes), assets: observed };
}

/** Locked EAS 22.4.0 JSON contract. execute runs only in the verified inert publisher directory. */
export function easOtaProvider({ execute, verifyExport, assertSource, inputDirectory, fetchImpl = fetch }) {
  async function channel(identity) {
    assert(SHA.test(identity.source) && DIGEST.test(identity.planDigest) && DIGEST.test(identity.exportDigest) &&
      ['android', 'ios'].includes(identity.platform) && identity.configurationDigest === hash(identity.configuration), 'Invalid OTA operation identity.');
    assert.deepEqual(await resolveOtaChannel(execute, identity.configuration.channel), identity.channelBinding,
      'OTA channel changed; no publication or success receipt is permitted.');
  }
  const message = identity => `calibrate:${identity.source}:${identity.planDigest}:${identity.exportDigest}`;
  function bind(updates, identity, group) {
    assert(Array.isArray(updates) && updates.length === 1, 'Expected exactly one platform-specific OTA update.');
    const update = updates[0];
    assert(UUID.test(update.id) && UUID.test(update.group) && (!group || update.group === group) &&
      update.platform === identity.platform && update.runtimeVersion === identity.runtime &&
      update.branch === identity.channelBinding.branch && update.message === message(identity) &&
      update.isRollBackToEmbedded === false && (update.gitCommitHash == null || update.gitCommitHash === identity.source),
    'OTA provider result differs from its exact immutable request.');
    return update;
  }
  async function view(group, identity) {
    assert(UUID.test(group), 'Invalid OTA group ID.');
    return bind(await execute(['update:view', group, '--json']), identity, group);
  }
  async function exported(identity) {
    const result = await verifyExport(identity);
    assert.equal(hash({ metadata: result.metadata, files: result.files }), identity.exportDigest,
      'OTA export bytes differ from the journaled operation.');
    return result;
  }
  return {
    find: async identity => {
      await channel(identity); const found = [], seen = new Set();
      for (let offset = 0; offset < 50000; offset += 50) {
        const page = (await execute(['update:list', '--branch', identity.channelBinding.branch, '--platform', identity.platform,
          '--runtime-version', identity.runtime, '--offset', String(offset), '--limit', '50', '--json', '--non-interactive']))?.currentPage;
        assert(Array.isArray(page) && page.length <= 50, 'Incomplete OTA group inventory.');
        for (const summary of page) {
          assert(UUID.test(summary.group) && !seen.has(summary.group), 'OTA inventory changed or contains a duplicate group.');
          seen.add(summary.group);
          // List messages contain display formatting; inspect the exact group before adopting it.
          const updates = await execute(['update:view', summary.group, '--json']);
          assert(Array.isArray(updates) && updates.length > 0, 'OTA group inventory is incomplete.');
          if (updates.some(update => update.message === message(identity))) found.push(bind(updates, identity, summary.group).group);
        }
        if (page.length < 50) return found;
      }
      throw Error('OTA inventory exceeded the complete-read bound.');
    },
    start: async identity => {
      await channel(identity); await assertSource(identity); await exported(identity);
      const result = await execute(['update', '--platform', identity.platform, '--channel', identity.configuration.channel,
        '--environment', identity.configuration.environment, '--input-dir', inputDirectory, '--skip-bundler',
        '--message', message(identity), '--non-interactive', '--json'],
      { EAS_NO_VCS: '1', EAS_SKIP_AUTO_FINGERPRINT: '1', EXPO_NO_DOTENV: '1' });
      return bind(result, identity).group;
    },
    status: async (group, identity) => { await view(group, identity); return 'complete'; },
    verify: async (group, identity) => {
      await channel(identity); const update = await view(group, identity), artifact = await exported(identity);
      const receipt = await verifyPublishedOta({ update, identity, ...artifact, fetchImpl });
      await channel(identity); return receipt;
    }
  };
}
