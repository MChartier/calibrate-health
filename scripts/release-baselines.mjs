import assert from 'node:assert/strict';
import { readAsset } from './release-journal.mjs';
import { verifyPlan, hash, SHA, DIGEST } from './release-plan.mjs';

/** A journal is an index, never an artifact authority. Reverify each successful artifact against its worker. */
export async function loadReleaseBaselines({ repository, transport, api, snapshot, verifyWorker, receiptId }) {
  if (receiptId !== undefined) assert(/^[1-9]\d*:native-(android|ios):[1-9]\d*$/.test(receiptId), 'Invalid selected native receipt identity.');
  const receipts = [];
  for (const release of await transport.releases()) {
    if (receiptId && String(release.id) !== receiptId.split(':')[0]) continue;
    if (!/^(candidate|completed)\/unified\/[1-9]\d*$/.test(release.tag_name)) continue;
    assert(release.draft && release.author?.login === 'github-actions[bot]', 'Unrecognized release journal ownership.');
    const plan = await readAsset(transport, release, 'plan.json');
    if (!plan) {
      assert(release.assets.length <= 1 && release.assets.every(asset => asset.name === 'configuration.json'),
        'A release without its plan contains unexplained work.');
      if (release.assets.length) await readAsset(transport, release, 'configuration.json');
      continue;
    }
    verifyPlan(plan);
    assert(plan.repository === repository && plan.runId === release.tag_name.split('/').at(-1) &&
      plan.source === release.target_commitish && plan.stages.length < 1000, 'Journal plan identity differs.');
    const run = await api(`/repos/${repository}/actions/runs/${plan.runId}`);
    assert(String(run.id) === plan.runId && run.repository?.full_name === repository && run.head_sha === plan.source &&
      run.event === 'workflow_run' && run.head_branch === 'master' && run.path === '.github/workflows/unified-release-handler.yml',
    'Journal was not created for the protected release handler.');
    assert(/^[1-9]\d*$/.test(plan.requestRunId) && Number.isSafeInteger(plan.requestRunAttempt) && plan.requestRunAttempt > 0,
      'Journal is missing its exact manual request identity.');
    const request = await api(`/repos/${repository}/actions/runs/${plan.requestRunId}/attempts/${plan.requestRunAttempt}`);
    assert(String(request.id) === plan.requestRunId && request.run_attempt === plan.requestRunAttempt &&
      request.repository?.full_name === repository && request.head_repository?.full_name === repository &&
      request.event === 'workflow_dispatch' && request.path === '.github/workflows/unified-release.yml' &&
      request.head_branch === 'master' && request.head_sha === plan.source && request.status === 'completed' &&
      request.conclusion === 'success' && request.actor?.type === 'User' && request.triggering_actor?.type === 'User',
    'Journal manual request authority differs.');
    const configurationBinding = await readAsset(transport, release, 'configuration.json');
    assert.deepEqual(configurationBinding, { schema: 1, digest: plan.configuration }, 'Retained build configuration differs.');
    const originalInputs = await snapshot(plan.source, plan.profile);
    assert.deepEqual(originalInputs, plan.inputs, 'Plan inputs do not match their immutable source objects.');
    const completion = await readAsset(transport, release, 'completion.json');
    if (release.tag_name.startsWith('completed/')) {
      assert(completion?.planDigest === plan.digest && completion.runId === plan.runId &&
        completion.results.length === plan.stages.length, 'Completed journal is incomplete.');
    }
    for (const [index, stage] of plan.stages.entries()) {
      if (receiptId && stage.key !== receiptId.split(':')[1]) continue;
      const result = await readAsset(transport, release, `receipt.${stage.key}.json`);
      if (!result) {
        assert(!completion, 'Completed artifact receipt is missing.');
        continue; // A running/failed stage cannot move any successful artifact baseline.
      }
      assert(result.key === stage.key && typeof result.id === 'string' && DIGEST.test(result.identity), 'Artifact index identity differs.');
      if (receiptId) assert.equal(`${release.id}:${stage.key}:${result.id}`, receiptId, 'Selected native receipt changed.');
      if (completion) assert.deepEqual(completion.results[index], result, 'Completion differs from its retained per-artifact receipt.');
      const verified = await verifyWorker({ stage, result, plan, configurationDigest: configurationBinding.digest });
      assert(verified && SHA.test(verified.source) && DIGEST.test(verified.artifactSha256) &&
        verified.configuration === (stage.kind === 'server' ? plan.serverConfiguration : plan.configuration),
      'Worker did not return a source/configuration-bound artifact receipt.');
      const inputs = await snapshot(verified.source, plan.profile);
      const key = stage.kind === 'server' ? 'server' : stage.kind === 'native' ? 'native' : 'bundle';
      const input = key === 'server' ? inputs.server : inputs[key][stage.platform];
      const sequence = Number(plan.runId) * 1000 + index + 1;
      assert(Number.isSafeInteger(sequence) && sequence > 0, 'Receipt ordering exceeds the exact integer range.');
      receipts.push({ schema: 1, id: `${release.id}:${stage.key}:${result.id}`, sequence, kind: stage.kind,
        source: verified.source, input, configuration: verified.configuration, artifactSha256: verified.artifactSha256,
        ...(stage.kind !== 'server' ? { platform: stage.platform, profile: plan.profile, runtime: verified.runtime,
          bundleInput: inputs.bundle[stage.platform] } : {}), authority: verified });
    }
  }
  if (receiptId) assert.equal(receipts.length, 1, 'Selected verified native receipt is missing.');
  return receipts;
}
