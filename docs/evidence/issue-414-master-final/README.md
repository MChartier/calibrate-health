# Expected resume and planned pause evidence

## Base-to-final behavior

On master, people can save an expected resume date but paused Today does not show it, and the calendar cannot show the future plan. The final feature shows the intended date and display-only planned pause days before that date. Tracking remains paused until explicit resume; today/history and completed calorie bands remain canonical.

Before source: `acc8a30d6cde7477f08f0b7ace23df4047d21354` (actual master, including the merged completed-calendar and desktop rail changes). After source: `071ad4a7455ac44d06f050682332527728eebca6` (clean issue414 replacement, two scoped product/test commits). These are separate clean isolated exports, not simulated integration or reconstructed UI.

Actual host MCHARTIER_ZBOOK, Windows, Node 24.19.0; installed Chrome version is recorded per capture. Desktop 1440x1000 and compact 320x720, DPR1, en-US, America/Los_Angeles, reduced motion. The real exported app uses synthetic intercepted APIs: July21 2026, pause started July20, expectation August3, known completed-day colors July16-19. Clock starts 2026-07-21T19:00:00Z and advances16ms per read; IDs deterministic. No private history, physical device, emulator or live database is used.

Shared normalization: `hideTransientPwaNotices` suppresses unrelated PWA notices equally. The compared pause/calendar/error UI is not hidden or altered. PNGs are original uncropped bytes. Capture JSON binds viewport, theme, locale, timezone, browser, source, exact harness/config hashes, image hash and fetched served-script hashes. The served scripts must match the recorded build files. Both build manifests bind all174 export files. Build checkout paths are relative to `C:/Users/MChar/Documents/Codex/2026-10-04/task-6/planned-pause-clean`, the invocation working directory. The Before checkout is `../master-baseline`; After is `.`.

## Reproduce

From the clean replacement checkout, run the retained `build.mjs` with `../master-baseline` / `.` as source, this evidence directory as output, and `before` / `after` as label. Both commands are `npm.cmd --prefix mobile run build:web`; source cleanliness and unchanged HEAD are checked around export.

Serve each checkout with `node scripts/expo-web-static-server.mjs --port 43420` (Before) or `--port 43424` (After). Run the exact retained `e2e/expo-web/planned-pause.spec.ts` harness from this evidence branch. It derives from the maintained browser regression but contains capture machinery only on this nonmerged branch. Set:

- `CALIBRATE_EXPO_WEB_BASE_URL` to the appropriate loopback URL.
- `CALIBRATE_PAUSE_BASELINE` to `1` for Before, `0` for After.
- `CALIBRATE_PAUSE_SOURCE_SHA` to the exact source above.
- `CALIBRATE_PAUSE_BUILD_DIR` to the respective absolute `mobile/dist` directory.
- `CALIBRATE_PAUSE_EVIDENCE_DIR` to this artifact directory.

Run `node node_modules/@playwright/test/cli.js test --config playwright.expo-web.config.ts e2e/expo-web/planned-pause.spec.ts --project desktop-chrome --project compact-phone-chrome --workers 2`. For Before add `--grep 'dated plan|matched'`. Use distinct output directories. The evidence worktree uses a junction to the replacement checkout's installed root node_modules; builds use each source checkout's own repository-managed dependencies.

## Coverage and observations

- Dated Today and current calendar: matched light/dark, desktop/compact. After shows expected August3, dashed planned July22 onward, enabled forward browsing, unchanged completed bands/selection. Future click/Enter cannot select.
- Target month: After August1-2 planned; August3 excluded. Baseline cannot navigate forward; the matched pair honestly stays in July. January1/January2 validates the year boundary with no future history requests.
- Matched rejected resume and recovered calendar: failed operation stays paused with error; After retains target. Successful retry opens today and clears future forecast while retaining July20 history. Both builds converge to the same resumed contract.
- Real pause date form, historical edit, due prompt failed update, Until I resume and explicit due-prompt resume: retained assertions verify supported UI mutations and preserved history.
- Shortened/later/removed expectation across reopen/month navigation/reload clamps obsolete future views. Due/overdue plans create no new future interval.
- Unavailable metadata, stale read, saved offline state and real IndexedDB queued resume/replay converge without invented metadata. Fully offline mutation behavior is the existing master React Query contract; this feature does not include PR423's separate networkMode changes.
- Blocking accessibility scans, keyboard dismissal/focus, light/dark and compact200% text check readable, reachable planned semantics.

The manifest binds all original captures, logs, build records, harness files and this README. Original PR419 evidence and receipts remain historical, retained separately at `evidence/pr419-reviewed-fba1baf`. This new evidence branch is solely a review archive, owned by MChartier/workflow coordinator, retained for the lifetime of linked review records with no automatic deletion. It is never a product merge target.

## Accepted queued intent

A matched online503 scenario verifies one durable resume operation in IndexedDB while the synthetic server remains paused. Before immediately refetches and restores the paused UI; After keeps the accepted local open state until replay. On reconnect, both servers accept the resume; Before retains stale paused UI while After invalidates pause/day/calendar and shows the resumed state. The queued-resume and queued-replayed pairs record these real baseline differences. New component regressions cover both resume surfaces and queued expectation removal, and fail against the original unconditional-refresh variant. No networkMode, provider or PR423 changes are included.
