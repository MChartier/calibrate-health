# Compact rail implementation checkpoint

Desktop users previously lost 176px to a sparse sidebar. The web-only rail uses an 88px column,
puts icons above readable Today/Progress labels, and keeps both destinations near the top. Its icon
pill and label underline show selection; the whole link retains keyboard focus and guarded navigation.

This is a **paused implementation checkpoint**, not completed QA or a readiness claim. The coordinator
requested a natural published checkpoint so the single implementation slot can service another PR.

| Before: Today, 1024px, light | After: Today, 1024px, light |
| --- | --- |
| ![Before: wide sidebar](before/today-1024-light.png) | ![After: compact rail](after/today-1024-light.png) |

| Before: Progress, 1440px, dark | After: Progress, 1440px, dark |
| --- | --- |
| ![Before: wide sidebar](before/progress-1440-dark.png) | ![After: compact rail](after/progress-1440-dark.png) |

## Revisions and capture provenance

- Baseline/base: `29fb444ae4389ca81f3437d24685ed9badc43410`, verified remote master when work began.
- Changed application source: `f107804eb7572e5142b0a66d6d532ff08013d115`.
- The subsequent evidence commit changes only this evidence directory. Captures are not relabeled
  as coming from that later commit. No parent PR or other worker's code was imported.
- Separate Windows checkouts, separate Expo exports and separate loopback static servers were used.
  Baseline application source was unchanged; only this capture spec was copied in as an untracked
  harness. Current application files were exported from the working tree, then committed byte-for-byte
  before capture (the intervening follow-up corrected only a Jest test mock). The source file digests,
  sanitized build logs, capture harness and fixture digests are recorded in `manifest.json`.
- Setup in both checkouts: `node .codex/local-environment.setup.mjs`.
- Build in each checkout: `npm.cmd --prefix mobile run build:web`.
- Serve: `node scripts/expo-web-static-server.mjs --port 44112` (Before) / `--port 44111` (After).
- Capture from each matching checkout: set `CALIBRATE_EXPO_WEB_BASE_URL` to its loopback server,
  `CALIBRATE_RAIL_SOURCE_SHA` to the corresponding full SHA, and `CALIBRATE_RAIL_CAPTURE_DIR` to
  the respective output directory. Set `CALIBRATE_RAIL_BASELINE=1` only for Before. Run
  `node node_modules/@playwright/test/cli.js test e2e/expo-web/compact-rail.spec.ts --config=playwright.expo-web.config.ts --project=desktop-chrome --workers=1`.
- Every per-image JSON records source, UTC capture time, browser version, viewport, scale, theme,
  route, geometry, image SHA-256, and hashes of loaded JS/CSS. The capture requests those actual served
  assets and asserts their bytes match that checkout's `mobile/dist` files. Preserve these originals.
- `manifest.json` binds every original image and JSON plus the harness/fixture/source identities.
  Use the evidence commit's full SHA in reviewer links to bind the provenance record itself.

## Shared fixture normalization

Both runs use the repository's synthetic `populated` and `empty` API fixtures, frozen clock
`2026-07-21T19:00:00.000Z`, `America/Los_Angeles`, `en-US`, reduced motion and device scale 1.
Chrome version is recorded per image. The same capture spec is used for both sources; baseline mode
skips only new-rail-specific geometry assertions. It does not change the old application's UI.

The shared `hideTransientPwaNotices` helper hides unrelated Back online, Update ready, Update failed,
and Updating Calibrate notices in **both** runs; service workers are blocked. This is fixture
normalization, not evidence of those lifecycle notices. Rail, page, shell and account controls are
not hidden. The 200% text helper scales text and icon-font glyphs on both sources; it is simulated
text enlargement, not a claim of actual browser zoom or native device font scaling. No images were
cropped, redacted, painted, generated or reconstructed.

## Observed behavior and checks

| Scenario | Expected | Observed / evidence |
| --- | --- | --- |
| Today/Progress, 1024/1440px, both themes | Reclaim sidebar space with full labels and stable reading columns | All eight changed-source cases measured 88px. Matched originals show the prior 176px rail and current icon-over-label group. Main content moves into the recovered region without a duplicate spacer. |
| Empty Today; Tab to Progress, Enter, Back/Forward, Ctrl-click Today | Visible focus, correct selection/history, canonical new-tab route | Focus outline visible in `keyboard-focus-1440-light`; tested route/selection/history assertions passed and Ctrl-click opened `/today` without leaving Progress. |
| Resize 1023 → 1024 → 820 → 390 → 320 → 1440px | Bottom tabs below the unchanged breakpoint, compact rail above | All transitions passed. `responsive-*` pairs retain each actual rendered state. |
| Short 1024x480 viewport with 200% text | Full labels, reachable links, no document horizontal scroll | New rail grows intrinsically; labels remain readable. Original full captures include the enlarged shell and scrolling content. |
| Unsaved Profile details/Preferences, then tabs/header/Back | Cancel keeps draft; confirmation departs; pending save blocks departure | Existing nested settings browser scenarios passed. |
| Member/admin settings, direct routes, expanded Trend, weight overlay | Existing permissions, shell and return behavior | Existing server-admin and nested-route suites passed. |

Executed: mobile typecheck; 30 focused component tests (4 suites); 16 web release checks; both
Expo web exports; 9 focused browser scenarios on each source; 19 existing desktop navigation,
keyboard and permission scenarios (1 opt-in screenshot scenario skipped); `git diff --check`.
The first browser run exposed incorrect DOM tab semantics and a selector mismatch for unchanged
bottom tabs; both were corrected before these captures. The first new Jest suite had a mock-hoisting
error; its corrected run passed. These earlier failing runs are not represented as passing checks.

Pixel inspection at this checkpoint covered Today 1024 light and Progress 1440 dark pairs, plus
changed keyboard-focus and short enlarged-text images. Full remaining pixel review, full mobile/lint
and applicable UX accessibility/visual gates (including expected desktop snapshot changes), additional
FAB/notice/reload/zoom checks, draft PR publication/rendered-PR inspection, current-head CI,
configured Codex review/fixes, and independent QA remain pending. No native runtime checks ran.

Acknowledged workflow-v3 execution pin `f0919b184b6344d6279178b2388190936ca432a9` and final
pr-review-v3/queue standards at `97e5583c8355f3673aad0835c0ce3ca1486aeb8b`, including trusted
QA comment-ID/full-body-digest receipts and append-only superseding verdicts. No readiness label,
merge, release or deployment is authorized by this checkpoint.
