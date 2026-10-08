# Issue447 preparation evidence

This retained evidence ref is owned by the issue447 implementation task and must
not be merged into a product branch. Keep it while the PR or its receipts remain
reviewable. It contains synthetic observations and validation, not a release.

The proposed change is `a8539c3b90bd8c69a761c234869e5a0553f8ed08`, targeting
PR441's branch at `0c26cea12e3ecdbc962eebaeb140af35f54ab95a`. The ultimate target
is master `9dc0739e36168aa273530fe00ae5f85fb9c8a3fe`; the source merge-base is
`4cbcbc740fbe5fa5646b4de31951c79a653176d5`. PR441 stays open/unmerged and unchanged.
Managed-hosted PR450 remains a separate integration dependency; its UI/source is
not imported into this child. The fixed Little Say PR42 planner/retirement design
at `05f3b8977eaf94e49b9afcfe67c33916395442f2` is a design reference, not a parent.

## Observable behavior

The parent provides the separate manual server chooser and native/OTA operations.
It has no unified selective planner. This is non-UI tooling; the meaningful evidence
is CLI/JSON planning, exact worker arguments and durable state transitions.

| Synthetic starting state and action | Expected and observed |
| --- | --- |
| All verified artifact inputs match; execute the no-change plan | No selected stages and zero journal/candidate/provider writes. |
| Change just server, Android native, iOS native, Android bundle or iOS bundle | Each selects only its corresponding worker; compatible OTA retains the native runtime. |
| Change server and both native inputs | Select Android, iOS, then server; maintain paired Android codes and an independent iOS allocation. |
| Lose the first provider response, then retry twice | Retain intent, reconcile the single operation, complete it, and reuse the same result; one provider start total. |
| Retry an OTA publication with no visible provider result | Reject instead of issuing a duplicate update. |
| Prepare iOS build and upload arguments | Freeze existing build credentials, select an exact build ID for upload, and never claim processing or rollout. |

[Actual JSON, inputs and worker arguments](behavior.json) contains these observed
results. [Complete scope](published-scope.json) inventories both ordered commits,
their parents/paths and all 86 final changed files using hashes of exact committed
bytes. Reserved README/deployment files are unchanged. No development evidence
appears in the product commits.

Maintained tests additionally exercise incompatible OTA, source/configuration drift,
failed/missing CI, exact tree guards, partial completion, signed/attested receipt
rejection, provider ambiguity, concurrency, cleanup failure and interrupted
retirement/readback. Logs are retained verbatim here. They use fixtures/mocks;
passing them does not establish a live EAS, Apple, Play or registry operation.

## Checks and limits

- Release suite: 272 passed, 2 skipped. Native-release suite: 273 passed.
- Operations: 25 passed, plus the in-memory synthetic-alert check. Wear emulator
  unit suite: 19 passed. Deployment unit suite: 26 passed.
- Release configuration/acceptance consistency passed.
- Final affected checks after the complete suites: workflow/source-snapshot and
  receipt-policy/OTA tests passed. Their separate logs cover the last authority
  corrections without claiming an expensive suite was rerun.
- Raw actionlint 1.7.12 fails on parent and final source. There are 61 inherited
  diagnostics and seven added diagnostics, all for documented GitHub Cloud
  `queue: max` or `job.workflow_sha` features absent from its current schema.
  [Exact comparison and primary sources](actionlint-compatibility.json) records
  this limitation; it is not a clean-lint claim or broad suppression.
- No actual release workflow, paid build, credential/signing setup, Apple/Play
  upload, image/OTA publication, deployment or device installation was performed.
  Real macOS IPA/provider validation and device testing remain unrun.
- Exact-head hosted CI and configured engineering review are reported separately
  on the PR; this evidence does not declare independent QA or human readiness.

## Reproduction and exact identities

`manifest.json` hashes the exact retained bytes, including the reproduction script
and raw logs. The source-file hashes in the scope inventory come from Git blobs,
not Windows newline-normalized worktree files.

To repeat synthetic observations, place an exact checkout of the source head in
`release-447` beside `reproduce.mjs`, retain the pinned parent/master objects, and
run the script from that containing directory with Node. Install actionlint
1.7.12 separately and set `CALIBRATE_ACTIONLINT` to its executable if it is not on
PATH. The script imports source modules, exercises mocks, reads Git objects and
lints extracted workflow bytes. It does not dispatch workflows or contact release
providers. Tests are run separately with the maintained npm commands listed in
the logs. Output is written to a fresh `release-447-published-evidence` directory.
