## Problem

People can choose an expected resume date when pausing food tracking, but cannot see that intention on paused Today or in the calendar. This makes it hard to tell when they planned to return and which upcoming days they expect to remain paused.

## Intended behavior

- Show the saved expected date on current paused Today, with honest open-ended, due/overdue and unavailable-data wording. Historical days must not inherit today's target.
- Mark future planned pause days through the day before the target. Allow browsing across months/years, but never enable future food logging. Open-ended plans stay bounded.
- Keep explicit resume semantics: dates do not resume tracking automatically. Early resume clears the forecast; historical edits and completed-day colors remain intact.
- Keep saved intent consistent through target changes, reload, offline queues, failures and recovery, using account-local dates and the existing pause API.

Implementation: draft #428, dependent on #423; review the parent first. No new scheduling backend, migration or notifications.

## Validation and evidence

Synthetic browser checks observed the expected date and target boundary, explicit resume and preserved history, plus queued changes surviving reload/refetch and recovering after replay. Tests also cover failed updates, due/overdue dates, month/year boundaries and disabled future input. Native/device/live-database validation was not performed.

The calendar comparison below shows recorded colors preserved while future planned pauses gain distinct symbols. These are genuine parent-to-child app captures.

| Before: calendar | After: calendar |
| --- | --- |
| <img alt="Before: calendar" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/before-compact-phone-chrome-calendar-light.png" width="280"> | <img alt="After: calendar" src="https://raw.githubusercontent.com/MChartier/calibrate-health/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/after-compact-phone-chrome-calendar-light.png" width="280"> |

[Today and failure/recovery evidence in PR #428](https://github.com/MChartier/calibrate-health/pull/428) · [Exact capture provenance](https://github.com/MChartier/calibrate-health/blob/484afc6b4a0c6359251f5ffce5c3d048f684749c/docs/evidence/issue-414-stacked/manifest.json) · [Original requirements, acceptance contract and history](https://github.com/MChartier/calibrate-health/blob/078d8f8b8c124f96b0161d87a8eed2fec031837c/docs/evidence/issue-414-communication-2026-10-06/issue-before.md)
