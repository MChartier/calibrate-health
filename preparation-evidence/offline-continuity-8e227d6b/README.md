# Offline continuity: matched base-to-final evidence

Owner: sole issue421 task on MCHARTIER_ZBOOK. Purpose: review/recovery evidence on
non-merged evidence/issue421-preparation-d8a2ac14; retain alongside all prior receipts.
Before: 4728d4f75b70e6440a9778a42cd2224a300db725, actual PR master base.
After: 8e227d6b049e465a060ea407d306bb84c0de1d05, current implementation head.

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
After build log belongs to 8e227d6b. Earlier intermediate images/manifests remain
retained under their original source names and are not the PR comparison baseline.

Reproduce capture from each checkout (PowerShell):
$env:CAPTURE_SIDE='before' # or after
$env:CAPTURE_DIR='<retained-output-directory>'
# Place the exact capture.spec.ts beside the source's e2e/expo-web/fixtures.ts.
node node_modules/@playwright/test/cli.js test --config playwright.expo-web.config.ts e2e/expo-web/offline-workspace-capture.spec.ts --project=desktop-chrome --workers=1

Final source capture execution: four flows passed (4/4, 26.1s). The primary
Before/After pair uses the same original capture harness and exact base fixture.
Supplemental current-state images are not substitute Before captures:
- local-weight.png: true-network-offline restart after saving 87.9 kg, one pending
  operation; Today visibly shows the saved value. The capture harness saves this
  name more than once; the retained final write is the network-loss case.
- local-food.png: auth outage, locally added Offline oats, two calorie edits,
  reload; the food row visibly shows 350 kcal, three pending changes and edit/delete
  controls. The same executed case then deletes, reloads, reconnects and observes
  one server creation, two edits, one deletion using synthetic idempotency receipts.
The exact supplemental projection-capture.spec.ts and fixture bind every setup,
request handler and capture action. Each supplemental manifest binds source,
served response bytes, image and harness hashes separately. Images were opened
and pixels inspected; no pixels were changed. The primary pair remains the
base-to-final comparison. Backend/Firebase behavior is not inferred from images.

The auth scenario also verifies successful cold auth followed by failed tracking
hydration and another auth-outage restart retain cached food and projected weight.
The weight scenario performs a second local correction and deletion across further
offline reloads. Exact UI controls use their actual accessible result-state names.

Local full mobile suite: 218 suites / 1090 tests passed before the final legacy-
nutrition guard; 27 focused overlay/receipt/replay tests passed after that guard.
Typecheck passed. CI subsequently reported only an unused type export; ba69edf2672d2b3fe5edf5cbd17d2bc0e49511d0 removes that export, has no runtime effect,
and local Knip passed. Captures remain honestly identified as 8e227d6b. Later
final-head CI/review and any applicability reassessment belong in checkpoint
records, not silently substituted source identities.

No native emulator/physical-device UI or real Firebase rehearsal is claimed.
Runtime Firebase lifecycle/security-event integration remains unfinished.
