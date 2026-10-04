# Issue 408: completed-day comparison evidence

## Matched before/after correction

The [new matched comparison pairs](before-after/README.md) show actual baseline source `29fb444ae4389ca81f3437d24685ed9badc43410` beside implementation source `3d2b4959b6592cfeb3dcf60dc2ca818e219eacc5`, using identical fixtures and selected state. Four freshly captured and inspected full-viewport images cover desktop light and phone-sized browser dark. Their [manifest](before-after/manifest.json) supplies original hashes, source revisions, capture settings and build provenance. These pairs are visibly embedded in the PR to satisfy the user's blocking before/after amendment to pr-review-v2. Product source is unchanged; renewed independent evidence/communication QA is required.

## Original after-state scenarios and observations

Captured from the actual **Today > Choose a day** flow in Chrome on Windows, using the production Expo web build and synthetic API fixtures. These are browser screenshots at responsive viewports, **not Android emulator or device screenshots**. No personal tracking data was used. Source revision: `e134ba917f29053560eae88289510a774699aa9d`; base: `29fb444ae4389ca81f3437d24685ed9badc43410`. Subsequent export-only changes do not alter the exercised calendar UI and are covered separately below.

The [executable browser scenario](../../../e2e/expo-web/completed-calendar.spec.ts) opens Today, opens the calendar, verifies every boundary's color, letter and accessible label, selects July 9, then reopens the calendar. July 9's selection border remains visible around its yellow completed badge. The same month deliberately contains loss, gain, maintenance, and unknown-history days, proving that classification uses each row's plan rather than one current goal.

| July date | Synthetic intake / target / maintenance (kcal) | Expected and observed |
| --- | --- | --- |
| 1, 2, 3 | 0, 1999, 2000 / 2000 / 2500 | Green, check + T, completed at/below target |
| 4, 5, 6 | 2001, 2499, 2500 / 2000 / 2500 | Yellow, check + M, completed above target and at/below maintenance |
| 7 | 2501 / 2000 / 2500 | Orange, check + B, completed above maintenance |
| 8 | 2499 / 3000 / 2500 | Orange, check + B, completed below maintenance |
| 9, 10, 11 | 2500, 2501, 2999 / 3000 / 2500 | Yellow, check + M, completed below target and at/above maintenance |
| 12, 13 | 3000, 3001 / 3000 / 2500 | Green, check + T, completed at/above target |
| 14, 15, 16 | 2499, 2500, 2501 / 2500 / 2500 | Green, green, orange; equal targets have no yellow interval |
| 17 | No historical plan snapshot | Neutral check + ?, completed/comparison unavailable |
| 18, 19, 20, 21 | Incomplete, not started, paused, open today | Existing outline, neutral fill, pause symbol, and today treatment preserved |
| 22 onward | Future dates | Disabled |

## Inspected screenshots

All eight standard captures were visually inspected for date/legend readability, color distinctions, selection, and clipping. The 320px captures fit the complete standard calendar and legend. Enlarged-text captures show different scroll positions in the same 320px calendar; dates and the wrapping legend remain reachable without horizontal overflow.

| Browser viewport | Light | Dark |
| --- | --- | --- |
| 1440 x 1000 | [Desktop](desktop-chrome-light.png) | [Desktop](desktop-chrome-dark.png) |
| 820 x 1180 | [Tablet-sized browser](tablet-chrome-light.png) | [Tablet-sized browser](tablet-chrome-dark.png) |
| 390 x 844 | [Phone-sized browser](android-phone-chrome-light.png) | [Phone-sized browser](android-phone-chrome-dark.png) |
| 320 x 720 | [Small browser](compact-phone-chrome-light.png) | [Small browser](compact-phone-chrome-dark.png) |

Additional inspected evidence: [200% text, dates](calendar-large-text-days.png), [200% text, legend](calendar-large-text-legend.png), [uncached month request failure](calendar-request-failure.png). The request-failure capture shows the existing network error UI, not a red completed-day outcome.

The recovery scenario reopened today's completed day through **Day completed**, observed its in-progress calendar state, expanded Food log, opened Edit Synthetic daily intake, changed Calories from 2000 to 2501, saved, and collapsed Food log, then used **Complete day** and observed the refreshed orange completed badge. The [food editor](calendar-food-edit.png) and [recompleted calendar](calendar-recompleted-after-edit.png) are inspected captures from that real UI round trip against synthetic API persistence. A failed June request showed Retry without leaking July's classifications; Retry recovered June, and returning to July restored the correct completed state. Component tests also exercised cached refresh failure and offline stale notices. Keyboard Escape closed the calendar and restored focus to Choose date. Axe found no critical/serious WCAG A/AA findings in the changed calendar flow.

## Historical contract and tradeoffs

