# Calorie target calibration

Calibrate evaluates recent food and weight evidence to determine whether the profile-based calorie target appears to need a conservative correction. The configured goal deficit remains unchanged; an accepted correction is stored as a dated calorie-plan revision.

## Execution model

- Food, weight, goal, and profile writes do not wait for calibration.
- The Expo client invalidates calibration status after relevant mutations.
- `GET /api/v1/calibration/status` evaluates the latest bounded history synchronously when Progress is opened or refetched.
- The current local day participates only after the user marks it complete. Otherwise the observation end is the prior local day.
- No nightly scheduler is required. A new local date changes the input fingerprint on the next read.
- `POST /api/v1/calibration/recommendations/:id/apply` re-evaluates the evidence and rejects stale suggestions before creating a revision effective on the next user-local day.

## Evidence and uncertainty

The pure evaluator lives in `shared/calibration.ts` and is shared by the service, tests, and development lab.

- A descriptive pace insight can appear after 7 days.
- Recommendations require at least 14 days, 7 plausible completed food days, weights spanning 14 days, and a sufficiently narrow correction interval.
- Observation windows expand through 14, 21, 28, 35, and 42 days. The shortest actionable window wins; otherwise the longest available window powers a descriptive insight.
- A plausible completed food day contains at least two entries across at least two meal periods and a calorie total within profile-relative plausibility bounds.
- Missing, incomplete, and suspicious completed days remain in the calculation as conservative personal intake ranges. They are never treated as zero intake or silently discarded.
- Four hundred deterministic bootstrap samples propagate food-range and weight-trend uncertainty into the inferred TDEE and target-correction intervals.
- Health Connect activity is returned as observational context only.

Recommendations are limited to 150 kcal per accepted revision, rounded to 25 kcal, and cannot lower the target below `max(BMR, 1000 kcal/day)`. The service currently materializes recommendations only for adult users with an active weight-loss goal.

## Development history lab

Run the stateless preset explorer with:

```sh
npm run dev:calibration-lab
```

The lab includes early, on-track, adherence-driven, target-error, incomplete-history, and BMR-floor scenarios. Its JSON editor can exercise additional histories without writing user data or waiting for real-world observation windows.
