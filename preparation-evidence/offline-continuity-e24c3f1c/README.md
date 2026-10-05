# Offline continuity: matched base-to-final evidence

Owner: sole issue421 task on MCHARTIER_ZBOOK. Purpose: review/recovery evidence on
non-merged evidence/issue421-preparation-d8a2ac14; retain alongside all prior receipts.
Before: 4728d4f75b70e6440a9778a42cd2224a300db725, actual PR master base.
After: e24c3f1cd85756e3fc15d1ea9cc7ec8a03a08ad2, current implementation head.

Actual application evidence, not mockups: two isolated checkouts, repository
setup:host, npm --prefix mobile run build:web, then repository Playwright config
and static server. Same Chromium 154.0.8037.95, 1440x1000, scale 1, en-US,
America/Los_Angeles, light theme/reduced motion. Both use the exact adjacent
capture harness and fixtures (matching hashes in both manifests). Install the
populated synthetic fixture, open Today and wait for Daily balance, then change
/auth/me to HTTP503 and reload. Before redirects to Sign in and loses workspace
access; After retains cached Today, visible pending reconnection and tracking
controls. Final URLs differ because that is the behavior being compared.

Both images were opened and visually inspected. The final After keeps primary
tracking actions within the viewport and displays cached calorie/food state.
Shared fixture normalization hides only unrelated transient PWA lifecycle notices
through hideTransientPwaNotices; the actual outage notice and compared UI are
unaltered. Fixture clock is frozen at 2026-07-21T19:00:00Z with deterministic
16ms read increments. No real user data. No crops or pixel edits.

Manifests bind source/tree, capture time, browser/viewport, fixture/harness and
image hashes. Captured JavaScript response bytes were independently matched to
each checkout's exported file. Those exact served bundles are retained in the
adjacent before/after-served-assets directories. Source and locked dependencies
plus the tracked build/static-server scripts establish reproducibility. Adjacent
After build log belongs to e24c3f1c. Earlier intermediate images/manifests remain
retained under their original source names and are not the PR comparison baseline.

Reproduce capture from each checkout (PowerShell):
$env:CAPTURE_SIDE='before' # or after
$env:CAPTURE_DIR='<retained-output-directory>'
# Place the exact capture.spec.ts beside the source's e2e/expo-web/fixtures.ts.
node node_modules/@playwright/test/cli.js test --config playwright.expo-web.config.ts e2e/expo-web/offline-workspace-capture.spec.ts --project=desktop-chrome --workers=1

Final e24c3f1c actual browser execution: capture and both maintained
 e2e/expo-web/offline-workspace.spec.ts cases passed (3/3, 6.4s). The maintained
scenarios observed a local weigh-in queued during auth outage, retained after
reload, sent once following same-account recovery, and immediate durable local
saving when Playwright network-offline mode made navigator.onLine false.
Focused local suites: 42 auth/cache/outbox/reconciler tests and 48 tracking-mutation
tests passed; mobile typecheck passed. CI/review status belongs to the separate
final checkpoint rather than this immutable capture receipt.

No emulator/physical-device UI or real Firebase rehearsal is claimed. Runtime
Firebase lifecycle and external security-event integration remain unfinished.
