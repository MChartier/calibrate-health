import assert from 'node:assert/strict';
import { hash, SHA, verifyPlan } from './release-plan.mjs';
import { readAsset } from './release-journal.mjs';
import { runReleaseOperation } from './release-operation.mjs';

/** One immutable plan drives only selected workers; provider adapters retain their original trust authorities. */
export async function runReleasePlan({ plan, journal, workers, source, assertSource, polls = 1, pause }) {
  verifyPlan(plan);
  assert(SHA.test(source), 'Execution source must be an exact verified commit.');
  assert.equal(journal.runId, plan.runId, 'Journal belongs to another plan/run.');
  // Resolve every adapter and identity before admitting any mutation or provider credential.
  const operations = plan.stages.map(stage => {
    const worker = workers[stage.key] ?? workers[stage.kind === 'server' ? 'server' : `${stage.kind}-${stage.platform}`];
    assert(worker && ['identity', 'find', 'start', 'status', 'verify'].every(name => typeof worker[name] === 'function'),
      `Required worker is unavailable: ${stage.kind}/${stage.platform ?? 'server'}.`);
    const identity = worker.identity({ plan, stage, source });
    assert(identity.source === source && identity.planDigest === plan.digest && identity.configurationDigest ===
      (stage.kind === 'server' ? plan.serverConfiguration : plan.configuration), 'Worker identity differs from the immutable plan.');
    return { stage, worker, identity };
  });
  if (plan.noChange) {
    assert(operations.length === 0, 'No-change plan contains work.');
    return { schema: 1, status: 'no-change', planDigest: plan.digest, results: [] };
  }
  assert(operations.length > 0, 'Nonempty release plan is missing stages.');
  const existing = await journal.release();
  const completed = existing && await readAsset(journal.transport, existing, 'completion.json');
  if (completed) {
    assert(completed.planDigest === plan.digest && completed.runId === plan.runId && completed.results.length === operations.length,
      'Completed journal does not match this plan.');
    for (let i = 0; i < operations.length; i++) {
      const { stage, worker, identity } = operations[i], recorded = completed.results[i];
      assert(recorded.key === stage.key && recorded.identity === hash(identity), 'Completed worker identity differs.');
      assert.equal(hash(await worker.verify(recorded.id, identity)), hash(recorded.receipt), 'Completed artifact receipt changed.');
    }
    await journal.finish(plan.digest, completed.results);
    return { schema: 1, status: 'complete', planDigest: plan.digest, results: completed.results };
  }
  // A provider may finish after master advances (including the server candidate's
  // own merge). Reconciliation must remain possible; only a new request needs the
  // current-source guard. The caller separately verifies the retained source/tree.
  if (!existing) await assertSource({ source, plan });
  else assert.deepEqual(await readAsset(journal.transport, existing, 'plan.json'), plan, 'Retained plan differs.');
  await journal.create(plan.source);
  await journal.put('plan.json', plan);
  const results = [];
  for (const { stage, worker, identity } of operations) {
    const guardedWorker = { ...worker, start: async identity => {
      await assertSource({ source, plan, stage });
      return worker.start(identity);
    } };
    const receipt = await runReleaseOperation(journal, stage.key, identity, guardedWorker, { polls, pause });
    const state = await journal.operation(stage.key);
    assert(state.status === 'complete', 'Worker did not persist verified completion.');
    const result = { key: stage.key, id: state.ids.at(-1), identity: hash(identity), receipt };
    await journal.put(`receipt.${stage.key}.json`, result);
    results.push(result);
  }
  await journal.finish(plan.digest, results);
  return { schema: 1, status: 'complete', planDigest: plan.digest, results };
}
