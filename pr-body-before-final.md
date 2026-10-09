## Summary

A triggered server release can stop because its token-created PR needs separate workflow approval. The database check also fails when the goal-pace smoke backdates a goal and unintentionally makes an older fixture goal active.

Cut release now calls the existing read-only validation workflows with explicit candidate and source SHAs. Both merge gates verify their results in the same trusted run, preserving exact refs, canonical release mirrors, merge-tree checks and publication dependencies. The smoke keeps one explicit active-goal identity through its timezone, Wear and import cases. Normal PR/manual validation and the release-only platform/rollback skips remain intact.

Closes #457. This is a master-based follow-on; PR441/452 and immutable release PR455 are unchanged. Overlapping workflow changes need coordinated integration before those separate branches advance.

## Test plan and behavior evidence

This changes release tooling and a synthetic database fixture, with no application UI flow. [Retained evidence and exact source/scope](https://github.com/MChartier/calibrate-health/blob/6bdfa677ae1b892d7cb147c2be7d271b896143d6/README.md):

| Scenario | Expected and observed |
| --- | --- |
| Run the unchanged goal smoke on disposable PostgreSQL, then run the corrected fixture | The original fails with 90,000 instead of 84,000. The corrected smoke retains the expected weights and passes all subsequent timezone, Wear, import, concurrency and receipt-replay cases. |
| Supply trusted-run CI fixtures, including no PR-event runs | The five required validation surfaces pass only with exact source/run/candidate bindings. Missing, failed, cancelled and wholly skipped checks reject finalization. |
| Retry validation or move a ref while inspecting it | Same-run, same-candidate successes may be reused; a newer failure overrides older success. Changed master, candidate, run attempt or workflow source rejects both initial and premerge checks. |

## Supporting checks and limitations

The maintained release suite passed **160 tests with 2 existing skips**; its focused CI/workflow subset passed **60 tests**. Release consistency and diff checks passed. The actual red/green database run used Windows, Node24.19.0, Prisma7.9.0 and PostgreSQL16.14; hosted CI retains its existing Node and PostgreSQL15/16 configurations and is pending at publication.

Raw actionlint1.7.12 still reports unsupported `job.workflow_sha` and `queue: max` features already used by the repository. Filtering only those diagnostics yields no other errors; no repository suppression was added.

Source `0c9c839e`, actual target/source merge-base `547206a1`; [one commit and all 12 changed paths](https://github.com/MChartier/calibrate-health/blob/6bdfa677ae1b892d7cb147c2be7d271b896143d6/scope.json). Original failure logs and artifact digests remain on the nonmerged evidence ref. The trusted release path was not dispatched: no merge, release, provider operation or deployment is claimed. Independent QA remains required. The configured review bot previously refused solely for quota; no new bot completion or retry is claimed.
