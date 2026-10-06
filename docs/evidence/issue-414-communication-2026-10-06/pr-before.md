## Summary

People can save an expected resume date when pausing food tracking, but the parent app does not show it on Today or mark the future plan in the calendar. Its calendar also misses durable queued pause/resume intent after a reload, even though Today already preserves that intent.

Today now shows the saved intention, and the calendar marks planned future pause days up to—but excluding—the expected resume date. People can browse through its target month without selecting or logging future dates. Open-ended plans remain bounded; due dates never resume tracking automatically. Calendar history follows verified receipts and pending intent, including dates absent from a range response. When history is unavailable, known saved changes remain visible with an explicit limitation and retry; unknown statuses are not invented. Historical Backfill, explicit resume and completed-day calorie colors keep their meanings.

Closes #414. **Stacked on [#423](https://github.com/MChartier/calibrate-health/pull/423), pinned 7b83b3255c263efbb22fd1be1be3124bc46fc23c; review #423 before this child.** The child adds only issue414 visibility and necessary calendar/receipt regressions. Parent review/readiness remains independent; this stack is not independently mergeable.

## Before / After

Genuine isolated exports: Before parent 7b83b3255c263efbb22fd1be1be3124bc46fc23c; After final child 0ee7d098589beb218c4f34b370ba556f25de4498. Same synthetic July21 account, pause from July20, August3 intention, viewports, theme and clock. [Immutable manifest](https://github.com/MChartier/calibrate-health/blob/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/manifest.json) and [reproduction/coverage](https://github.com/MChartier/calibrate-health/blob/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/README.md) bind source, running build, original image hashes and harness bytes. Shared suppression of unrelated transient PWA notices is disclosed; compared UI is unedited.

### Saved expectation on Today

The intended date is visible while Resume tracking and weight entry remain available.

| Before: pinned parent | After: planned-pause visibility |
| --- | --- |
| <img alt="Before: Saved expectation on Today" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/before-compact-phone-chrome-dated-today-light.png" width="320"> | <img alt="After: Saved expectation on Today" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/after-compact-phone-chrome-dated-today-light.png" width="320"> |
### Future plan and recorded history

Dashed pause symbols identify future intentions; completed colors and current/selected indicators remain. August3 is excluded, and future click/Enter cannot select.

| Before: pinned parent | After: planned-pause visibility |
| --- | --- |
| <img alt="Before: Future plan and recorded history" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/before-compact-phone-chrome-calendar-light.png" width="320"> | <img alt="After: Future plan and recorded history" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/after-compact-phone-chrome-calendar-light.png" width="320"> |

## Test plan and behavior evidence

Observed in actual Chrome154.0.8037.98 on MCHARTIER_ZBOOK, desktop1440x1000 and compact320x720, with synthetic intercepted APIs. These are browser observations, not emulator/device/live-database checks.

| Starting state and action | Intended and observed result | Evidence |
| --- | --- | --- |
| Pause via the real date form; browse target month/year | Today shows the saved date. Future interval stops before the target; month/year boundaries are viewable and future input remains disabled. Completed bands survive. Passed. | Pairs above; [target boundary](https://github.com/MChartier/calibrate-health/blob/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/after-compact-phone-chrome-target-month-light.png); maintained date/window/browser regressions. |
| Reject resume, retry; separately resume from due prompt and backfill a historical day | Rejection keeps pause/date; explicit success opens the resume day and clears forecast. Backfill leaves the global pause active and survives pause refresh. Passed. | Failure pair below; matched recovered-calendar captures and locked receipt/Backfill regressions. |
| Queue start/resume/expectation change; reload, remount, refetch, then replay | Today and calendar retain explicit pending intent. Receipt-only history is labeled limited when range reads fail; replay returns to server-confirmed state. Foreign/failed intent is excluded from display without weakening write barriers. Passed. | Queued pairs below; actual IndexedDB/reload/replay scenarios and missing-date/race regressions. |
| Shorten/remove target, revisit months, exercise due/overdue and failed metadata reads | Obsolete future views clamp; no automatic resume or invented date. Honest cached/unavailable state recovers after reconnect. Light/dark, keyboard and200% text remain usable. Passed. | Maintained browser assertions, matched dark captures, [large text](https://github.com/MChartier/calibrate-health/blob/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/after-compact-phone-chrome-large-text.png). |

### Failed resume retains the plan

Both builds remain paused after rejection; the child also keeps the saved expectation visible. Successful retry clears the projected future interval.

| Before: pinned parent | After: planned-pause visibility |
| --- | --- |
| <img alt="Before: Failed resume retains the plan" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/before-compact-phone-chrome-matched-failed-resume.png" width="320"> | <img alt="After: Failed resume retains the plan" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/after-compact-phone-chrome-matched-failed-resume.png" width="320"> |
### Queued start survives calendar reload

With one durable queued start and an inactive server, the child shows the accepted current-day pause and future intention after reload. The parent calendar has no such projection.

| Before: pinned parent | After: planned-pause visibility |
| --- | --- |
| <img alt="Before: Queued start survives calendar reload" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/before-compact-phone-chrome-queued-start-calendar.png" width="320"> | <img alt="After: Queued start survives calendar reload" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/after-compact-phone-chrome-queued-start-calendar.png" width="320"> |
### Queued resume with unavailable history

Both builds have the same durable resume and still-paused server after reload. Both reach terminal history-read failure: the parent blocks the calendar; the child shows known saved states, keeps the resume day open and labels other history unavailable. Different modal height reflects actual content. This does not claim unknown calorie comparisons or bypass pending-reconnection write controls.

| Before: pinned parent | After: planned-pause visibility |
| --- | --- |
| <img alt="Before: Queued resume with unavailable history" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/before-compact-phone-chrome-queued-resume-calendar.png" width="320"> | <img alt="After: Queued resume with unavailable history" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/after-compact-phone-chrome-queued-resume-calendar.png" width="320"> |

## Supporting validation and limits

Passed: **1,261 mobile tests/234 suites**, configured cross-package typechecks, Knip and clean web export. Final maintained browser run: **36 passed, 4 deliberate viewport/scope skips**. Matched capture runs:10 Before and11 After passed, with1 desktop enlarged-text skip. [Bound logs](https://github.com/MChartier/calibrate-health/blob/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/README.md) support the behavior evidence; exact-head CI/configured review and QA transitions live in PR discussion.

No backend/API/schema/migration, provider credentials, release/deployment, notification, calorie calculation or future logging change. No physical-device, emulator, hardware screen-reader or live-database validation. Original [#426](https://github.com/MChartier/calibrate-health/pull/426) and [#419](https://github.com/MChartier/calibrate-health/pull/419) remain open drafts for history; this clean pinned-parent replacement retains their evidence separately. Product history contains only the focused child changes and maintained tests.
