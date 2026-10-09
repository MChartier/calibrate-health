# PR450 scope correction proposal

Matthew's comment 6072694319 is valid: the change bundles deletion of hosting controls with broader authentication lifecycle work. This assessment does not claim the requested correction is implemented.

## Observed scope

The unchanged four-commit PR has 38 paths, +1,255/-881. Product/config changes are 19 paths, +634/-589; tests are 17 paths, +614/-286; maintained documentation is two paths, +7/-6. Those counts explain the composition, not justify the extra scope.

Actual master advanced to 8eb6014adc6ed0ea327fa09fbd2af76afef284d5 through PR442. Its backend credential/session persistence changes do not remove client-provider remount or late-response lifetime concerns. The successor must start from reverified actual master; no backend branch or code is to be changed. The current PR API base/merge-base remains 4cbcbc740fbe5fa5646b4de31951c79a653176d5.

## Proposed smaller implementation

1. Retain the direct deletions: ServerUrlControl and authServerDraft; login/register URL inputs and candidate arguments; native service setters/probes exposed to callers; Advanced connection controls/promotion; compatibility-screen choose-server actions. Keep diagnostics, retry, legal consent, account cleanup and administration. Landing already lacks hosting promotion.
2. Retain strict build-time target validation and same-origin production browser behavior. Reuse the existing server parsing and authenticateAgainstConfirmedServer boundary. Do not create another endpoint-selection abstraction.
3. Keep a bounded native startup transition before token reads, auth, child providers or replay. Existing released tokens are global and saved origin previously wins; simply deleting readServerUrl preference leaks credentials. Preserve same-origin sessions, atomically bind origin/tokens, start changed safe targets signed out, preserve originals, and block unknown or queued state. Reuse the existing tokenUpdates queue and existing hydrate/recovery path. Collapse the injected TargetTransitionStore adapter into the storage boundary if it provides no necessary separation; reuse maintained namespace validators rather than duplicate their formats. Do not equate deleting filenames with reducing complexity.
4. Do not automatically carry the browserAuthentication global queue, broad epoch changes across unrelated browser callbacks, or generic offlineWorkspace rollback map into a removal PR. They address independently reachable session-lifetime problems rather than removal of backend selection. Preserve their source, tests and findings on the old ref. Run the exact existing race reproductions against actual master and the smaller candidate before deciding which guards remain necessary.
5. Native R1 and the stale-browser-cookie finding cannot be waived just to reduce lines. A local lifetime check must occur before an old payload enters the existing persistence queue; an already-running write requires correct ordering/restoration before replacement reads. Reuse existing accountScopeRef/isMounted checks, tokenUpdates, per-origin workspace serialization and logout-intent functions first. Keep the minimum proven guard and proportional regression if required by the changed startup path. If the independent races remain reachable and need the broad machinery, ROOT should admit a separate, narrowly scoped client-session prerequisite rather than smuggling it into the removal PR. This is a dependency/scope decision, not permission to weaken isolation.
6. Keep maintained tests for picker absence, configured target validation, matching/different/unknown legacy origins, interrupted storage, all-account outbox/device state and recovery destinations. Move only tests of separated incidental behavior with that behavior; do not delete useful regressions to achieve a negative total. Native-device execution stays deferred.

## Published history and proposed coordination

An additive reversal can simplify the final tree but cannot remove the original broad implementations from four published commits. In particular, 8a6d1af mixes direct deletion/startup protection and general session epochs; 8e109f5 adds browser serialization alongside migration fixes; 60eca5e0 is a cold-test timeout adjustment; f417e84 is native lifetime/storage/workspace race correction. Therefore recommend one focused successor after ROOT coordinates any necessary separate safety prerequisite. Do not cherry-pick these commits wholesale.

- This owner is checkpointed and will stop source writing. No other task may write its existing branch. ROOT verifies any relevant prerequisite owner is idle before extraction or stacking.
- Retain mchartier/managed-438-01a11c7b at f417e84b430cc46275171462cc9d2373b8ee8f3e with all four original parents. Keep PR450 open, unready and non-draft until replacement/dependency verification; do not close or rewrite it during this proposal.
- Preserve the evidence/managed-438-01a11c7b history and every old capture/body/fixture/harness identity. The prior exact body and bindings are at 27f6a292704d42499d8169866729d1d1c5a8ae40/managed-438/r1-handoff/. Current genuine capture provenance is d108dee53ff3bfb2be8bb0110166ac6f06b09048/managed-438/r1-f417e84b/provenance.json, SHA256 9a02eeb7f19b56020094bbf7c46ac7ac3f02f46bd7873ce52f125750c6b22e31. Original baseline source/captures remain historical, never relabeled.
- After ROOT admits the successor/dependency plan, use a new isolated branch from reverified actual master (or a separately admitted, pinned safety prerequisite). Build selective deletions and the bounded origin guard; no force-push, branch reset, or import of the whole PR450/439 commit.
- Refresh affected genuine matched captures and exact source/build/fixture provenance, run proportional maintained checks/current CI, reconcile the concise base-to-final body, and return to the same QA owner. Full commit/file scope and human comment 6072694319 are explicit QA gates.
- ROOT alone links and closes a verified superseded PR and updates issue/Project association. PR439 remains closed unmerged at ce8543483db55800034e6ed2622eeb4b9ac7f3b6; deferred administrator/bootstrap requirements remain retained, not silently abandoned. PR402 stays closed. PR441/452 deployment/release wording and issue448 quantity work remain outside this change.

## Checkpoint and required next action

No product source, PR body, readiness or dependency was changed during this assessment. No new tests/builds were run; previous green CI/QA is historical and does not certify the proposed simplification. No release, credentials, installation or provider action occurred.

ROOT coordination is required before successor restructuring. Recommended decision: admit the focused successor plan and explicitly assign the disposition of independently reachable client-session races (minimal necessary guard here, or a separately scoped prerequisite). No human decision to weaken the accepted migration/isolation contract is requested or assumed.
