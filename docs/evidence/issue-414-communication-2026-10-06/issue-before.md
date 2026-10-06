## Problem and value

People who pause food tracking can choose an expected resume date, but the current-day paused screen and the calendar do not show that plan. They cannot readily see when they intended to return or which upcoming days they expect to remain paused.

The supplied screenshots show a current-day **Tracking paused** screen with generic resume copy, and **Choose a day** with paused history but unmarked future dates and no next-month navigation. The screenshots contain private tracking history and are intentionally not attached.

This is a directly requested visibility improvement. It is not a request to change what pausing, resuming, or completing a day means.

### Current evidence

Read-only inspection of master `29fb444ae4389ca81f3437d24685ed9badc43410`:

- [FoodTrackingPause storage](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/backend/prisma/schema.prisma#L516-L535) already stores date-only `starts_on`, optional `expected_resume_on`, and actual `resumed_on`. The schema explicitly defines expected resume as a **prompt date, never automatic resumption**, and actual resumed_on as the **first day not covered by a closed pause**.
- [Pause service](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/backend/src/services/foodTracking.ts) and [routes](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/backend/src/routes/foodDays.ts) already expose, update, and clear the expectation. A due expectation sets `resume_confirmation_due`; active tracking remains paused until an explicit resume. Resume preserves prior paused days and opens the actual resume day. Stored day overrides take precedence.
- [FoodTrackingStatus](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/components/FoodTrackingStatus.tsx) already queries `mobile-food-tracking-pause`, provides pause/resume/expectation mutations, supports the existing offline outbox, and invalidates pause and calendar-range queries. The due-date confirmation supports extending the expectation or choosing **Until I resume**.
- [PausedDayMessage](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/today/PausedDayMessage.tsx), rendered by [Today](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/app/%28tabs%29/%28today%29/today.tsx), receives only `isToday`, so cannot display the expectation.
- [HistoricalDatePicker](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/food/HistoricalDatePicker.tsx) uses the same `maxDate` for history-query bounds, selectable dates, today identification, and forward-month navigation. Its [classifier](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/food/calendar.ts) uses returned day records only. Simply expanding the range query would be incorrect: the backend resolves an active pause until actual resume, regardless of the expected date.
- Existing [backend lifecycle tests](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/backend/test/food-tracking.test.js) protect preserved history, the open resume day, and confirmation without auto-resume.

No application run or new automated validation was performed during intake.

## Intended outcome and scope

### Current-day paused message

When today is paused under the active pause and a valid expectation is known, display a human-friendly local date alongside the paused status, for example **Expected to resume October 8**. Keep the resume action available. Describe an intention, not a guarantee or scheduled automatic action.

- No expected date: retain honest open-ended wording such as **Until you resume**; do not invent a date.
- Expected date is today or in the past: retain the actual paused state and existing confirmation flow. Show the saved expectation with due/overdue-aware wording rather than suggesting tracking already resumed or silently moving the date.
- Loading, unavailable, or invalid pause metadata: do not fabricate a date or conflate unavailable metadata with a confirmed open-ended pause. Keep the known paused-day state usable.
- A historical paused day must not display the current pause's future target as though it belonged to that historical day.

### Planned pause in the calendar

Add a display-only planned-pause overlay driven by the current active pause. Keep it separate from recorded historical day status and completed-day calorie comparison.

For a known future expected resume date `R`, mark future date `d` as **planned tracking pause** when the pause is active, `d >= starts_on`, `d > today`, and `d < R`. The target date itself is excluded from this forecast. This is the reviewable product default consistent with a date on which the person expects to resume and the existing actual-resume boundary; it does not close the pause automatically.

Example using synthetic dates: today July 11, pause started July 10, expected resume July 15. Today and past dates follow canonical recorded/effective status; July 12-14 show planned pause; July 15 onward do not inherit that dated forecast. If July 15 arrives without resuming, that day's actual state is still paused and the existing confirmation is due.

- A known plan that crosses months or years must be viewable. Separate the browsing/projection horizon from selection and historical-query limits. Allow viewing through the target month so the last planned day and target boundary can be understood; keep future dates nonselectable/noneditable. Do not enable future food logging.
- Reviewable open-ended default: while an active pause has no expected date, show any otherwise visible future dates as planned paused, with **Until resumed** meaning. Keep bounded navigation (the existing current-month limit is acceptable for this case); do not fabricate a finite end date or an arbitrary long-range schedule.
- A due/past expectation does not create a new future plan. Continue showing actual paused history/today and the due expectation until the user resumes or updates it.
- Successful early resume removes remaining future planned markers and opens the actual resume day, while preserving prior paused history and explicit historical overrides. Editing/backfilling a single historical paused day must not end the active pause.
- Updating or removing the expectation refreshes the visible window and current-day copy together, including after reopening the calendar, month navigation, refresh, and returning from another surface. If a shortened/cleared plan makes the viewed future month out of bounds, recover to a valid view.
- Use existing pause/query/outbox contracts and account-timezone/date-only helpers. Retain honest pending/offline/error behavior; a failed mutation must not leave a false resumed state or permanently erase the prior plan. Successful resume from either the current-day control or due-date prompt must clear the projection consistently.
- Give future markers visible pause semantics plus accessible wording that says **planned**; distinguish planned information from recorded history without relying only on color. Keep selected/today/focus indicators and disabled future-date semantics intact.

### Boundaries and integration

Start with the existing pause API, client contract, and shared queries. No new pause-scheduling backend, future PAUSED row materialization, auto-resume job, or migration is expected. A minimal additive contract fix may be made only if source inspection establishes it is needed; keep generated/client/API documentation synchronized if changed.

Preserve completion, calorie bands, food-write gates, reminder suppression, calibration, weight logging, and historical edit behavior. Do not change goal or calorie calculations, add notifications, redesign unrelated date fields, or merge/release/deploy.

[PR #410](https://github.com/MChartier/calibrate-health/pull/410), head `3d2b4959b6592cfeb3dcf60dc2ca818e219eacc5`, is human-ready and changes this same classifier, labels, date-picker badges, and historical comparison data. Integrate its completed-day behavior rather than restoring the old single-color calendar. Recheck current base/parent and coordinator ownership before assignment; coordinate any stacking or merge order. Respect the single implementation slot, including the separately owned [#409](https://github.com/MChartier/calibrate-health/issues/409), and do not launch a competing writer.

Ordinary reversible copy, marker, and implementation choices are delegated for review. They are not a reason to hold scoping. Escalate only a material product/scope, safety, permission, or irreversible-data decision.

## Acceptance and validation

Requirements for the later implementation; none are claimed as executed:

- [ ] Pause with a future date through the real UI. Today's paused screen shows that human-friendly target, keeps Resume tracking available, and does not promise auto-resume. Open the calendar and verify the exact projected interval and the unmarked target-date boundary.
- [ ] Verify a one-day future window, a pause started today, and a pause started earlier. Recorded past/today status remains canonical; the forecast does not overwrite stored completion or explicit historical edits.
- [ ] Choose a target across a month and year boundary. Navigate forward to inspect the entire plan and its boundary, then back. Future day taps/keyboard activation still cannot select or edit them, and future-only months render without invalid history requests or a permanent loading/error state.
- [ ] Resume early from the current-day control, and separately resume through the confirmation prompt once it is due. Current-day copy and all projected markers update without requiring app restart; prior actual paused days remain paused and the actual resume day is open. Editing a historical day leaves the active forecast intact.
- [ ] Move the target later/earlier and remove it through existing supported mutations; exercise the real extend/until-resumed UI when its prompt is available. Pre-due changes may use controlled API/fixture regression coverage rather than adding a new editor. Reopen the picker, change months, refetch, and reload; the same current plan appears everywhere. No stale date, cross-account plan, or previous-month markers leak.
- [ ] Cover active pause without an expectation, unavailable/invalid metadata, target due today, and overdue target. No invented date, automatic resume, or silently extended dated forecast. The existing confirmation/extend flow continues to work.
- [ ] Cover failed resume/update, stale/offline reads, accepted queued mutations under the existing outbox behavior, replay/recovery, and refetch races. Preserve honest state and error/pending feedback, and converge to server-confirmed state.
- [ ] Use account-local date semantics across UTC offsets, local midnight, DST, and month/year transitions. Do not parse a date-only target as a UTC instant that displays the prior/next day.
- [ ] Preserve PR #410's green/yellow/orange and unavailable completed-day treatments, incomplete/not-started/paused history, selection, today, focus, loading/error recovery, and calendar legend. Planned markers remain distinguishable and readable in light/dark themes, compact viewports, and enlarged text, with meaningful screen-reader labels and usable keyboard/touch navigation.
- [ ] Add focused classifier/window/boundary, component/accessibility, and query/mutation-invalidation regressions. Protect existing backend pause lifecycle behavior; test API/client changes only if needed. Run the repository's change-appropriate tests, type/lint/build gates, and current-head CI.
- [ ] Follow **pr-review-v2**: the eventual PR opens with the user problem and intended outcome; its behavioral Test plan connects starting state/action, expected outcome, actually observed outcome, environment/revision, and direct evidence. Exercise the actual Today and calendar flows with synthetic data and inspect genuine screenshots/recording for dated pause, cross-month forecast, boundary, early resume, changed/removed expectation, and failure/recovery. Distinguish browser, emulator, physical-device, automated, and unexecuted checks. A green command list alone is insufficient; independent QA must assess the current head and evidence. Do not publish the user's private screenshots or health history.

### Duplicate and ownership check

On 2026-10-04 UTC, inspected open issues/open PRs and pause/resume/expected-resume searches. No duplicate scope was found. [#245](https://github.com/MChartier/calibrate-health/pull/245) introduced pause lifecycle semantics; [#398](https://github.com/MChartier/calibrate-health/pull/398) introduced the dedicated paused view. #408/#410 are related calendar presentation work, not this planned-pause feature.

## Authority

Direct trusted human request in the dot conversation, message `Sentinel_3421b62b18b08191b4339afbf59a4f9b`:

> In calibrate-health, when we pause tracking we can specify the expected date for resuming tracking. But this isn't surface anywhere, including on the calendar date picker.
>
> When showing a current "Tracking paused" state on the current day, we should specify a target date if there is one.
>
> On the calendar, we should show the future days that are planned to remain paused as paused (unless and until we resume early).
>
> Scope this as a github issue for delegation.

## Workflow current state

Implementation: [draft PR428](https://github.com/MChartier/calibrate-health/pull/428), sole owner task01a10851-157c-744a-ae61-5a7724a800dc on verified MCHARTIER_ZBOOK, clean idle. Head 0ee7d098589beb218c4f34b370ba556f25de4498, branch mchartier/planned-pause-on-offline-contract; actual base/merge-base pinned423 7b83b3255c263efbb22fd1be1be3124bc46fc23c, branch mchartier/firebase-migration-preparation. Review423 then428. Ultimate target master acc8a30d6cde7477f08f0b7ace23df4047d21354. Original426/419 remain open/draft/unready, branches and evidence preserved.

Local and exact-head CI gates passed. Single configured engineering-review request6006632427 received quota refusal6006636132; parent423 review is separately quota-blocked. No review pass/readiness/merge claimed. SAME independent QA task01a1087f-e81d-7378-a23c-f5eec9a670ee retained for after engineering gates. [Exact handoff, published scope, tests, final body and evidence identities](https://github.com/MChartier/calibrate-health/pull/428#issuecomment-6006740288). Later operational status belongs in PR428 discussion and coordinator405.

Workflow-v3 f0919b184b6344d6279178b2388190936ca432a9; overriding pr-review-v3/queue-v1 97e5583c8355f3673aad0835c0ce3ca1486aeb8b plus four direct scope/communication/resource amendments. Human retains merge/release/deployment; coordinator owns readiness.

<details>
<summary>Prior workflow state (superseded; retained for history)</summary>



Implementation: draft replacement [PR426](https://github.com/MChartier/calibrate-health/pull/426), sole owner task01a10851-157c-744a-ae61-5a7724a800dc on MCHARTIER_ZBOOK, clean idle checkpoint. Head 4fe107e06bc8c615fe1f003fd824451fc8fe8076, branch mchartier/planned-pause-visibility-clean; actual master/base/merge-base acc8a30d6cde7477f08f0b7ace23df4047d21354, no active parent (410 merged). Original419 remains open/draft/unready and preserved.

Configured exact-head review found a remaining queued food-day refetch/reload gap overlapping separately owned423. Coordinator integration/ownership decision required before shared-code correction; no readiness claim. [Full checkpoint, tests, evidence and identities](https://github.com/MChartier/calibrate-health/pull/426#issuecomment-6004713838). Workflow-v3 f0919b184b6344d6279178b2388190936ca432a9; overriding pr-review-v3/queue-v1 97e5583c8355f3673aad0835c0ce3ca1486aeb8b. SAME QA task01a1087f-e81d-7378-a23c-f5eec9a670ee retained; prior verdicts do not transfer. Later operational status lives in PR426 discussion and coordinator405. Human retains merge/release/deployment.

<details>
<summary>Prior workflow state (superseded; retained for history)</summary>



Implementation: focused product and maintained-test change published in draft [PR #419](https://github.com/MChartier/calibrate-health/pull/419). Sole implementation owner remains task01a10851-157c-744a-ae61-5a7724a800dc on MCHARTIER_ZBOOK, clean idle.
Workflow: workflow-v3 f0919b184b6344d6279178b2388190936ca432a9 with overriding pr-review-v3/queue-v1 97e5583c8355f3673aad0835c0ce3ca1486aeb8b and focused-diff amendment in #405 comment5984018358.
Branch: mchartier/planned-pause-visibility; head 35c1be606810069b4418f6c6f8093d2087ab4f8b. Parent/base: #410 mchartier/completed-calendar-bands at 6fadbcc6a6437609ae6e2d49d73ed3da95a94b47; review410 then419, no415/418 dependency.
[Exact cleanup handoff, validation and revision/evidence identities](https://github.com/MChartier/calibrate-health/pull/419#issuecomment-5985742507). Original evidence retained on evidence/pr419-reviewed-fba1baf at fba1baf2175b7c4ad2c2c47ccbe373d618404393; original manifest digest unchanged.
Latest revision-specific QA verdicts and readiness transitions: [PR discussion](https://github.com/MChartier/calibrate-health/pull/419#discussion_bucket) and [coordinator record #405](https://github.com/MChartier/calibrate-health/issues/405). Historical verdicts do not transfer to changed revisions; coordinator owns readiness and the same QA419 assignment. Human retains merge/release/deployment decisions.

<details>
<summary>Prior workflow state (superseded; retained for history)</summary>


Phase: implementation and fresh independent QA complete; final coordinator readiness binding is tracked in PR discussion and issue405
Workflow: workflow-v3 f0919b184b6344d6279178b2388190936ca432a9 with overriding pr-review-v3/queue-v1 97e5583c8355f3673aad0835c0ce3ca1486aeb8b
Implementation hold: false; sole owner clean idle
Owner: native task01a10851-157c-744a-ae61-5a7724a800dc on verified MCHARTIER_ZBOOK
Worktree: C:\Users\MChar\Documents\Codex\2026-10-04\task-6\planned-pause
Branch: mchartier/planned-pause-visibility
Parent/base: PR410 mchartier/completed-calendar-bands at d8e55c105834093f889b2cff2a5c96d224cc6e80; review410 then419; no415/418 dependency
PR: https://github.com/MChartier/calibrate-health/pull/419 (draft)
Head: fba1baf2175b7c4ad2c2c47ccbe373d618404393
Author gates: local automated/actual-browser behavior passed; exact-head CI11 passed/14 configured skips; configured Codex review completed with no major issues; matched images/provenance and rendered PR verified
Evidence: https://github.com/MChartier/calibrate-health/blob/fba1baf2175b7c4ad2c2c47ccbe373d618404393/docs/evidence/issue-414/manifest.json; SHA-256 bb2f9a2a6c3bd57f520035b8f08bf046f389b25e80c28b6359ca88f484e104ab
PR body SHA-256: af8dc8150d05f5cdf673e98297b2f446acfa2c2a1c740b90bf616b8e2b24de9e
Author handoff: https://github.com/MChartier/calibrate-health/pull/419#issuecomment-5983809337
QA verdict: [5983927015](https://github.com/MChartier/calibrate-health/pull/419#issuecomment-5983927015), ready advisory on the recorded head/base/body/evidence; trusted task01a1087f-e81d-7378-a23c-f5eec9a670ee. Exact receipt and subsequent readiness transitions are recorded separately in issue405 and PR discussion
Next: coordinator verifies the trusted verdict and current identities, saves its separate receipt and owns readiness labeling/readback. Subsequent operational state lives in PR discussion and issue405. Sole implementation owner remains responsible for valid corrections. Human merge/release/deployment decisions remain separate.

<details>
<summary>Prior assignment state (superseded; retained for history)</summary>

Phase: assigned for implementation; actual execution and pinned-standard read acknowledgment pending
Workflow: workflow-v3 f0919b184b6344d6279178b2388190936ca432a9, explicitly overriding pr-review-v3/queue-v1 97e5583c8355f3673aad0835c0ce3ca1486aeb8b supersedes historical v2 references above
Implementation hold: false
Owner: sole native task01a10851-157c-744a-ae61-5a7724a800dc, initial turn01a10851-1c77-732d-b5af-b69dc7fe9986; assignment attempt5983389266
Branch: proposed mchartier/planned-pause-visibility, isolated worktree to verify
Parent/base: PR410 mchartier/completed-calendar-bands at d8e55c105834093f889b2cff2a5c96d224cc6e80; review410 then this child. No dependency on415/418
PR/head/QA: no PR yet; fresh independent QA after implementation gates
Next: assigned owner verifies actual host, worktree, branch and parent, acknowledges full supplied standards, implements this bounded scope and returns draft PR with actual behavioral and matched Before/After evidence. Coordinator owns readiness; human retains merge/release/deployment

</details>

</details>

</details>

</details>
