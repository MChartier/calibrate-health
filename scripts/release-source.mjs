import assert from 'node:assert/strict';
import { candidateGit, verifyUnifiedCandidate } from './release-candidate.mjs';
import { verifyPlan, hash, SHA } from './release-plan.mjs';

export function nativeCandidateRequest(plan) {
  verifyPlan(plan);
  const android = plan.stages.some(stage => stage.key === 'native-android');
  const ios = plan.stages.some(stage => stage.key === 'native-ios');
  if (!android && !ios) return null;
  // Preserve the existing server-only image candidate guard. The server worker allocates later, from this merged source.
  return { schema: 1, source: plan.source, runId: plan.runId, planDigest: plan.digest, android, ios, serverBump: null };
}

/** The only pre-provider source advance is a CI-gated merge of exact reconstructed native version metadata. */
export async function verifyExecutionSource({ root, plan, source, merge, git = candidateGit(root), verifyCandidate = verifyUnifiedCandidate }) {
  verifyPlan(plan); assert(SHA.test(source), 'Execution source requires an exact commit.');
  const request = nativeCandidateRequest(plan);
  if (!request) {
    assert(source === plan.source && !merge, 'An image/OTA-only plan cannot substitute its source.');
    return { source, originalSource: plan.source, planDigest: plan.digest };
  }
  assert(merge?.source === source && merge.requestDigest === hash(request) && SHA.test(merge.candidate) && SHA.test(merge.tree),
    'Native execution source lacks its exact retained merge identity.');
  const parents = git(['rev-list', '--parents', '-n', '1', source]).trim().split(/\s+/);
  assert.deepEqual(parents, [source, plan.source, merge.candidate], 'Native execution merge parents differ.');
  assert.equal(git(['rev-parse', `${source}^{tree}`]).trim(), merge.tree, 'Native execution merge tree differs.');
  assert.equal(git(['rev-parse', `${merge.candidate}^{tree}`]).trim(), merge.tree, 'Native execution candidate tree differs.');
  await verifyCandidate({ root, commit: merge.candidate, parent: plan.source, request, git });
  return { source, originalSource: plan.source, candidate: merge.candidate, planDigest: plan.digest };
}
