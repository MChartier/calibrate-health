import assert from 'node:assert/strict';
import { hash } from './release-plan.mjs';

/** Intent is durable before any request; absence after a lost response never permits blind duplication. */
export async function runReleaseOperation(store, key, identity, provider, { polls = 1, pause = async () => {} } = {}) {
  await store.assertActive();
  let state = await store.operation(key);
  const binding = hash(identity);
  if (state) assert.equal(state.binding, binding, 'Operation identity changed on retry.');
  if (state?.status === 'complete') {
    const observed = await provider.verify(state.ids.at(-1), identity);
    assert.equal(hash(observed), hash(state.result), 'Completed provider receipt changed.');
    return observed;
  }
  let id = state?.status === 'running' ? state.ids.at(-1) : undefined;
  if (!id) {
    const found = await provider.find(identity);
    assert(Array.isArray(found) && new Set(found).size === found.length, 'Incomplete provider operation inventory.');
    const candidates = found.filter(value => !state?.ids.includes(value));
    assert(candidates.length <= 1, 'Ambiguous provider operations require reconciliation.');
    if (candidates.length) {
      // A provider's exact correlated operation can outlive an interrupted first journal write.
      // Adopt it through the same durable intent transition; never manufacture a running first record.
      if (!state) state = await store.save({ key, binding, status: 'intent', ids: [] });
      id = candidates[0];
    }
    else {
      assert(!state || state.status === 'failed', 'Unknown provider outcome; no duplicate request sent.');
      state = await store.save({ key, binding, status: 'intent', ids: state?.ids ?? [] });
      await store.assertActive();
      id = await provider.start(identity);
    }
    assert(typeof id === 'string' && id.length > 0, 'Provider did not return an immutable operation ID.');
    state = await store.save({ key, binding, status: 'running', ids: [...(state?.ids ?? []), id] });
  }
  for (let i = 0; i < polls; i++) {
    await store.assertActive();
    const status = await provider.status(id, identity);
    assert(['running', 'failed', 'complete'].includes(status), 'Unknown provider status; reconcile before retrying.');
    if (status === 'failed') {
      await store.save({ key, binding, status, ids: state.ids });
      throw Error(`Provider operation ${key} failed; retained ID ${id}.`);
    }
    if (status === 'complete') {
      const result = await provider.verify(id, identity);
      await store.save({ key, binding, status, ids: state.ids, result });
      return result;
    }
    if (i + 1 < polls) await pause();
  }
  throw Error(`Provider operation ${key} is still running; resume retained ID ${id}.`);
}
