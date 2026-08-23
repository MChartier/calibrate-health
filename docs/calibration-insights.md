# Plan check

Plan check is the user-facing Calibration experience on Progress. It answers two questions:

1. Does the user's recent weight trend match the configured goal rate?
2. Does the evidence support changing the daily calorie target?

It is a decision aid, not a second progress dashboard. Goal progress and the detailed weight chart remain the source of broader progress information.

## Product states

### Waiting

Waiting is shown until a decision-grade weight trend is available. The card sets expectations and names one structured blocker. It does not show provisional trend values, calorie balance, readiness meters, or countdowns.

A reliable assessment requires:

- A continuous current tracking period
- At least 14 elapsed days of weight history
- At least three weigh-ins
- A weigh-in no more than seven days old
- A sufficiently narrow weight-trend interval

A tracking pause or weight-trend segment reset restarts the assessment.

### On track

On track is shown when the retrospective weight-trend interval is sufficiently narrow and centered in the configured goal-rate band.

The card shows:

- The completed evidence period
- Recent weight trend midpoint
- The likely 95% range for that past trend
- The configured goal rate
- A no-change decision

The card explicitly says that the trend describes the period shown and is not a forecast.

### Off track

Off track is shown only when the full trend interval supports a faster, slower, above-maintenance, or below-maintenance conclusion.

The target decision remains separate:

- change_available: a materialized recommendation can be reviewed
- no_change_recommended: the current target should be kept for now
- waiting: food evidence is not ready for a target decision
- safety_limited: the safety floor blocks a lower target
- policy_unavailable: automatic adjustments are unavailable for this goal

An off-track result does not imply that the calorie target is wrong.

## Measurement

Recent weight trend is retrospective. It is the robust average slope through scale readings in the selected uninterrupted 14-42 day window.

The shared weight-trend model:

- Fits weight against calendar time
- Downweights isolated scale spikes
- Estimates uncertainty from residual scale variation, evidence spacing, and sample size
- Returns a midpoint and approximate 95% interval in kilograms per week

Food logs do not determine this trend or widen its interval. They are used with profile-estimated TDEE to decide whether a calorie-target correction is supported.

The goal rate is a planning target:

```text
daily deficit x 7 / 7,700 kcal per kilogram
```

Positive deficits produce a negative weight-change goal. Surpluses produce a positive goal. Maintenance produces zero.

The goal rate is not a prediction. The calorie target is the intervention intended to achieve it. An approved Calibration adjustment changes the calorie target while preserving the configured goal rate and profile-estimated TDEE.

## Assessment contract

`CalibrationResult.assessment` is versioned separately from recommendation model version 4.

It contains:

- state and typed pace status
- exact evidence dates and elapsed span
- retrospective weekly trend interval
- configured goal rate
- structured assessment blocker
- structured target decision and target-decision blocker
- the applicable daily calorie safety floor

The client does not parse server-authored prose. Legacy headline, summary, nextStep, historyProgress, and missingCriteria remain available for compatibility but are not rendered by Plan check.

## Recommendation behavior

Recommendation thresholds, 14-42 day action windows, fingerprints, materialization, effective dates, apply, cancel, offline invalidation, and haptics remain unchanged.

Automatic target recommendations are enforced inside the shared evaluator for adult loss goals only. Maintenance and gain goals still receive Plan check assessments but never receive automatic calorie-target changes.

The card exposes one Review adjustment action. Apply is available only inside the review sheet and only when the response contains both an evaluator recommendation and top-level materialized recommendation metadata.

Scheduled changes appear as a slim transactional banner. They do not replace the underlying assessment.

## Data retrieval

Backend evidence remains bounded:

- Food history uses the existing 90-day personal reference horizon
- Weight history uses the maximum 42-day action window plus one boundary day
- Goal-to-date descriptive reads are not required

Descriptive history therefore cannot change an otherwise identical recommendation fingerprint.

## Accessibility

Status is communicated through text and an icon; color is supplementary.

The comparison exposes one accessible summary naming:

- the completed period
- trend midpoint and likely range
- goal rate
- conclusion
- the fact that the result is retrospective, not predictive

Decorative chart internals are hidden from assistive technology. Metric and action rows stack at compact widths and large font scales.
