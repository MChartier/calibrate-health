# Issue 409 implementation checkpoint

Status: paused at the coordinator's request while parent PR #410 receives an evidence correction. This is a recoverable implementation checkpoint, not a QA-ready verdict or completed PR handoff.

Branch: mchartier/goal-pace-continuity. Parent: #410, mchartier/completed-calendar-bands, pinned head 3d2b4959b6592cfeb3dcf60dc2ca818e219eacc5. Review order: #410 then #409. Workflow-v3 / pr-review-v2 pinned f0919b184b6344d6279178b2388190936ca432a9 was read and acknowledged.

## Observed behavior

The screenshots are actual Chrome on Windows rendering the Expo web app with synthetic API fixtures. The names android-phone-chrome and compact-phone-chrome describe browser viewport projects; no Android emulator or device execution is claimed. No supplied personal screenshot is included.

All eight light/dark flows at 320, 390, 820 and 1440 px passed. A synthetic goal started at 90 kg on January 1, 2026, targets 75 kg and has current weight 85 kg. Saving a change from 500 to 250 kcal/day kept the same identity, baseline and 33% progress, changed the displayed target from 2100 to 2350 kcal/day and changed the fixture projection from December 22, 2026 to May 25, 2027. Reopening and browser reload retained the change. The separate Set a new goal flow created identity 8 with starting weight 85 kg and 0% progress.

Cancel/discard made no request. A simulated 503 after commit retained the draft; retry used the identical operation ID and produced only one effective write. Escape restored focus. Axe found no blocking changed-flow violations. A past completed day retained its saved 2100 target after the adjustment. The 320px light flow also exercised 200% text and reached Save/Close controls.

Screenshots: before / draft / retry / after / historical-balance / new-goal / new-goal-saved correspond to those successive states. Representative desktop-light and compact-dark captures, plus tablet-light and phone-dark draft captures, were inspected. The latest historical-balance and enlarged-text captures still need pixel inspection after this hold.

## Persistence contract

A nullable configured_daily_deficit on CaloriePlanRevision distinguishes manual pace changes from calibration corrections. Goal's original scalar remains the legacy baseline; the shared planning resolver applies the latest effective dated manual pace. Same-day revisions order by ID, changes apply today, and first-completion comparison snapshots remain unchanged. Older/imported unknown targets stay unknown. Calibration starts fresh evidence on the next full local day after a manual change; accepted corrections remain stored and prospective safety is rechecked. Serializable mutations, expected-plan fingerprints and operation receipts protect retries/stale editors. Portable export includes the additive pace field. Release versions are unchanged.

## Executed checks and pending work

- Full existing backend suite: 710 passed before final focused additions; affected goal/history/calibration/export suites subsequently passed 25 tests.
- Full Expo suite: 213 suites / 1076 tests passed before the final historical Today helper; that helper's 15 tests subsequently passed.
- API client suite: 69 passed. All TypeScript surfaces, backend build, Expo web production build, 16 web release checks, 14 rollback-ledger helper checks and diff hygiene passed.
- Current browser scenario source: e2e/expo-web/goal-pace.spec.ts. Reproduce with npm --prefix mobile run build:web, then npx playwright test --config playwright.expo-web.config.ts goal-pace.spec.ts.
- Local live Postgres and native emulator/device checks remain unexecuted. The repository dev:status command unexpectedly attempted Docker Desktop startup and was interrupted; no further shared-service recovery was attempted.
- An isolated-schema real Postgres smoke is added to the existing Database Upgrade workflow for continuity, replay, simultaneous stale-editor rejection, snapshot preservation and intentional new-goal identity. It is not yet executed. Populated upgrade/rollback exact-head CI, configured Codex review/fixes, final evidence reconciliation and draft PR publication remain pending.

Resume only after coordinator release; do not rebase/reset this checkpoint or modify the parent owner's worktree.
