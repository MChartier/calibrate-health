# Issue433 implementation evidence

Purpose: retained nonmerged review evidence for issue433; owner is implementing task 01a11275-8618-75dd-9d39-ab2d6c2aa02a. Retain for the lifetime of this release-gate change and its review/recovery history. This branch is never a product merge target.

Source: MChartier/calibrate-health @ 9f8359c428a6e29dc0e5d8661636fb851035299e.
Actual target/base/merge-base: master @ 6b803fbc5ecd833cc4de5039e8ce495812a97e86.
Parent: none; one implementation commit directly on master. Ultimate target: master.

## Behavioral evidence

Environment: Windows host, Node v24.19.0. No production data or live release operations. All GitHub boundary scenarios use synthetic API objects in the maintained release-ci-gate.test.mjs at the source revision above.

- Before: cut-release.yml at the base created the PR then called the merge API without a CI read. The real incident and its exact run identities are retained at https://github.com/MChartier/calibrate-health/issues/433#issuecomment-6022835880.
- After: the same zero-job approval-expired failure is represented in the maintained regression and rejects finalization. Successful exact-candidate CI passes only with the five expected workflow paths and required successful jobs. Missing workflows, pending approval, failed/cancelled/timed-out/neutral/skipped conclusions, unknown job skips, wrong source/repository/event/branch, changed attempts and changed PR/master identities reject or reach a bounded timeout.
- A synthetic pending-approval response followed by successful CI passes after one polling interval. Perpetual pending approval reaches its deadline and rejects. No approval is automated.
- Regression sensitivity: temporarily disabling the workflow-conclusion rejection caused the maintained gate suite to fail. Exact original source bytes were restored, SHA256 766edf50afc4c06b0df00bfdc2f533b9967fdf5da15c4ec5a173d6b60ae42fef, and all 17 gate tests passed again. The variant was never committed or pushed.
- Existing immutable publication/receipt recovery tests remain passing; no publisher source changed. Existing exact-head API merge and ancestry/tree checks remain. The workflow has two CI reads, retains validated blocked candidates and calls publication only after finalization succeeds.

## Executed checks

- npm run test:release: 151 tests, 149 passed, 2 existing Linux-only shell tests skipped, zero failures. The skipped cases are legacy latest-index handling and shell config/manifest digest composition; neither implementation was changed.
- node --test scripts/release-ci-gate.test.mjs after exact restoration: 17 passed.
- YAML parse with unique keys using existing yaml package: valid; all four inline GitHub scripts compiled with AsyncFunction.
- node --check scripts/release-ci-gate.mjs and git diff --check passed.

## Full published scope

One commit 9f8359c428a6e29dc0e5d8661636fb851035299e; sole parent/base 6b803fbc5ecd833cc4de5039e8ce495812a97e86. Seven files, +371/-14:

- .github/workflows/cut-release.yml: CI gating, read-only Actions inventory access within existing caller grant, retained recovery and stage summary (+62/-4).
- scripts/release-ci-gate.mjs: maintained gate implementation (+148).
- scripts/release-ci-gate.test.mjs: maintained consequential gate regression scenarios (+129).
- scripts/release-workflow-contract.test.mjs: existing permission/token-read contract updates (+3/-3).
- package.json: register maintained gate tests (+1/-1); no version/dependency change.
- AGENTS.md: maintained release approval/recovery instructions (+6/-3).
- docs/architecture/0008-explicit-server-releases.md: maintained gate/recovery contract, correcting obsolete direct-push description (+22/-3).

No merge commits, sibling/parent imports, temporary harnesses, logs or evidence add/delete churn in the product branch. PR401 unchanged and not adopted; future integration must preserve this gate. Original investigation was outside the product worktree. All development helper files stay outside the product branch.

## Limitations and next gate

Non-UI change: no meaningful application screenshot flow. No live dispatch, release merge, package publish, approval, protection, credential or billing mutation. The existing bot workflow approval may still require human action; the change waits/fails closed and reports it instead of bypassing it. Unattended approval-free triggering remains a separate authorization decision. A repository administrator's required-status rules would supply server-side enforcement; current polling and merge are not atomic. Current configured write permissions are unchanged; only actions:read is inherited by finalization from the existing caller grant. Independent QA and live PR CI are separate pending gates; this evidence does not assert readiness.