- The first completion performed on that same IANA-local day captures the current evaluated target and profile-estimated TDEE in the completion transaction. Both normal food-day and watch completion writers use this path. Reopening and recompleting retain the first snapshot.
- Target is the existing whole-kcal policy result, including an accepted target correction. Maintenance is rounded once to whole kcal from profile-estimated TDEE. Intake sums stored integer food-log calories, including a real empty completed day as zero. No serving recalculation or activity-derived TDEE is introduced.
- Legacy/imported days and days first completed retrospectively have no invented historical plan. Unavailable/requires-review planning remains unavailable even if current settings later become valid. Invalid comparison numbers and invalid timezones do not produce a band.
- Snapshot policy is intentionally first completion, not a full intraday planning audit. Subsequent same-day plan changes do not rewrite it. Existing historical days will initially show neutral completion. This is the bounded alternative to a planning-history rewrite.
- Migration `0043_food_day_comparison` leaves legacy rows null. Ordinal 0042 is already proposed by independent PR #402. Shared schema/OpenAPI/client and account-lifecycle files overlap #402. Its account-lifecycle change guards deletion in a separate section and retains export v8; this change adds export v9 snapshots. This branch has no parent PR.

## Automated review disposition

The configured Codex review proposed deriving band direction from signed `daily_deficit` when an accepted correction crosses maintenance. Issue #408 explicitly defines inversion by saved `T > M`, so that proposed mathematical change was not applied. For a positive deficit of 250 and accepted correction of 300, the captured target remains 50 above maintenance and the requested inverted bands apply. Backend capture and client classification regressions pass this case. The legend now describes target/maintenance ordering directly, so it does not misidentify a signed weight-loss goal as gain. All screenshots were recaptured and inspected after that wording correction.

A later Codex finding correctly identified that portable account exports omitted the new saved plan. Export format v9 now preserves target, maintenance, and capture timestamp in the serializer, public client type, OpenAPI, and generated contract. A JSON serialization regression verifies known snapshots, captured-but-unavailable snapshots, and legacy nulls on reopened days; API-client transport preserves the fields. The export-sharing suite remains green. This is an export-format revision only; server/web/native release versions stay unchanged. No account restore/import flow is claimed.

## Executed validation

| Command | Observed result |
| --- | --- |
| `node .codex/local-environment.setup.mjs` | Host dependencies, Playwright Chromium, Prisma generation, worktree configuration passed |
| `npm.cmd run lint` | Backend, shared, API-client, and Expo TypeScript checks passed |
| `npm.cmd --prefix mobile run typecheck` | Passed |
| `npm.cmd --prefix backend test` | 708 tests passed; subsequent calibrated-crossing service tests 6/6 passed |
| `npm.cmd --prefix mobile test -- --runInBand` | 212 suites / 1069 tests passed; subsequent current calendar tests 30/30 passed |
| `npm.cmd --prefix packages/api-client test` | 68 tests passed, including old-server/no-snapshot compatibility |
| `npm.cmd --prefix backend run build` | Passed |
| `npm.cmd run api:contract:check` | Generated contract matches committed OpenAPI |
| `npm.cmd run test:web:e2e -- e2e/expo-web/completed-calendar.spec.ts --workers=2` | Production web build passed; 10 applicable browser scenarios passed, 6 project-specific skips |
| `npm.cmd run test:ux` | 252 accessibility/visual scenarios passed, 79 configured skips; no baseline updates |
| `npm.cmd run test:expo-web:release` | 16 checks passed |
| `npm.cmd run test:db:rollback:unit` | 14 checks passed after updating the exact candidate ledger and asserting legacy comparison columns stay null |
| `node -r ts-node/register --test test/account-lifecycle.test.js test/food-day-comparison.test.js` (from backend) | 10 tests passed after export preservation fix |
| `npm.cmd --prefix mobile test -- --runInBand accountData.test` | 16 export-sharing/deletion tests passed |
| `git diff --check` | Passed |

Full backend tests include actual HTTP-route handlers with synthetic persistence stubs, local year/day boundary capture, unsafe plans, accepted calibration, invalid timezone, unchanged snapshots after goal/profile changes, known zero intake, reopened/edited totals, and the canonical watch mutation regressions. They do not establish a live Postgres transaction result.

## Remaining verification limits

The local Compose/Postgres run is blocked: `npm.cmd run dev:setup` waited in Docker Desktop startup; separate bounded `docker info` and `docker desktop status` probes timed out. Docker CLI version and WSL status respond. No shared service was restarted and no other worktree stack was changed. Live database migration/upgrade checks are left to current-head CI and independent QA. Native emulator/physical-device execution and a live-Postgres food-editor round trip remain unexecuted; the actual browser editor round trip passed against synthetic API fixtures. Independent QA and human readiness belong to the coordinator.

[Manifest](manifest.json) records source/base and SHA-256 for each genuine screenshot. CI and configured automated-review status belong to the PR's current-head record, not a frozen claim here.
