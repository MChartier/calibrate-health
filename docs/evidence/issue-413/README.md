# Paused weigh-in divider: actual application evidence

When Today is paused, the available weigh-in action lacks an upper boundary and reads as part of the pause message. The change adds one theme-aware hairline to the existing full-pane row, only in the paused branch. It preserves the lower row/footer boundaries and the active branch.

## Sources and capture

- Before: `29fb444ae4389ca81f3437d24685ed9badc43410`, verified live remote master and the assigned unstacked base.
- After: `7bc5c17b62785e7ef8abe048f5069320edc9fdc5`, implementation and regression-test commit.
- Host: actual `MCHARTIER_ZBOOK`, Windows, Chrome `154.0.8037.95`, Playwright. These are browser captures, not Android/iOS device evidence.
- Isolated source roots: `C:\Users\MChar\Documents\Codex\2026-10-04\task-4\baseline` and sibling `divider`. Neither uses another owner's checkout. Baseline is detached; implementation branch is `mchartier/paused-weigh-in-divider`.
- Each checkout ran `node .codex/local-environment.setup.mjs`. Baseline export: `npm.cmd --prefix mobile run build:web`. Current export: the same build invoked by `npm.cmd run test:ux`. Both build logs are retained here.
- Separate static servers: `node scripts/expo-web-static-server.mjs --port 44135` from baseline and `--port 44136` from divider. The unchanged server implementation is bound in `manifest.json`.
- Capture: from divider, set `CAPTURE_SOURCE` to the appropriate checkout, `CAPTURE_LABEL` to `before` or `after`, and `CAPTURE_URL` to its loopback origin; run `node node_modules/@playwright/test/cli.js test --config docs/evidence/issue-413/capture.config.ts` for each.
- The identical retained harness loads `/today` after `ux.install('paused', { foodDayStatus: 'PAUSED', foodEntries: [] })`. It uses the repository's synthetic auth/API fixture, frozen clock `2026-07-21T19:00:00.000Z`, en-US, America/Los_Angeles, reduced motion, scale 1, and waits for paused content, Resume, and fonts. Viewports are 1440×1000 and 390×844. The latter is a narrow browser viewport, not a native device.
- Shared normalization: `hideTransientPwaNotices` suppresses unrelated transient PWA status/alert notices in both builds. The compared UI is unaltered; the mouse is moved to (0,0). No crop, redaction, compositing, or image editing was performed.
- Every capture JSON records time, full source SHA, geometry, image SHA-256, browser version, and browser-loaded script SHA-256. The harness asserts each loaded script's response bytes equal the corresponding export file. This binds the running app to the separately built source, not just a checkout label.
- `manifest.json` binds exact capture, harness, fixture, configuration, source, build-log and image bytes. Use its commit-addressed link and SHA-256 from the PR. Future evidence-only commits do not change captured app behavior; captured SHAs must not be relabeled as later heads.
- Retained text uses Git-normalized LF. Log trailing whitespace and extra final blank lines are removed for diff hygiene; log content is otherwise unchanged. Original log bytes remain in the earlier evidence commit `573ad8712edbe82410417a152e1bf7e7a1005427`. Images are untouched.

## Observed behavior

All eight images were visually inspected. Before lacks the upper rule; After adds the full-pane upper hairline in both themes and both widths. The outline colors are `rgb(124, 129, 120)` in light and `rgb(137, 151, 137)` in dark, matching the row's existing lower hairline. The pre-existing adjacent footer boundary is unchanged.

`node docs/evidence/issue-413/pixel-diff.cjs` decodes original images for comparison without modifying them. `pixel-diff.json` reports exactly one changed scanline per pair: desktop x=176..1439 at y=857 (1,264 pixels), phone x=0..389 at y=629 (390 pixels). Every other pixel is identical, including text, row contents, lower boundary, resume button and navigation.

The existing paused-day interaction suite, extended with boundary assertions, passed on desktop, 390px touch/mobile emulation and compact 320px touch/mobile emulation: open/cancel/save weight, retain the rule with a saved 88 kg synthetic weight, resume to the active calorie/food view without a new upper weight border, and historical paused day/backfill. The 320×568 test reaches the explanation, Resume and weight entry at 200% text. Existing accessibility checks pass. Against pristine baseline, the new test fails specifically because expected top width `1px` is actually `0px`, proving it catches the reported defect.

The implementation uses shared React Native `StyleSheet.hairlineWidth`, theme outline color and the existing full-width `style` forwarding path. No native-specific fork or new focus target exists. Existing native component tests pass, including full-row interaction and wrapped text. Android/iOS emulator and physical-device execution were not performed.

## Supporting checks

- `npm.cmd --prefix mobile run typecheck`: passed.
- `npm.cmd --prefix mobile test -- --runInBand TodayWeightCard.test.tsx`: 4 passed.
- `npm.cmd --prefix mobile test -- --runInBand`: 212 suites / 1,047 tests passed.
- `npm.cmd run lint`: all backend/shared/API-client/mobile typechecks passed.
- `npm.cmd run test:expo-web:release`: 16 passed.
- `npm.cmd run test:ux` on isolated port 44134: 252 passed, 79 project/scenario skips; no snapshot updates or threshold changes.
- Paused browser suite: 10 passed, 2 skips (the short/200%-text scenario runs only under compact-phone); see `paused-flows.log`.
- Matched capture harness: 4 baseline and 4 current captures passed.
- `git diff --check 29fb444ae4389ca81f3437d24685ed9badc43410`: passed across the complete submitted change after log whitespace normalization (the earlier working-tree-only check did not cover committed logs).

See the PR's latest QA/receipt discussion for current CI, engineering review and independent QA state. This evidence records executed author validation; it does not award readiness or authorize merge/release.
