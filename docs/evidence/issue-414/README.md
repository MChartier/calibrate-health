# Planned pause visibility evidence

People could save an expected resume date but could not see it on paused Today or inspect their planned future pause in the calendar. Today now uses its existing heading label to show the saved intention. Dashed pause badges identify future planned days; actual past/today status and completed-day colors remain independent. Resume still requires an explicit action.

## Revisions and environment

- Actual Windows host: `MCHARTIER_ZBOOK` (`os.hostname()` returns the case-equivalent `mchartier_zbook`). Node 24.19.0, installed Chrome, Playwright 1.61.1. Browser version, device scale, theme, locale, timezone and viewport are recorded in each capture JSON.
- Before: parent PR410, `d8e55c105834093f889b2cff2a5c96d224cc6e80`, isolated `task-6/baseline` checkout. This is the required completed-calendar parent, not unrelated master or PR415/418.
- After application build: `382d279ccff26901551f7b41b174c1069895aa25`, isolated `task-6/planned-pause` checkout. Later commits only add tests/evidence; no captured application behavior is relabeled as a newer build.
- `before-build.json` and `after-build.json` bind all 174 build artifacts to clean source checks before/after the recorded build command and timestamps. Capture JSON verifies that the actual served entry-script bytes equal the recorded build's on-disk bytes. Both builds use the repository static server on separate loopback ports (43410 Before, 43414 After).
- All health information is synthetic, intercepted by the retained real-app browser harness. No production account/database, private intake screenshots, emulator or physical device was used.

## Fixture and capture contract

Run the actual application from its built export, using `e2e/expo-web/planned-pause.spec.ts` and the existing `fixtures.ts`. Each capture binds the exact harness/config/fixture bytes by SHA-256. The common clock begins July 21, 2026 at 19:00 UTC and advances 16ms per clock read; generated IDs are deterministic. Account/browser timezone is America/Los_Angeles, locale en-US, reduced motion, scale 1, fonts ready. Matched viewports are desktop 1440x1000 and compact browser 320x720, in light/dark themes.

Shared normalization: the existing `hideTransientPwaNotices` hides unrelated late PWA notices in both builds. It does not hide pause, mutation, offline or calendar UI. Screenshots are original PNG bytes: no cropping, editing, generated images or pixel normalization. The baseline cannot navigate to August, so its matched calendar pair stays in July; After-only target-month captures demonstrate the newly accessible boundary rather than pretending a baseline August view existed.

`manifest.json` binds every retained image, capture record, build record, log and evidence script. The PR links the manifest by immutable commit; its exact SHA-256 is also recorded in the author handoff. The manifest deliberately does not contain its own digest.

## Observed behaviors

| Starting state/action | Intended and observed result | Direct evidence |
| --- | --- | --- |
| Active July20 pause, expected August3; open Today and calendar | Before has generic copy, blank future days and disabled next-month control. After shows August3, dashed planned July22-August2, unmarked August3; future dates reject click/Enter activation. July16-19 retain green/yellow/orange/unavailable completion. | Matched `dated-today-*` and `calendar-*` pairs; After `target-month-*`; browser acceptance log. |
| Use the real pause form, then edit a historical paused day | Form saves the chosen date and Today updates. A controlled earlier-start fixture variation then allows historical backfill without ending the active pause. | Browser acceptance scenario `real pause form`; focused component/cache tests. |
| Reject resume, then retry successfully | Error remains visible with the actual paused state and saved expectation. Retry opens today, removes forecast, and retains prior paused history. | Matched `matched-failed-resume` and `matched-recovered-calendar` pairs, both desktop/compact. |
| Due prompt: reject update, remove expectation, later explicitly resume | Failed update retains the saved plan. Until I resume produces bounded current-month future markers. Due-prompt resume clears projection. | `failed-update`, `open-ended-calendar`; browser acceptance log. |
| Target January2; shorten, lengthen or clear it; reopen/navigate | January1 is planned and January2 excluded; future-only months request no future history. Refetch changes the plan across surfaces and clamps an out-of-bounds month. | `year-boundary`; navigation/refetch browser scenario and component regression. |
| Due/overdue, unavailable/invalid metadata, cached failure/offline | Actual tracking remains paused. No due/overdue future interval or fabricated date. Cached plan is explicitly labeled stale/offline; recovery restores current metadata. | `overdue-today`, `unavailable-metadata`, `stale-plan`, `offline-saved-plan`; metadata/date-only tests. |
| Retryable resume failure accepted by browser outbox; reconnect | Real IndexedDB contains the resume operation; replay succeeds and refreshes pause/day/calendar together. Prior paused history remains. Fully offline mutations retain the existing React Query connection-pending behavior. | `replayed-resume`, browser IndexedDB assertion, replay and refetch-race regressions. |
| Compact and 200% text | Normal dated Today keeps both weight labels fully visible, matching the parent layout. Enlarged copy/legend is reachable by scrolling without horizontal overflow. Light/dark calendars pass the existing blocking accessibility scan. | `large-text`, compact pairs and browser assertions. |

## Reproduction

Use the retained harness from the PR checkout, with the fixture hashes recorded in each capture. Build separate clean checkouts of the two source SHAs:

```powershell
node docs/evidence/issue-414/build.mjs <before-checkout> <output> before
node docs/evidence/issue-414/build.mjs <after-checkout> <output> after
```

In each checkout, serve its own export with `node scripts/expo-web-static-server.mjs --port 43410` (Before) or `--port 43414` (After). From the harness checkout:

```powershell
$env:CALIBRATE_EXPO_WEB_BASE_URL='http://127.0.0.1:43414'
$env:CALIBRATE_PAUSE_SOURCE_SHA='382d279ccff26901551f7b41b174c1069895aa25'
$env:CALIBRATE_PAUSE_BUILD_DIR='<after-checkout>/mobile/dist'
$env:CALIBRATE_PAUSE_EVIDENCE_DIR='<output>'
node node_modules/@playwright/test/cli.js test --config playwright.expo-web.config.ts e2e/expo-web/planned-pause.spec.ts --project desktop-chrome --project compact-phone-chrome --workers 2
```

For Before set `CALIBRATE_PAUSE_BASELINE=1`, the parent SHA/build directory, port43410, and append `--grep 'dated plan|matched failed'`. Remove the baseline flag for After. The tests use genuine UI navigation and supported API fixtures; no application pixels are fabricated.

Supporting checks: full mobile suite (1,095 tests/214 suites), all TypeScript surfaces, Expo release checks (16), existing backend pause lifecycle (5), and existing Today/completed-calendar browser regressions (13 passed; 3 scope skips). Final feature browser matrix: 21 passed, one desktop skip for the compact-only 200% text case. Baseline matched flows: six passed. Logs are retained; operational CI/review receipts live in PR comments.

Limits: browser touch/viewport simulation is not Android/iOS device validation. No live backend database walkthrough was claimed; unchanged lifecycle is separately protected by backend tests. Date-only unit tests cover account offsets, local midnight, DST and year transitions. Independent readiness QA belongs to the coordinator, and merge/release/deployment remain human gates.
