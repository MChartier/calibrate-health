# PR423 current-master-to-final evidence

Owner: issue421 task 01a10cfe-a79f-7198-9e8f-2b4dc6703031 on mchartier_zbook. Purpose: implementation evidence for PR423. Retain this record and historical identities on the dedicated nonmerged evidence/issue421-preparation-d8a2ac14 ref. Do not merge these captures, logs, bundles or temporary harnesses into product. No live account, Firebase provisioning, import, credential, cutover or deployment action occurred.

## Bound revisions and builds

Before: acc8a30d6cde7477f08f0b7ace23df4047d21354, actual master including the human-merged PR410. After: ed170e7e8a716e6a1b71b726bb49a0a184c01ad6, exact current PR head. No unmerged parent. The four original Before captures are copied byte-for-byte from immutable evidence a59043fec17a316a4d9dfe6f9b6187e31f8d8342; they keep their original times, source and digests. The storage-failure Before is newly captured from the same isolated baseline export. All five After captures are newly captured from the committed final export. Every observed JavaScript response hash matches a retained exported bundle. Build logs, exact fixture, harnesses, runner and Playwright configuration are retained. Per-pair manifests bind the full source/tree, capture time, actual browser version, image hash and fixture/harness hashes. No older capture is relabeled.

## Reproducible matched scenarios

Chrome 154.0.8037.95; 1440x1000, scale 1; light, en-US, America/Los_Angeles; populated synthetic user17 fixture; fixed July21 2026 clock with the fixture's 16ms step. The same fixture and respective scenario harness bytes run in both isolated checkouts. Shared hideTransientPwaNotices suppresses unrelated transient PWA lifecycle notices only. No cropping, generated images, redaction or pixel modification.

1. Outage: warm Today, return auth/me503, reload. Before redirects to Sign in; After retains Today and Pending reconnection. Both captures pass.
2. Logout: explicit offline logout, reconnect, reload. Before restores Today with zero revocations; After remains Sign in with one. Baseline completes its screenshot/manifest and then reports its genuine existing unhandled Failed to fetch error. Its failed capture log is preserved, not claimed green. After passes.
3. Food: persist failed400kcal and pending450kcal edits for entry31/date July21. Before displays server360kcal and enables Save. After preserves450kcal, blocks Save and offers original retry or explicit entry-scoped discard. After opens the new confirmation absent in baseline. Both pass.
4. Weight: persist failed87.9kg add and pending88.5kg correction for July21; enter89kg in both. Before enables Log weight; After blocks Save/Delete and lists both queued values before confirmed discard. After opens the new confirmation absent in baseline. Both pass.
5. Storage/network failure: force sign-out marker writes to throw a synthetic QuotaExceededError and return503 from logout, then click Log out. Both reach Sign in, but only After visibly explains pending server sign-out and the need to reconnect before closing. Baseline completes its screenshot/manifest and then reports its genuine unhandled503 error; it is not a passing capture test. After passes. Baseline lacks durable sign-out marker writes, so the same storage interceptor has no matching write there; this is an implementation difference, not a hidden fixture change.

All ten originals were visually inspected. The changes above are visible, controls and values are legible, and the warning wraps within the viewport. Focus naturally changes when After opens its new confirmation; this is disclosed and no compared UI was hidden. The main PR embeds the matched pairs. Local rendered-body verification is separate and does not substitute for private GitHub UI inspection.

Reproduce exports with npm run build:expo-web at each source. Copy the retained harnesses into e2e/expo-web; offline-capture.spec.ts is named offline-workspace-capture.spec.ts there. Set CAPTURE_SIDE and CAPTURE_DIR, then run node node_modules/@playwright/test/cli.js test --config playwright.expo-web.config.ts --project desktop-chrome --workers 1 HARNESS. capture-boundaries.cjs runs serial captures. Existing baseline defects are preserved as described, not normalized away.

## Behavior and validation

- Full maintained mobile suite: 224 suites / 1169 tests passed on the final product code before commit; subsequent changes were test-fixture/documentation only. Final typecheck and Knip pass. Exact committed export passes.
- Final committed browser suite: all13 offline workspace scenarios pass, including real two-tab food-before-completion ordering, storage-write failure with successful revocation, and simultaneous storage/network failure followed by actual offline-to-online in-process recovery.
- The initial two-tab test failed because deterministic UUID counters restarted per tab. The maintained test gives the second tab a distinct deterministic prefix; the original failed log and its generating fixture script remain retained. The versioned API observer and actual navigator.onLine transition are reflected in the final maintained test. No product failure was masked by weakening assertions.
- Current-head CI: all five workflows pass (Builds, Database Upgrade, Lint, Production Container Scan, Tests), bound to ed170e7e8a716e6a1b71b726bb49a0a184c01ad6 in ci-ed170e7e.json. Classifier-skipped jobs remain explicitly skipped, including device/emulator jobs. Successful database logs verify immutable mapping, deletion cascade, monotonic credential version and core data across47 migrations, plus restore/re-upgrade through0045. These are real synthetic PostgreSQL executions, not mocks.
- Prior integration checks and foundation evidence remain at a59043fec17a316a4d9dfe6f9b6187e31f8d8342 and earlier historical refs; their identities are preserved.

## Engineering finding dispositions

4188919005: every supported tracking producer reads durable state under the shared namespace dispatch lock. Web Locks serialize tabs; no-lock browsers queue instead of direct writes. Native uses one-runtime serialization. Original request identity and durable ordering are retained. Newly enqueued work requests eligible replay; unchanged deferred work keeps its backoff. Tests cover a stale provider snapshot, concurrent dispatch, different accounts and stale account bindings.

4188919012: intent-persistence failure no longer prevents cleanup or server revocation. Unsaved intent is retained in process; native credential material remains native-only. An unreadable existing durable record is not overwritten. The UI discloses the simultaneous storage/network failure limitation. Restart durability cannot be guaranteed without working persistent storage; the app must remain open until revocation succeeds. Tests cover both platforms, read/write failure, memory retries and successful revocation despite a failed post-revocation write.

The later no-findings review on c5f96440 did not resolve these findings. Both were fixed substantively at ed170e7e8a716e6a1b71b726bb49a0a184c01ad6, replied to in their original threads, and a single review of the actual fixes was requested. Final configured review and independent QA status are retained in the separate checkpoint.

## Full scope audit

Actual-base net diff: 88 files, +4170/-171; 25 branch-only commits. Every commit is listed, including the integration merge; the full diff and file-by-file categories are retained. Pre-boundary scope at c5f96440 was83 files,+3854/-167; the new88-file scope adds maintained shared dispatch helpers and failure/concurrency regression coverage. No product evidence cleanup was needed beyond previously removed trailing whitespace: all temporary captures, exports, logs, readbacks and this audit remain outside the product diff. The operator runbook is retained because it documents safe preparation use, current guarantees and unfinished lifecycle/cutover gates. No useful tests or historical evidence were deleted.

No native emulator/physical-device UI or real SQLite runtime certification is claimed. Firebase runtime lifecycle/session/Wear/external-security integration and cross-store deletion remain unfinished; GCP422 is not ready from this stage. Real-project rehearsal remains unauthorized/unexecuted. Draft only; no readiness, human approval, merge, release or deployment.
