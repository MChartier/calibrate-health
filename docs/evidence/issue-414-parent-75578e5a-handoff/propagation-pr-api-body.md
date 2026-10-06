## Summary

People can save an expected resume date when pausing food tracking, but Today and the calendar do not show that plan. The calendar also loses queued pause/resume visibility after reload.

Today now shows the intended date. The calendar marks future planned pause days and allows browsing through the target month, while keeping future dates nonselectable. The target date is excluded; tracking resumes only after an explicit action. Historical edits and completed-day calorie colors are preserved.

Closes #414. **Depends on #423 at `75578e5a`; review #423 first.** This child (`abebe4aa`) is not independently mergeable, and does not certify its parent.

## Test plan

Observed in the real Chrome app with synthetic data, using the pinned parent as Before and this child as After:

| Scenario | Expected and observed |
| --- | --- |
| Save an August 3 target; browse July/August and a year boundary | Today shows the date; future markers stop before the target. Future clicks/Enter cannot select. Completed colors remain intact. |
| Reject resume, retry, and separately use the due prompt | Rejection retains the pause and expectation. Explicit resume opens that day and clears the forecast; prior paused history remains. |
| Queue start/resume or change the target; reload, refetch and replay | Saved intent remains visible and converges after replay. Missing history is labeled honestly. Shortened/removed targets recover to a valid month. Historical Backfill leaves the global pause active. |

**Saved expectation on Today**

| Before: paused Today | After: paused Today |
| --- | --- |
| <img alt="Before: paused Today" src="https://raw.githubusercontent.com/MChartier/calibrate-health/6e0438abb1fcdc6893741128dfa5d17c984cb6c3/docs/evidence/issue-414-parent-75578e5a/before-compact-phone-chrome-dated-today-light.png" width="280"> | <img alt="After: paused Today" src="https://raw.githubusercontent.com/MChartier/calibrate-health/6e0438abb1fcdc6893741128dfa5d17c984cb6c3/docs/evidence/issue-414-parent-75578e5a/after-compact-phone-chrome-dated-today-light.png" width="280"> |

**Planned dates remain separate from recorded history**

| Before: calendar | After: calendar |
| --- | --- |
| <img alt="Before: calendar" src="https://raw.githubusercontent.com/MChartier/calibrate-health/6e0438abb1fcdc6893741128dfa5d17c984cb6c3/docs/evidence/issue-414-parent-75578e5a/before-compact-phone-chrome-calendar-light.png" width="280"> | <img alt="After: calendar" src="https://raw.githubusercontent.com/MChartier/calibrate-health/6e0438abb1fcdc6893741128dfa5d17c984cb6c3/docs/evidence/issue-414-parent-75578e5a/after-compact-phone-chrome-calendar-light.png" width="280"> |

**Queued resume after reload, with history unavailable**

Both captures have reached the same history-read failure. The child preserves known saved states and offers retry; it does not invent the missing history.

| Before: history-read recovery | After: history-read recovery |
| --- | --- |
| <img alt="Before: history-read recovery" src="https://raw.githubusercontent.com/MChartier/calibrate-health/6e0438abb1fcdc6893741128dfa5d17c984cb6c3/docs/evidence/issue-414-parent-75578e5a/before-compact-phone-chrome-queued-resume-calendar.png" width="280"> | <img alt="After: history-read recovery" src="https://raw.githubusercontent.com/MChartier/calibrate-health/6e0438abb1fcdc6893741128dfa5d17c984cb6c3/docs/evidence/issue-414-parent-75578e5a/after-compact-phone-chrome-queued-resume-calendar.png" width="280"> |

## Technical details and validation

Reuses the existing pause API, locked reads and durable outbox. Calendar ranges apply verified receipts before pending intent; refreshing a pause preserves newer verified day edits. No scheduling backend or automatic resume was added.

On this integrated revision: 40 browser scenarios passed (4 intentional skips), 87 focused mobile tests passed, and repository typechecks passed. Earlier full-suite and backend lifecycle results remain in the linked operational record. Browser coverage includes light/dark, keyboard and enlarged text; native devices, hardware screen readers and a live database were not exercised.

[Capture provenance and full evidence](https://github.com/MChartier/calibrate-health/blob/6e0438abb1fcdc6893741128dfa5d17c984cb6c3/docs/evidence/issue-414-parent-75578e5a/README.md) · [Exact scope, checks and operational records](https://github.com/MChartier/calibrate-health/pull/428#issuecomment-6006740288) · [Preserved prior description](https://github.com/MChartier/calibrate-health/blob/078d8f8b8c124f96b0161d87a8eed2fec031837c/docs/evidence/issue-414-communication-2026-10-06/pr-before.md)
