# Weight Trend Model

## Purpose

The weight trend estimates a user's likely underlying weight and recent pace from
one canonical weigh-in per local date. It is designed to reduce the influence of
hydration, weigh-in timing, scale noise, and isolated bad readings without hiding
the original measurements.

The graphed 95% interval is model uncertainty about underlying weight. It is not
a prediction interval for the next scale reading. Expected short-term reading
variation is reported separately in Trend Details.

The pure model lives in `shared/weightTrend.ts`. Persistence and bounded
recomputation live in `backend/src/services/materializedWeightTrend.ts`, the API
contract is assembled in `backend/src/routes/metrics.ts`, and client chart
geometry lives under `mobile/src/weightTrend/`.

## Version 2 Model

Each uninterrupted segment uses a forward-only local-linear Kalman filter with
state:

```text
[underlying weight in kg, pace in kg/day]
```

For elapsed time `dt` in days, the transition is:

```text
weight(t + dt) = weight(t) + pace(t) * dt
pace(t + dt) = pace(t)
```

The covariance is propagated through the full elapsed time. Process noise is
global and model-versioned. A gap longer than 14 days begins an independent
segment: the chart breaks, the new segment starts at its first reading, and pace
returns to zero with a broad prior. There is no backward smoothing, so every
point is an as-of estimate using only information available on or before that
date.

The first reading in a segment initializes the level and is not assimilated a
second time.

### Robust measurement handling

Measurement noise is estimated with two causal forward passes:

1. Run a preliminary filter using the 0.9 kg default measurement standard
   deviation.
2. At each observation, estimate innovation scale with median absolute deviation
   (MAD) using only innovations available through that date.
3. Clamp that date's estimated standard deviation to 0.25-3.5 kg.
4. Shrink it toward 0.9 kg with data weight `n / (n + 10)`.
5. Run the final filter with that causal per-date variance sequence.

Because neither pass uses later observations for an earlier state, appending a
new weigh-in does not revise previously emitted trend points.

Every finite reading is retained. Measurement innovations are Huber-weighted at
`k = 2.5`, limiting the leverage of an isolated spike while allowing sustained
changes to move the trend.

### Output intervals

For level state variance `P_weight`, the approximate 95% underlying-weight
interval is:

```text
estimate +/- 1.96 * sqrt(P_weight)
```

Each point persists the local velocity-state estimate and its approximate 95%
interval. The public weekly-rate insight is the latest velocity state scaled to
one week, so its estimate and interval answer what the model believes the current
direction and rate are as of the latest observation. The deterministic lab
calibrates that state interval against changing pace paths generated at the
versioned process-noise scale.

A separate robust actual-date regression estimates average pace over a bounded
7-42 day window (28 days by default). It is named `windowAverageRate` in the
shared result and is used by calibration with the same window as the food
evidence. Huber weights limit isolated spikes. The state and regression answer
different questions and are not interchangeable.

Short-term reading variability is the robust measurement standard deviation.
Trend Details reports its central-80% half-width as:

```text
1.2816 * measurement standard deviation
```

This describes likely measurement variation associated with hydration,
weigh-in timing, and scale noise. It does not claim to model true intraday body
weight.

## Evidence, Pace, and Freshness

Evidence is evaluated on the latest uninterrupted segment:

- `insufficient`: fewer than two observations
- `provisional`: at least two observations, but fewer than three or less than
  seven days of span
- `sufficient`: at least three observations spanning at least seven days

Current pace is unavailable until the latest segment spans seven days. Calibration
has a stricter gate: at least three observations spanning 14 days.

Freshness is scoped to the requested as-of date:

- `current`: latest reading is no more than seven days old
- `stale`: latest reading is 8-14 days old
- `outdated`: latest reading is more than 14 days old; pace is suppressed

An explicit historical `end` query performs a bounded as-of model pass rather
than attaching today's summary to old points.

## Bounded Persistence

