# Final release gate contract and QA correction evidence

Source/head: cf388c52cc9040bd236ad92bc8b4788487c4338a. Actual target/base/merge-base: master 6b803fbc5ecd833cc4de5039e8ce495812a97e86. No parent PR. This record supplements, never replaces, original records at 31bbc61 and c792506 and independent QA b208da1.

The final contract checks five expected PR workflows, exact head/branch/repository, one intended PR association, tested base/head/ref and matching repository IDs. Missing, ambiguous, wrong-PR or stale-base associations reject. The latest run cannot fall back to older green evidence; both initial and fresh run metadata are bound. After the complete jobs/attempt inspection, the gate rereads PR/head/base and master before authorizing merge, including the final zero-wait invocation. The final read and GitHub merge remain non-atomic; no server-side protection guarantee is claimed.

## Executed behavior

Maintained regressions cover master/head/base mutation during asynchronous CI reads and the final one-shot path; another PR, stale base, wrong refs/head/repository, empty/missing/ambiguous associations; fresh metadata changing its association; and a newer mismatched run beside an older valid run. The three new tests failed on prior 9f8359c4 (17 pass,3 fail), then all20 gate tests passed after correction. This is correction sensitivity evidence, not a replacement for the original base-state incident evidence.

Full maintained release suite on the fixed source:154 tests,152 pass,2 existing Linux-only publisher-shell skips,0 failures. git diff --check passed. Fixture/API objects are synthetic and retained in the maintained test file at the exact source revision. No real release was run. The original workflow-conclusion mutation experiment remains applicable because that rejection branch is unchanged; its exact old source identity remains historical.

## Complete published scope

Two linear commits:9f8359c428a6e29dc0e5d8661636fb851035299e(parent6b803fbc5ecd833cc4de5039e8ce495812a97e86),cf388c52cc9040bd236ad92bc8b4788487c4338a(parent9f8359c428a6e29dc0e5d8661636fb851035299e). Seven files,+442/-14:

- cut-release.yml +62/-4: gated finalization,read-only CI inventory,retained retry,stage reporting.
- AGENTS.md +6/-3 and ADR0008 +24/-3: maintained release/recovery contract.
- package.json +1/-1: maintained test registration, no dependency/version change.
- release-ci-gate.mjs +173: maintained gate.
- release-ci-gate.test.mjs +173: consequential regressions.
- release-workflow-contract.test.mjs +3/-3: permission/read contract updates.

All paths and commits belong to issue433; no evidence,temporary harnesses,logs,unrelated branches or native release redesign in product history. PR401 untouched. Original issue/record requirements remain preserved. Retention: same dedicated nonmerged evidence/issue433-ci-gate-9f8359c ref, owner task01a11275-8618-75dd-9d39-ab2d6c2aa02a, lifetime of release-gate review/recovery history.

## Bot review disposition

One bounded request at current head: https://github.com/MChartier/calibrate-health/pull/434#issuecomment-6023344648. Bot replied https://github.com/MChartier/calibrate-health/pull/434#issuecomment-6023348372: code-review usage limit reached. No current-head bot review completed. The explicit quota-only amendment in issue405 comment6006523068 applies; independent QA still required. No retries,credit purchase or billing changes.

PR-page rendering waiver is not needed for this non-UI contract. Project mapping is owned by the coordinator's existing Project task; no concurrent Project writes. New-head CI is recorded separately after terminal readback. No live release,merge,publish,deploy,protection,credential or readiness change.
