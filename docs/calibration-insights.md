# Calorie target calibration

Calibrate evaluates recent food and weight evidence to determine whether the profile-based calorie target appears to need a conservative correction. The configured goal deficit and profile-estimated TDEE remain unchanged; an accepted correction is stored as a dated, goal-scoped calorie-plan revision.

## Execution model

- Food, weight, goal, and profile writes do not wait for calibration.
- The Expo client invalidates calibration status after relevant mutations.
- `GET /api/v1/calibration/status` evaluates the latest bounded history synchronously when Progress is opened or refetched.
- The current local day participates only after the user marks it complete. Otherwise the observation end is the prior local day.
- No nightly scheduler is required. A new local date changes the input fingerprint on the next read.
- `POST /api/v1/calibration/recommendations/:id/apply` re-evaluates the evidence and rejects stale suggestions before creating a revision effective on the next user-local day.
- `POST /api/v1/calibration/recommendations/:id/cancel` lets the user undo a scheduled revision before it becomes effective and restores the recommendation for review.
- Once a revision is scheduled, status returns the resulting absolute daily calorie budget and suppresses stale recommendation narrative until the revision becomes effective or is canceled.

## Evidence and uncertainty

The pure evaluator lives in `shared/calibration.ts` and is shared by the service, tests, and development lab.

- A descriptive pace insight can appear after 7 plausible completed food-log days and weigh-ins spanning 7 days. The Progress card shows each requirement separately until both are ready.
- Recommendations require at least 14 days, 7 plausible completed food days, at least 3 weights in the latest uninterrupted segment spanning 14 days, and a sufficiently narrow correction interval.
- Observation windows expand through 14, 21, 28, 35, and 42 days. The shortest actionable window wins; otherwise the longest available window powers a descriptive insight.
- The latest food-tracking pause is a hard evidence boundary. Paused days and all earlier food and weight evidence are excluded, so intake before and after a break is never averaged into one calibration result. After resuming, Progress explicitly shows fresh progress toward the next pace check.
- A plausible completed food day contains at least two entries across at least two meal periods and a calorie total within profile-relative plausibility bounds.
- Missing, incomplete, and suspicious completed days remain in the calculation as conservative personal intake ranges. They are never treated as zero intake or silently discarded.
- Calibration model version 4 refits the shared forward-only weight-trend model to raw weights inside every candidate window. Only the latest uninterrupted segment is eligible, so a gap longer than 14 days resets pace evidence. Its robust window-average pace uses the same 14/21/28/35/42-day scope as the selected food evidence; the separate Kalman velocity state describes current momentum in Weight Trend Details.
- A latest weigh-in 8-14 days old may support a descriptive pace but cannot produce a calorie-budget recommendation. After 14 days pace is suppressed until a new segment begins.
- Four hundred deterministic bootstrap samples combine food ranges with samples from the matching-window average-pace distribution. Calibration no longer samples the first and last underlying-weight bands independently. The result is not presented or persisted as a replacement TDEE.
- Activity summaries are not queried or shown because they do not change the calorie-budget estimate.
- User-facing pace copy follows the configured weight unit; persisted and API estimate fields remain kilograms so the model contract stays stable.

Recommendations are limited to 150 kcal per accepted revision and rounded to 25 kcal. Calibrate applies a conservative BMR-based limit of `max(BMR, 1000 kcal/day)`; when the current target is already at or below that limit, calibration does not reverse a downward signal into an upward recommendation. Accepted revisions apply only to the goal that produced them, so creating a maintenance, gain, or replacement loss goal restores that goal's unadjusted profile target. The service currently materializes recommendations only for adult users with an active weight-loss goal.

Recommendation fingerprints include calibration model version 4, goal and plan boundary, profile-derived calorie inputs, food history, and raw weight history. Display-unit and observational activity changes are intentionally excluded because they can change presentation without changing the suggested action. Pending recommendations from an older model version are marked stale by the release migration and whenever status is evaluated. Accepted calorie-plan revisions are historical decisions and remain unchanged.

If `WEIGHT_TREND_MODEL=v1` is selected for operational rollback, model-v4 calibration is temporarily suppressed because v1 has no calibrated pace distribution. Pending recommendations become stale, while accepted and scheduled calorie-plan revisions continue unchanged.

## Development history lab

Run the stateless preset explorer with:

```sh
npm run dev:calibration-lab
```

The local Node lab uses the same compiled shared evaluator as the service and renders the same `CalibrationInsightCardView` React component shown on Progress. The end-user preview therefore stays aligned with product copy, hierarchy, evidence details, responsive behavior, and interaction states. Recommendation apply, scheduled confirmation, and undo are simulated locally; the JSON editor and raw evaluator output remain available as developer diagnostics.

The lab includes 16 histories covering all four statuses, a post-pause restart, both budget-adjustment directions, kilograms and pounds, a prior-adjustment reversal, adherence-driven pacing, incomplete history, ignored activity input, weight uncertainty, BMR-based limit behavior, and the 42-day observation cap. Maintenance and gain signs remain evaluator-tested but are intentionally absent from the end-user preview because recommendations are materialized only for active weight-loss goals. The JSON editor validates structure and semantic constraints, including date uniqueness, units, nonnegative inputs, and positive raw weights, without writing user data or waiting for real-world observation windows.

Preset states can be linked directly with `?scenario=<scenario-id>`, for example:

```text
http://127.0.0.1:5173/?scenario=missing-and-suspicious
```

See [Calibration insight manual QA](calibration-insight-qa.md) for the tested state matrix, findings, screenshots, and remaining limitations.