The newest eligible reading anchors a 120-day active horizon. The preceding 30
days are read as warmup context, for a maximum 150-day as-of model input. Only
active-horizon points are materialized. Older Year/All measurements remain raw
context and have no synthetic zero-width trend interval.

`BodyMetricTrend` stores level and 95% bounds in integer grams and nullable pace
state/standard deviation in floating-point grams per day. Rows are replaced in a
single database transaction and carry `model_version = 2`, so stale v1 rows are
recomputed.

Future-local-date rows are excluded from modeling. New future-local-date metric
writes are rejected at the API boundary.

## API Contract

`GET /api/v1/metrics?include_trend=true` preserves the legacy per-point fields and
newest-first response ordering. Modeled points additionally identify segment
starts. Older context remains a measurement-only point.

The additive `meta.trend_summary` contains:

- model version, as-of date, interval kind, and confidence level
- modeled boundary, observation counts/span, evidence, and freshness
- latest underlying-weight estimate and bounds
- nullable current weekly velocity-state estimate and bounds
- measurement standard deviation and central-80% reading-variation half-width

Legacy `meta.weekly_rate` and `meta.volatility` remain for older clients but are
deprecated. New fields use `null` when evidence is unavailable; zero is a valid
estimate and is never used as an availability sentinel.

## Client Presentation

- X coordinates use real local dates rather than observation indexes.
- Raw measurements are dots without a connecting raw line.
- Trend lines and band polygons split at gaps longer than 14 days.
- Year/All marks the start of the recent modeled window; selecting older context
  shows measurement only.
- The compact Progress preview shows the smoothed line and latest estimate.
- Trend Details shows the 95% underlying-weight range, evidence, freshness, and
  short-term reading variation, plus the current velocity-state pace and range.
- Band boundaries do not depend on color alone, the chart has a concise
  accessibility summary, and point selection includes previous/next controls.

Goal progress remains in the adjacent goal card. The weight trend chart does not
draw a target line or calculate an observed-trend ETA.

## Calibration

Calibration model version 4 refits this same shared model to raw weights inside
each eligible post-goal/post-pause window. It uses only the latest uninterrupted
segment and samples a robust window-average pace distribution over the exact
selected food-evidence window inside the deterministic calorie bootstrap. The
instantaneous velocity state remains the public current-rate insight; it is not
substituted for average weight change in the energy-balance calculation.

Pending recommendations are invalidated by the model-version fingerprint.
Already accepted calorie-plan revisions remain unchanged.

When `WEIGHT_TREND_MODEL=v1` is selected for rollback, calibration v4 is
suppressed because the compatibility model has no calibrated pace distribution.
Pending recommendations become stale, while accepted and scheduled plan
revisions continue unchanged.

## Validation and Tuning

Deterministic tests cover flat and linear trends, supported loss/gain rates,
hydration spikes, outlier runs, cadence changes, plateaus, reversals, backfills,
and segment gaps. Release gates require:

- empirical level, local velocity-state, and window-average pace interval coverage of
  90-98%
- stable/linear level RMSE no more than 5% worse than v1
- improved sustained-reversal detection
- recovery after one +/-3 kg spike without a lasting direction reversal
- input-order and kg/lb invariance
- append-one historical stability
- exact segment, evidence, freshness, materialization, and historical-as-of
  behavior

Process-noise constants are selected deterministically: first meet coverage and
safety gates, then minimize level RMSE and sustained-change detection lag. Any
future constant change must bump the model version and rerun the comparison lab.

Run the deterministic comparison lab with:

```sh
npm run test:weight-trend-lab
```

The checked-in benchmark reports both v1 and v2 level RMSE, empirical level,
velocity-state, and window-average pace coverage, reversal lag, spike recovery,
cadence behavior, and bounded-run
performance.

Deployment accepts `WEIGHT_TREND_MODEL=v1|v2` and defaults to v2. Enable v2
together with its schema migration and retain v1 as a rollback path during
rollout. The private diagnostics endpoint reports the `weight_trend_recompute`
operation's success/failure counts and duration buckets; it never records raw
weights.
