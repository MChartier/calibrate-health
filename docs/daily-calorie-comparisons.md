# Daily calorie comparisons

Implements the [scope for issue #463](https://github.com/MChartier/calibrate-health/issues/463#issuecomment-6091426980).

## Display and capture policy

Today prefers a valid saved comparison for a completed day. A completed day or
populated past OPEN day without one compares its own food intake with the available
current target and says **Compared with current target**, including in the card's
accessible description. Saved comparisons say **Compared with saved target**.
The fallback can change after a profile or plan refetch. Pending weight changes,
unsafe/unavailable plans, paused days and incomplete days retain their existing
handling. Fallback values never enter API `calorie_comparison` or calendar bands.

`DailyCaloriePlan` retains the last server-observed plan for each account-local
date. It stores target/rounded profile-estimated TDEE, or an explicit unavailable
result, alongside the original timezone, observation time, calculation version,
profile, goal, weight and effective planning revisions. Profile and Wear snapshot
reads, current-day food activity, and committed planning-input changes observe
the current server-local date. Generic calculations and previews do not write
observations; historical imports and edits do not reconstruct past plans.

Completion consumes that date's retained evidence and freezes it. The observation
timestamp remains separate from the completion/capture timestamp. Existing captured
results, including unavailable results, survive reopening, food edits and
recompletion. Food intake is still read from the selected day's logs. The account
planning guard is acquired before food-day writes and Wear revision checks; times
are sampled after acquiring the guard. Concurrent Wear snapshot reads retry their
entire consistent transaction on serialization conflicts.

Conflicting timezone observations are marked without rewriting their original
provenance. A timezone mismatch at completion or missing/unavailable evidence
cannot supply saved values. A day spent wholly offline with no server observation
therefore has only the display fallback when a current target is available.

## Storage and compatibility

Migration `0046_daily_calorie_plans` only creates the separate table, unique
account/date index, value check and cascading account foreign key. It performs no
backfill and does not change legacy food days or existing comparison values.
Observing a plan creates no food-day row and does not change inferred day status
or Wear revisions. Account export format 11 includes the retained observations;
account deletion cascades to them. Server/native release versions are unchanged.

## Synthetic verification

Validated on Windows against the working-tree implementation based on
`5006a0d5d9a6a51eaaf3f3219add36e365d549c3`:

| Check | Result |
| --- | --- |
| All TypeScript surfaces (`npm run lint`) | Passed |
| Full backend suite | 791 passed, 3 skipped |
| Real Postgres lifecycle suite | 8 passed, no skips |
| Populated database upgrade | Core data preserved across 49 migrations; no synthetic history created |
| API-client suite | 69 passed |
| Focused mobile suites | 64 passed across 5 suites |
| Expo web production build | Passed, 119 static routes |
| Saved-target and calendar browser suites | 14 passed, 2 viewport-specific skips |
| Diff hygiene | Passed |

`backend/test/daily-calorie-plans.postgres.test.js` uses an isolated synthetic
schema, real Prisma transactions and the normal phone route handlers and Wear
services. It covers D observation, D+1 profile/pace changes, late completion,
dropped replies/duplicate operations, stale Wear revisions, reopen/edit/recomplete,
single-day/range/sync reads, unavailable transitions, timezone conflicts, an actual
Postgres lock waiter crossing local midnight, export and deletion. Unit coverage
also exercises goal/weight/revision changes and the repeated DST hour.

The Postgres suite reads identical synthetic completed and populated OPEN days
through normal API handlers and executes the display selectors from:

- Pre-regression `ec35bbd10b888bbc00a9c066bfc38d39e779e6e7`: uses the current target.
- Regressed `5006a0d5d9a6a51eaaf3f3219add36e365d549c3`: returns no historical target.
- Fixed working tree: returns the current target with fallback provenance.

This reproduces the source-level display regression with real database reads; it
does not launch historical app binaries or verify deployed builds/personal records.
Browser fixtures separately verify the fixed UI at 1440px and 320px, reload/refetch,
accessibility labels, calendar behavior and 200% text. Wear evidence exercises the
server protocol, not a physical watch.

The optional Postgres suite requires a disposable local database and the two Git
revisions above to be present. It creates and removes only its random test schema:

```powershell
$env:DAILY_CALORIE_PLAN_DATABASE_URL = '<local synthetic Postgres URL>'
npm.cmd --prefix backend test -- test/daily-calorie-plans.postgres.test.js
```

Browser verification after `npm.cmd run build:expo-web`:

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.expo-web.config.ts --project=desktop-chrome --project=compact-phone-chrome --workers=2 e2e/expo-web/saved-target.spec.ts e2e/expo-web/completed-calendar.spec.ts
```

Screenshots from that fixed build: [desktop](screenshots/daily-calorie-comparisons/desktop.png),
[320px phone](screenshots/daily-calorie-comparisons/phone.png), and
[320px with 200% text, scrolled to the comparison label](screenshots/daily-calorie-comparisons/phone-large-text.png).
