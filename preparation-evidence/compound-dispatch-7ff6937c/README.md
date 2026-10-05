# Final compound dispatch checkpoint

Owner: issue421 implementation task01a10cfe-a79f-7198-9e8f-2b4dc6703031. Retain this nonmerged evidence ref for the lifetime of issue421/PR423 and subsequent review; do not silently replace historical records.

Product head 7ff6937c9cd43fea1e239b537b6f77adfcbf1dda; actual target master acc8a30d6cde7477f08f0b7ace23df4047d21354. Complete branch-only inventory:26 commits. Complete merge diff:89 files,+4223/-190. Retained changes are product code, required schema/contracts, maintained regression tests and operator runbook. No temporary capture harness, screenshot archive, output log or export bundle belongs in the product diff. Earlier25-commit/88-file and24-commit/83-file records remain immutable.

Finding4189107104: one dispatch lock now covers reopening plus dependent creation, including retryable fallback. The maintained test holds the first write, starts a competing day completion, then releases it. Exact prior ed170e7e source fails with OPEN,COMPLETE,food.create; final passes OPEN,food.create,COMPLETE. The experiment script restores the fixed source in finally and binds baseline source/test hashes.18 focused tests pass; mobile typecheck and current-source export pass. The export ran before commit with the identical product source.

Browser log transparently contains one passing actual calendar reopening/edit/completion flow and one failed synthetic two-tab setup. The latter assumed a completed day exposed Add food, which current UI does not permit, and was removed rather than claimed as concurrency evidence. No product change was made to expose that unsupported flow. Compound concurrency is demonstrated at component/dispatch level. The13 actual browser scenarios at ed170e7e remain applicable; this final change touches only the completed-day AddFoodSheet compound submission and its test/runbook.

## Matched UI evidence applicability

Five pairs and59 API-byte-verified artifacts remain at evidence commit3990f461abdc28d9d3091cb001f65f72c9264368, preparation-evidence/boundary-fixes-ed170e7e. Before source acc8a30d6cde7477f08f0b7ace23df4047d21354; After source ed170e7e8a716e6a1b71b726bb49a0a184c01ad6. None of those flows submits AddFoodSheet on a non-OPEN day. Therefore this final compound-lock change does not affect captured outage, logout, failed-food-edit, failed-weight or storage-failure states. Do not relabel captures as from 7ff6937c9cd43fea1e239b537b6f77adfcbf1dda. Original manifests, running bundles, fixture/harness bytes and pixel observations remain preserved. Direct private GitHub rendered-page access remains unavailable; local rendering is supporting evidence only, not a waiver.

## Boundaries

No live Firebase access/import/provisioning/credential changes/cutover/deployment occurred. Runtime Firebase lifecycle/session/Wear integration and separately authorized existing-test-project rehearsal remain unfinished. GCP422 remains blocked on relevant foundation. Native emulator/device and actual SQLite runtime behavior are not certified by these browser/component checks. Current CI and engineering-review readbacks will be appended in a separate immutable checkpoint; independent QA remains pending.
