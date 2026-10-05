# Offline tracking and migration preparation evidence

Owner: sole issue421 implementation task on MCHARTIER_ZBOOK. Retain this record and all prior records on the dedicated non-merged evidence/issue421-preparation-d8a2ac14 ref for review and recovery. No product merge includes these operational artifacts.

Before source: 4728d4f75b70e6440a9778a42cd2224a300db725 (actual master base).
After source: 86c902330964ad9fb77c6938d53d26fde4c557f6 (captured product head).

The primary pair is the actual application from isolated baseline/current checkouts, built using repository setup:host and npm --prefix mobile run build:web, served by the repository Playwright static server. Open populated synthetic Today, wait for Daily balance, return HTTP503 from /auth/me and reload. Baseline redirects to Sign in; current code retains cached Today and pending-reconnection controls. Different final routes are the behavior being compared.

Both use Chrome 154.0.8037.95, 1440x1000, scale 1, light/reduced-motion, en-US, America/Los_Angeles and the same fixture clock (2026-07-21T19:00:00Z plus deterministic 16ms increments). The exact shared fixture and primary capture harness are adjacent. Shared hideTransientPwaNotices suppresses only unrelated transient PWA lifecycle notices. Actual outage/tracking UI is unaltered. No pixel edits or crops. All five images were opened and visually inspected.

Primary pixels: Before displays Sign in and saved-session restore failure. After displays cached Today, 1740 kcal remaining, cached breakfast and tracking controls.
Supplementary current-state images (not substitute Before captures):
- local-weight: true network-offline restart retains 87.9 kg on Today and one queued change. The harness writes this filename twice; retained final write is the true-offline scenario.
- local-food: local creation, repeated 300/350 kcal edits and restart retain visible Offline oats at 350 kcal with edit/delete controls. The executed flow subsequently deletes/reloads/reconnects and observes one creation, two edits and one deletion using synthetic idempotency receipts.
- failed-food: a controlled persisted nonretryable creation outcome in the actual browser IndexedDB store. The actual populated card Delete action opens the editor, which blocks unreachable Save and explicitly confirms discarding only the failed creation and dependent edit. Actual scenario completes discard and reload, verifying both remain absent. This is a synthetic failure injection, not an actual Firebase/server rejection.

Five final-source browser scenarios/captures passed (28.6s), including successful cold authentication with failed tracking hydration and later auth-outage restart, true-offline weight correction/deletion, food edit/delete replay and failure recovery. Local full mobile suite: 218 suites / 1096 tests at 09e42246 before the final Delete-handler correction. Final-head browser and typecheck cover that correction; CI reruns the full suite. Focused transaction/day-ordering tests:26. Typecheck and Knip passed. Logs are exact captured output. No native/emulator or Firebase rehearsal claimed.

Manifests bind source/tree, time, browser/viewport, image, fixture and harness hashes. Every captured JavaScript response hash was matched to the exact exported file; those bytes are retained in before/after-served-assets. Source revision, lockfile and tracked build/static-server scripts bind build inputs. Older evidence retains its original identities and is not silently relabeled.

Reproduce: place capture.spec.ts as e2e/expo-web/offline-workspace-capture.spec.ts beside fixtures.ts; place projection-capture.spec.ts as e2e/expo-web/offline-projection-capture.spec.ts for the After checkout. Set CAPTURE_SIDE=before or after and CAPTURE_DIR to output directory. Run node node_modules/@playwright/test/cli.js test --config playwright.expo-web.config.ts e2e/expo-web/offline-workspace-capture.spec.ts [e2e/expo-web/offline-projection-capture.spec.ts for After] --project=desktop-chrome --workers=1. Build beforehand as above.

Complete merge diff:69 files,2818 additions,103 deletions. Maintained product changes, required schema/contracts, regression tests and343-line operator runbook only; zero operational capture/log/bundle files. The runbook is retained because staged identity/session/MCP/Wear/lifecycle and migration stop/resume contracts are part of the authorized preparation outcome. The prior a10 checkpoint had46 files,+1901/-51; growth is maintained projection/cache/query/recovery implementation and regressions, not evidence churn. Exact current composition is adjacent. Temporary untracked capture harnesses are retained here before removal from the product worktree.

Firebase runtime lifecycle/security-event integration and authorized real-project rehearsal remain outstanding; no GCP readiness, import, credential change, deployment or release is implied. Final CI/review and exact PR body/readback identities belong to the final checkpoint record.
