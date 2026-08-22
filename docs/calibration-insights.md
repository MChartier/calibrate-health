# Calibration progress signals

Calibration compares measured weight change with the change implied by logged calories and the configured goal rate. The Progress card presents those measurements directly. Legacy evaluator prose remains in the response for compatibility, but the product card does not render "headline", "summary", "nextStep", or "missingCriteria".

## Product contract

GET /api/v1/calibration/status returns "evaluation.signals" as additive signal contract version 1. Recommendation model version 4 and all recommendation thresholds remain unchanged.

Each signal response includes:

- "recent": the seven completed user-local calendar days ending on "asOfDate".
- "longTerm": the uninterrupted active-goal measurement period.
- Structured weekly-signal and target-review readiness.
- The canonical minimum daily calorie target used by the BMR-based safety check.

Every signal window carries its scope, dates, calendar-day count, food and weight evidence counts, average logged intake interval, estimated daily calorie deficit or surplus interval, expected weight-change interval, observed weight-change interval, planned change, goal-relative status, and logs-versus-weight agreement status. Intervals are 95% intervals.

The recent scope is always labeled "Past 7 days" when unlocked. Long-term scope is one of:

- "Since goal start" for continuous goal history.
- "Since tracking resumed" after a food-tracking pause.
- "Current tracking period" after the weight trend starts a new segment.

History before a pause or trend reset is never bridged into the displayed long-term comparison.

## Measurement rules

The current incomplete local day is excluded. If the current day is complete, it becomes "asOfDate"; otherwise the prior local day is used.

Logged calorie balance is:

    profile-estimated TDEE - modeled logged intake

A positive value is a deficit and predicts loss. A negative value is a surplus and predicts gain. Expected weight change is:

    -daily calorie balance * calendar days / 7,700 kcal per kg

The client converts weight intervals to pounds when requested. Calories out remains the profile-estimated TDEE; Calibration never exposes a weight-inferred replacement TDEE.

Missing, incomplete, and suspicious days receive conservative intake ranges. They widen the interval instead of becoming zero intake or disappearing. Four hundred deterministic bootstrap samples produce the food, balance, and expected-change intervals.

For an uninterrupted goal, long-term observed change uses the stored goal-start weight as its exact starting observation and the latest smoothed trend estimate as its endpoint. After a pause or trend reset, it compares the first and latest smoothed estimates in the current period and conservatively propagates uncertainty from both endpoints.

Goal pace uses a shared 75 kcal/day-equivalent tolerance. Faster or slower is reported only when the complete observed interval is beyond the tolerated goal-rate band. Aligned requires a sufficiently narrow interval centered in the band; otherwise the status remains uncertain. Maintenance uses explicit above- and below-maintenance statuses.

## Readiness

Before the weekly comparison unlocks, the card shows one progress bar based on the least-complete required input:

- 7 plausible completed food-log days.
- Weigh-ins spanning 7 days.
- At least 2 weigh-ins.

Once food evidence can support a calorie-balance interval, the card shows that value in an "Available now" tile even if weight comparison is still locked.

After weekly signals unlock, eligible loss goals show a compact milestone toward the 14-day target review. Once calendar thresholds are met, remaining issues are structured blocker codes, including current weigh-in, food uncertainty, weight uncertainty, adult eligibility, and the safety floor. The client maps codes to labels and never parses server-authored sentences.

Maintenance and gain goals receive the same descriptive signals. Target-review readiness is "not_eligible", and no calorie-target action is materialized.

## Recommendations and scheduling

Recommendations remain limited to adults with an active weight-loss goal and retain model version 4 behavior:

- 14-42 day action windows and the existing 90-day intake reference.
- At least 3 weights spanning 14 days in the uninterrupted segment.
- A sufficiently narrow correction interval.
- A maximum 150 kcal accepted step, rounded to 25 kcal.
- A minimum target of ceil(max(BMR, 1000 kcal/day)).

The card shows current and proposed daily targets, the bounded change, selected evidence window, direct Apply action, and Review adjustment action. The compact review shows measured rows, modeled correction range, conservative first step, numeric BMR-based safety limit, and Apply/Close controls.

A scheduled revision appears in a slim banner. Its descriptive signal panels remain visible, and Undo remains available until the effective local date. Apply revalidates the current evidence and fingerprint before creating the goal-scoped revision.

Recommendation fingerprints contain only action evidence: model and calorie-policy versions, goal and plan boundary, profile calorie inputs, the bounded 90-day food history, the 14-42 day weight/action history, and pause state. Older descriptive history can update long-term signals without staling an otherwise unchanged recommendation.

## Development lab

Run:

    npm run dev:calibration-lab

The lab renders the exported CalibrationInsightCardView used by Progress. Its 19 shared presets cover early, mature, uncertain, recommendation, scheduled, paused, maintenance, gain, pounds, BMR-limited, and maximum-window states. The "scheduled" preset starts with its recommendation applied locally so the banner and Undo behavior can be reviewed directly.

Presets are deep-linkable:

    http://127.0.0.1:5173/?scenario=scheduled

See [Calibration signal QA](calibration-insight-qa.md) for the automated and visual review matrix.
