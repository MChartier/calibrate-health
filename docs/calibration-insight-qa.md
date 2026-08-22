# Calibration signal QA

This checklist covers the visual signal contract shown on Progress and in the shared Calibration lab.

## Automated coverage

### Shared calculations

- Recent boundaries are exactly seven completed local dates ending on "asOfDate".
- Profile-TDEE calorie balance uses the correct deficit/surplus sign.
- Expected weight change uses 7,700 kcal/kg and remains canonical when pounds are displayed.
- Missing or incomplete food history widens the 95% interval and is never treated as zero intake.
- Continuous goals anchor to stored goal-start weight.
- Food pauses use "Since tracking resumed"; weight segment resets use "Current tracking period".
- Faster, aligned, slower, maintenance, and uncertain classifications require the complete interval to satisfy the shared tolerance.
- Descriptive signals remain available for maintenance and gain goals while target review stays ineligible.
- Existing recommendation scenarios keep model-v4 actions and the 150 kcal bound.

### Backend and API

- Food, completion, and weight evidence are fetched from goal start in one query per evidence source.
- Recommendation action input remains limited to the 90-day food reference and 14-42 day weight windows.
- Changing only older descriptive history changes long-term signals without changing the recommendation fingerprint.
- Pause scope, recommendation materialization, apply, cancel, scheduled state, and effective-date behavior remain covered.
- OpenAPI requires signal contract version 1, both signal windows, readiness, and the numeric minimum calorie target.

### Client

- Early history shows one accessible weekly progress bar, compact food/weight requirements, and an available calorie-balance tile.
- Mature history shows both range panels and their full accessible 95% summaries.
- Long-term calorie balance prints its numeric 95% range.
- Panels stack at compact width and a 1.5 font scale.
- Maintenance and gain states show measurements without an adjustment CTA.
- Structured blockers replace generated progress prose.
- Recommendations support direct Apply and compact Review adjustment flows.
- Apply errors, stale review closure, effective dates, scheduled banners, Undo, and refresh failure recovery remain covered.
- Legacy "headline", "summary", "nextStep", and "missingCriteria" values are explicitly asserted absent from the rendered card.

## Lab scenario matrix

| Preset | Expected product state | Evidence |
| --- | --- | --- |
| "not-ready" | Weekly progress and available calorie balance | [PNG](screenshots/calibration-signals/01-not-ready.png) |
| "after-pause" | Fresh post-pause progress; no pre-pause bridge | [PNG](screenshots/calibration-signals/02-after-pause.png) |
| "learning-weights" | Structured weight requirements | [PNG](screenshots/calibration-signals/03-learning-weights.png) |
| "early-insight" | Past-7-days and long-term comparisons; target-review milestone | [PNG](screenshots/calibration-signals/04-early-insight.png) |
| "on-track" | Mature aligned signals | [PNG](screenshots/calibration-signals/05-on-track.png) |
| "maintenance" | Maintenance measurements; no target CTA | [PNG](screenshots/calibration-signals/06-maintenance.png) |
| "gain" | Surplus/gain measurements; no target CTA | [PNG](screenshots/calibration-signals/07-gain.png) |
| "on-track-pounds" | All weight values rendered in pounds | [PNG](screenshots/calibration-signals/08-on-track-pounds.png) |
| "target-too-high" | Slower-than-goal signals and lower-target action | [PNG](screenshots/calibration-signals/09-target-too-high.png) |
| "scheduled" | Scheduled banner, visible signals, and Undo | [PNG](screenshots/calibration-signals/10-scheduled.png) |
| "target-too-low" | Faster-than-goal signals and higher-target action | [PNG](screenshots/calibration-signals/11-target-too-low.png) |
| "prior-adjustment-rollback" | Proposed return to baseline target | [PNG](screenshots/calibration-signals/12-prior-adjustment-rollback.png) |
| "adherence-not-target" | Logs and observed trend agree; no action | [PNG](screenshots/calibration-signals/13-adherence-not-target.png) |
| "missing-and-suspicious" | Wider food interval and readiness limitation | [PNG](screenshots/calibration-signals/14-missing-and-suspicious.png) |
| "wide-weight-uncertainty" | Uncertain goal status and weight blocker | [PNG](screenshots/calibration-signals/15-wide-weight-uncertainty.png) |
| "activity-context" | No activity-based target adjustment | [PNG](screenshots/calibration-signals/16-activity-context.png) |
| "bmr-floor" | Bounded step at the numeric safety limit | [PNG](screenshots/calibration-signals/17-bmr-floor.png) |
| "bmr-floor-blocked" | Structured safety-floor blocker | [PNG](screenshots/calibration-signals/18-bmr-floor-blocked.png) |
| "maximum-window" | Recommendation remains bounded to 42 days | [PNG](screenshots/calibration-signals/19-maximum-window.png) |

To refresh every reviewed desktop image, run the lab and then explicitly opt into evidence capture:

    npm.cmd run dev:calibration-lab
    $env:CALIBRATE_CAPTURE_SCREENSHOTS = '1'
    npm.cmd run capture:calibration-lab

## Manual visual review

Review "early-insight", "on-track", "target-too-high", "scheduled", "after-pause", "maintenance", and "gain" at:

- Desktop width with two panels side by side.
- 390 px width with panels and actions stacked.
- Desktop width at 150% text scale.
- Keyboard-only navigation through Review, Apply, Close, and Undo.
- Screen-reader output for each range chart, confirming observed and expected midpoints, both 95% ranges, goal marker, and agreement status are announced.

Confirm that color is never the only series or status identifier, long labels wrap without clipping, the scheduled banner does not replace measured signals, and no narrative conclusion is repeated in the review sheet.
