# Current-master integration for issue421 / PR423

Owner: the existing issue421 implementation owner. Retain this evidence on the non-merged evidence branch for reviewer access and history. No product evidence churn.

## Source and scope

Final head: 75578e5ac57a05ba0f06146598b314a01eafb2ae. Actual master/base: 52bdc324fa2215e2d35e488a2bfaadd59cdca3ed. Prior parent head: 7b83b3255c263efbb22fd1be1be3124bc46fc23c. Additive merge 9dcd23c0b52aca690fdc5688a3b52a34041afc81 preserves human merges424/425 without history rewrite. Child428 remains 0ee7d098589beb218c4f34b370ba556f25de4498; no child edits.

Seven shared paths assessed: Prisma schema, Progress screen/test, Today, API client, rollback script/test. Three textual conflicts: both Progress imports retained; rollback contract updated to the combined 48-migration ledger. Both goal-pace and Firebase migrations remain. Existing migration bytes were not rewritten.

Initial full merge diff against actual master:107 files,+5461/-252. Final:109 files,+5497/-255. The two additional files are the narrow goal-pace recovery integration and its two maintained regression cases. Complete diff and commit inventory are retained here. No logs, screenshots, ad-hoc harnesses or operational receipts occur in the product merge diff.

## Observed integration failure and correction

The first integrated browser run passed22, failed2 goal-pace light/dark retry scenarios, skipped1 compact-phone-only scenario on desktop. A synthetic503 correctly set pending reconnection, but the new pace dialog retried through the gated client. The final change verifies the existing same-account reconnect contract before preview/retry, preserving the original operation ID. Failed verification performs no additional write. Twelve component tests cover this, including both verification outcomes. The original failing log is retained; the final browser log is separate. This restores master's intended retry behavior under PR423's offline contract; it adds no new visible layout.

## Evidence applicability

Existing genuine Before/After images remain at commit3990f461abdc28d9d3091cb001f65f72c9264368 (outage/logout/food/weight/storage) and fa5b60870be938da789d3a086e97628b1e98b120 (resume). Their captures remain honestly identified as baseline acc8a30d6cde7477f08f0b7ace23df4047d21354 versus ed170e7e8a716e6a1b71b726bb49a0a184c01ad6, or8868e649f5d53ea62b33f66455d5bebae1ecd90f for resume; no identity is replaced.

The new master changes Progress goal editing, completed/historical-day target selection and paused Today weight-row border. The main published pairs show Sign In/open Today and food editing; OPEN Today still returns currentTarget, and the paused-only border is absent. Auth and food-dialog baseline source did not change. Final pace recovery changes only the Progress dialog's request path, absent from these pairs. Thus these images still demonstrate the same base-to-proposal behavior; none is relabeled as a new capture. Paused Today and goal-pace behavior are separately exercised in the final browser run, including retained actual paused screenshots. Shared synthetic fixture, frozen clock, light/dark themes and original PWA-notice normalization remain as documented in original manifests.

Final running-build record binds the source/tree and every served JavaScript asset to retained exported bytes. Browser tests use synthetic routed APIs, not a real Firebase provider or actual device. Native/emulator and real-provider rehearsal remain unexecuted.

## Contract and limits

readFoodPause/readFoodDay/dayIntents contracts are unchanged. Namespace dispatch/replay locks, durable receipts, explicit historical backfill and pending pause guards remain; no pending data deleted or rewritten. Local provider remains default. Firebase runtime/lifecycle/Wear/external security-event integration and real import/cutover remain unfinished.

All TypeScript surfaces passed on the integrated tree; the changed mobile surface passed again after the fix. Integrated-base mobile232 suites/1241 tests, backend56 affected tests, API69 tests, rollback14 tests, schema validation and generated API contract passed. The final twelve pace tests and web export passed. See final browser and CI readbacks for exact final outcomes rather than inferring from prior passes.

Local Docker daemon is unavailable (missing dockerDesktopLinuxEngine pipe); no local database runtime claim. Exact-head Database Upgrade CI owns populated upgrade, combined migration and rollback execution. Configured engineering review previously refused due quota (PR423 comment6006048888); no repeated quota requests. Readiness remains withheld pending configured review and independent QA. Private GitHub UI rendering remains unverified; API-Markdown local renders are evidence of presentation only, not a waiver.
