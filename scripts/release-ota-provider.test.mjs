import assert from 'node:assert/strict';
import test from 'node:test';
import { easOtaProvider, resolveOtaChannel } from './release-ota-provider.mjs';
import { runReleaseOperation } from './release-operation.mjs';
import { hash, byteHash } from './release-plan.mjs';

async function fixture() {
  const projectId = '11111111-1111-4111-8111-111111111111', branchId = '22222222-2222-4222-8222-222222222222';
  const group = '33333333-3333-4333-8333-333333333333', updateId = '44444444-4444-4444-8444-444444444444';
  const configuration = { profile: 'production', environment: 'production', channel: 'production', projectId, serverUrl: 'https://synthetic.invalid' };
  const channel = { id: projectId, name: 'production', isPaused: false, updateBranches: [{ id: branchId, name: 'production' }],
    branchMapping: JSON.stringify({ version: 0, data: [{ branchId, branchMappingLogic: 'true' }] }) };
  const bundle = Buffer.from('verified synthetic javascript'), asset = Buffer.from('synthetic image');
  const exported = { metadata: { fileMetadata: { ios: { bundle: 'bundle.hbc', assets: [{ path: 'icon.png' }] } } },
    files: [{ path: 'bundle.hbc', sha256: byteHash(bundle), size: bundle.length }, { path: 'icon.png', sha256: byteHash(asset), size: asset.length }] };
  const state = { published: false, loseResponse: false, corruptAsset: false, starts: 0 }, calls = [];
  const identity = { source: 'a'.repeat(40), planDigest: hash('plan'), configuration, configurationDigest: hash(configuration),
    exportDigest: hash(exported), platform: 'ios', runtime: 'ios-1.2.3-11' };
  const update = { id: updateId, group, platform: 'ios', runtimeVersion: identity.runtime, branch: 'production',
    message: `calibrate:${identity.source}:${identity.planDigest}:${identity.exportDigest}`, isRollBackToEmbedded: false,
    gitCommitHash: null, manifestPermalink: 'https://synthetic.invalid/manifest' };
  const manifest = { id: updateId, runtimeVersion: identity.runtime, extra: { eas: { projectId } },
    launchAsset: { hash: Buffer.from(byteHash(bundle), 'hex').toString('base64url'), url: 'https://synthetic.invalid/bundle' },
    assets: [{ hash: Buffer.from(byteHash(asset), 'hex').toString('base64url'), url: 'https://synthetic.invalid/asset' }] };
  const execute = async args => {
    calls.push(args);
    if (args[0] === 'channel:view') return { currentPage: channel };
    if (args[0] === 'update:list') return { currentPage: state.published ? [{ group }] : [] };
    if (args[0] === 'update:view') return [update];
    if (args[0] === 'update') {
      state.starts++; state.published = true;
      if (state.loseResponse) { state.loseResponse = false; throw Error('response lost'); }
      return [update];
    }
    throw Error('Unexpected mocked EAS command');
  };
  identity.channelBinding = await resolveOtaChannel(execute, 'production');
  const fetchImpl = async url => ({ ok: true, body: (async function* () {
    yield url.pathname === '/manifest' ? Buffer.from(JSON.stringify(manifest)) : url.pathname === '/bundle' ? bundle :
      state.corruptAsset ? Buffer.from('wrong bytes') : asset;
  })() });
  const provider = easOtaProvider({ execute, verifyExport: async () => exported, assertSource: async () => {}, inputDirectory: '/synthetic/export', fetchImpl });
  let operation;
  const store = { assertActive: async () => {}, operation: async () => operation, save: async value => { operation = structuredClone(value); return operation; } };
  return { identity, provider, state, calls, manifest, update, channel, group, store, exported };
}

test('OTA publication uses one inert platform export and verifies every delivered asset byte', async () => {
  const f = await fixture(), result = await runReleaseOperation(f.store, 'ota-ios', f.identity, f.provider);
  assert.equal(result.group, f.group); assert.equal(result.assets.length, 2);
  assert.equal(result.artifactSha256, byteHash(Buffer.from(JSON.stringify(f.manifest))));
  const publish = f.calls.find(args => args[0] === 'update'); assert(publish.includes('--skip-bundler'));
  assert.equal(publish[publish.indexOf('--platform') + 1], 'ios');
  await runReleaseOperation(f.store, 'ota-ios', f.identity, f.provider); assert.equal(f.state.starts, 1);
});

test('lost OTA response reconciles the exact existing group and never republishes', async () => {
  const f = await fixture(); f.state.loseResponse = true;
  await assert.rejects(runReleaseOperation(f.store, 'ota-ios', f.identity, f.provider), /response lost/);
  await runReleaseOperation(f.store, 'ota-ios', f.identity, f.provider); assert.equal(f.state.starts, 1);
});

test('channel changes, runtime substitution and altered downloaded bytes cannot produce successful receipts', async () => {
  const f = await fixture(); f.channel.isPaused = true;
  await assert.rejects(f.provider.start(f.identity), /active channel/); assert.equal(f.state.starts, 0);
  const g = await fixture(); g.update.runtimeVersion = 'wrong'; await assert.rejects(g.provider.verify(g.group, g.identity), /exact immutable/);
  const h = await fixture(); h.state.corruptAsset = true; await assert.rejects(h.provider.verify(h.group, h.identity), /asset bytes changed/);
  const i = await fixture(); i.exported.files[0].sha256 = hash('changed'); await assert.rejects(i.provider.start(i.identity), /journaled operation/);
  assert.equal(i.state.starts, 0);
});
