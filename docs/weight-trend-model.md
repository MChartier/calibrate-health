# Weight Trend Model

## Purpose

This document explains the weight trend model used by the Goals chart so we can:

- understand how trend values and uncertainty are computed
- reason about the assumptions in the model
- tune behavior safely when we want different responsiveness or stability

The implementation lives primarily in `backend/src/services/weightTrend.ts`, with materialization + recompute windowing in `backend/src/services/materializedWeightTrend.ts`, API wiring in `backend/src/routes/metrics.ts`, and chart rendering in `frontend/src/pages/Goals.tsx`.

## High-Level Flow

1. We start with timestamped weight logs stored in grams.
2. We define a bounded modeling window from the latest metric date:
   - active trend horizon: latest 120 days
   - warmup context: prior 30 days
3. We convert grams to kilograms (unrounded) for all model calculations.
4. We sort windowed observations by date and estimate a recency-weighted linear drift (weight change per day).
5. We estimate measurement noise and process noise from robust residual statistics.
6. We run a 1D Kalman filter to estimate the latent trend weight at each observation.
7. We materialize only active-horizon trend points for API reads.
8. We convert trend outputs back to the user's display unit for API responses.
9. The frontend renders:
   - raw weight points
   - trend line
   - expected range band (95% CI)

## API Contract And Chart Behavior

When `GET /api/metrics` is called with `include_trend=true`, the response includes:

- per-point fields:
  - `trend_weight`
  - `trend_std`
  - `trend_ci_lower`
  - `trend_ci_upper`
- metadata:
  - `weekly_rate`
  - `volatility`
  - `total_points`
  - `total_span_days`

Trend fields are always numeric in this response shape; if no modeled point is available for a date, the API falls back to the raw weight for `trend_weight` and `trend_ci_*`, and `0` for `trend_std`.

Important route behavior (`backend/src/routes/metrics.ts`):

- `include_trend=true` switches to trend modeling output.
- `range` accepts `week`, `month`, `year`, `all`.
- `start` and `end` apply absolute date filters.
- legacy `smoothing` applies only to non-trend mode.
- trend modeling runs in kilograms internally, then `trend_*` and `weekly_rate` are converted to user unit at serialization.
- trend values older than the active horizon are intentionally ignored at read time (raw weight fallback is used), even if older materialized rows still exist.

Important materialization behavior (`backend/src/services/materializedWeightTrend.ts`):

- write-time refresh recomputes only a bounded model window (active horizon + warmup), not full history.
- write-time refresh reads only that bounded window from the database (`BodyMetric.date >= modelStartDate`) to avoid full-history over-fetching.
- refresh rewrites only trend rows in the active horizon.
- read-time ensure checks missing/stale trend rows only in the active horizon.
- if write-time refresh fails, existing trend rows are invalidated so the next trend read forces a fresh recompute.

## Materialized Trend Horizon

The trend system uses two windows anchored to the most recent metric date:

- active horizon (`MATERIALIZED_TREND_ACTIVE_HORIZON_DAYS = 120`):
  - days that receive materialized trend/confidence values and influence chart trend rendering.
- warmup (`MATERIALIZED_TREND_WARMUP_DAYS = 30`):
  - extra context included in model fitting so the first active-horizon points are stable.

Why this split exists:

- old history should not materially influence today's trend behavior.
- a short warmup avoids boundary artifacts from abruptly starting the filter at the first active day.
- limiting to the recent window reduces write-time recompute cost for long-lived accounts.

Effect on old points:

- points older than the active horizon fall back to raw-weight trend fields (`trend_weight = weight`, `trend_ci_* = weight`, `trend_std = 0`).
- this is intentional: recent trend interpretation remains responsive and computationally bounded.

Important chart behavior (`frontend/src/pages/Goals.tsx`):

- if two adjacent dates are separated by more than 21 days, the chart inserts a null break so the line and band do not interpolate across long gaps
- range controls are shown when total span or point count exceeds the configured thresholds

## Model Inputs And Outputs

### Inputs

- model observations: `{ date: Date, weight: number }[]` in kilograms

### Outputs

- model output series (`kg`):
  - `points[]` with:
    - `trendWeight`
    - `trendStd`
    - `lower95`
    - `upper95`
- summary:
  - `weeklyRate`
  - `volatility` (`low`, `medium`, `high`)
- diagnostics:
  - `params.driftPerDay`
  - `params.measurementVariance`
  - `params.processVariance`

The API converts these model outputs to `KG` or `LB` for response fields (`trend_weight`, `trend_ci_*`, `trend_std`, `meta.weekly_rate`).

## Math Details

### 1) Initialization (Cold Start)

For the first observation:

- `x0 = y0` (initial trend equals first measured weight)
- `P0 = measurementVariance`

This anchors the first trend point at the user's first observed value, then uncertainty is updated through the standard Kalman equations.

### 2) Drift Estimation

Let:

- `x_i` = continuous day offset from first log (`(timestamp_i - timestamp_0) / MS_PER_DAY`)
- `y_i` = observed weight

Estimated drift per day uses recency-weighted least squares:

- `w_i = exp(-ln(2) * ageDays_i / 30)` (`DRIFT_RECENCY_HALF_LIFE_DAYS = 30`)
- `x_wbar = sum(w_i * x_i) / sum(w_i)`
- `y_wbar = sum(w_i * y_i) / sum(w_i)`
- `drift = sum(w_i * (x_i - x_wbar) * (y_i - y_wbar)) / sum(w_i * (x_i - x_wbar)^2)`

This is used as the baseline day-to-day trend in the prediction step.
Recency weighting lets recent momentum dominate while still retaining some historical context.
This is still a linear-drift approximation, so multi-phase behavior is smoothed into a single local slope.
If weighted regression becomes numerically degenerate, implementation falls back to an unweighted least-squares slope.

### 3) Variance Estimation

To make noise estimation robust to spikes, the model computes an EWMA-smoothed series:

- time constant: `EWMA_TIME_CONSTANT_DAYS = 7`
- per-step alpha: `alpha = 1 - exp(-deltaDays / 7)`

Residual families:

- measurement residuals: `observedWeight - ewmaWeight`
- process residuals: `(ewmaDelta - drift * deltaDays) / sqrt(deltaDays)`

Interpretation:

- measurement variance models observation noise (scale, hydration, timing, etc.)
- process variance models uncertainty in how the latent true-weight state evolves between observations

A robust standard deviation estimate is derived from median absolute deviation:

`robustStd = 1.4826 * median(|r_i - median(r)|)`

Then values are clamped to model bounds and converted to variances.
This variance calibration is empirical/heuristic (robust residual statistics), not a formal maximum-likelihood fit of the state-space model.

### 4) Kalman Filtering

State:

- latent trend weight `x`
- posterior variance `P`

For each observation:

1. Predict
   - `predictionDeltaDays = min(deltaDays, 14)` (`MAX_PREDICTION_GAP_DAYS`)
   - `x = x + driftPerDay * predictionDeltaDays`
   - `P = P + processVariance * predictionDeltaDays`
   - For long gaps, we intentionally do not propagate process growth beyond 14 days; the next observation then re-anchors via the update step.

2. Update
   - measurement `z = observedWeight`
   - innovation `v = z - x`
   - innovation variance `S = P + measurementVariance`
   - Kalman gain `K = P / S`
   - `x = x + K * v`
   - `P = max(1e-8, (1 - K) * P)` (`MIN_POSTERIOR_VARIANCE`)

3. Uncertainty band
   - `trendStd = sqrt(P)`
   - `lower95 = x - 1.96 * trendStd`
   - `upper95 = x + 1.96 * trendStd`
   - (`TREND_CONFIDENCE_Z_SCORE = 1.96`)

The API fields are named `trend_ci_lower`/`trend_ci_upper` for compatibility, but semantically this is a Gaussian uncertainty band around the latent trend estimate.

### 5) Weekly Rate

Weekly rate is computed from trend points (not raw points), using the latest window of up to 14 points:

`weeklyRate = ((trend_latest - trend_earliest) / daySpan) * 7`

This gives a recent rate of change per week in kilograms (converted to user unit in API responses).

Edge behavior:

- fewer than 2 points -> `weeklyRate = 0`
- `daySpan` is clamped to at least 1 day to avoid divide-by-zero when timestamps collapse to the same day
- the window is point-based (`RECENT_WINDOW_POINTS`), not strictly day-based

### 6) Volatility Label

The model takes the median `trendStd` over recent points and compares it to kg-calibrated thresholds:

- below low threshold: `low`
- below medium threshold: `medium`
- otherwise: `high`

## Constants And Defaults

Core constants in `backend/src/services/weightTrend.ts`:

- `EWMA_TIME_CONSTANT_DAYS = 7`
- `RECENT_WINDOW_POINTS = 14`
- `DRIFT_RECENCY_HALF_LIFE_DAYS = 30`
- `TREND_CONFIDENCE_Z_SCORE = 1.96`
- `MIN_POSTERIOR_VARIANCE = 1e-8`
- `MAX_PROCESS_TO_MEASUREMENT_VARIANCE_RATIO = 0.35`
- `MAX_PREDICTION_GAP_DAYS = 14`

Materialization window constants in `backend/src/services/materializedWeightTrend.ts`:

- `MATERIALIZED_TREND_ACTIVE_HORIZON_DAYS = 120`
- `MATERIALIZED_TREND_WARMUP_DAYS = 30`

### Model Defaults (KG Internal)

- `measurementStd = 0.9`
- `processStd = 0.1`
- `measurementStd` bounds: `[0.25, 3.5]`
- `processStd` bounds: `[0.02, 0.6]`
- volatility thresholds: `0.5` (low), `1.2` (medium)

### API Boundary Conversion

- stored grams -> model kilograms: `kg = grams / 1000`
- model kilograms -> pounds: `lb = kg * 2.2046226218487757`
- no model-time conversion depends on user unit, so the underlying trend is unit-invariant

## Assumptions

- Weight is modeled as a latent smooth signal plus noise.
- Drift is approximately linear over the historical window used for slope estimation.
- The model deliberately prioritizes recent history by restricting materialized trend output to a bounded active horizon.
- Day-to-day fluctuations are treated as noise around that latent trend.
- Uncertainty is represented as a Gaussian-style band (`+/- 1.96 * std`) around the latent trend estimate.
- Long logging gaps should not imply strong trend continuity, so prediction horizon is capped.
- Trend values optimize interpretability and stability; they are not a physiological model of body composition change.

## Edge Cases

- Empty or invalid inputs return defaults with no trend points.
- Very short histories fall back to model defaults for variance.
- Non-finite values are filtered out before modeling.
- The first trend point is anchored to the first observation (`x0 = y0`).
- Initial uncertainty is set to `P0 = measurementVariance`; an alternative future tuning option is inflating `P0` when we want less confidence in day-1 anchoring.
- Posterior variance is floored to avoid numerical collapse.
- Process variance is capped relative to measurement variance to avoid runaway widening.

## Heuristic Rationale

- `MAX_PROCESS_TO_MEASUREMENT_VARIANCE_RATIO = 0.35`:
  - Limits process noise growth so trend uncertainty does not dominate measurement scale.
  - This is a practical stability guardrail (heuristic), not a domain-law constant.
- `DRIFT_RECENCY_HALF_LIFE_DAYS = 30`:
  - Sets how fast historical influence decays in drift estimation.
  - Every additional 30 days of age halves an observation's drift weight.
- Frontend chart break at `> 21` day gaps (`frontend/src/pages/Goals.tsx`):
  - Prevents drawing continuous lines/bands across sparse periods where continuity would be visually misleading.
- Weekly rate window (`RECENT_WINDOW_POINTS = 14`):
  - Balances recency with noise suppression by using trend points (not raw scale readings).

## Tuning Guide

When revising behavior, these are the main knobs and expected effects:

- `processVariance` up -> trend reacts faster, CI may widen faster
- `processVariance` down -> trend is smoother, slower to follow real shifts
- `measurementVariance` up -> raw spikes influence trend less
- `measurementVariance` down -> trend follows each point more closely
- `DRIFT_RECENCY_HALF_LIFE_DAYS` up -> drift changes more slowly (more history retained)
- `DRIFT_RECENCY_HALF_LIFE_DAYS` down -> drift adapts faster to recent regime changes
- `MAX_PREDICTION_GAP_DAYS` up -> model propagates uncertainty across longer gaps
- volatility thresholds up/down -> changes sensitivity of `low/medium/high` labels
- `MAX_PROCESS_TO_MEASUREMENT_VARIANCE_RATIO` up/down -> changes max allowed uncertainty growth from process noise

Recommended tuning workflow:

1. change one knob at a time
2. run trend unit tests and route tests
3. evaluate known scenarios: stable trend, noisy spikes, sparse logs, step-change behavior
4. confirm chart interpretation still matches product intent (transparent trend with honest uncertainty)

## Test Coverage

Model behavior is validated in `backend/test/weight-trend.test.js`, including:

- stable trends
- spike damping behavior
- uncertainty band construction
- sparse history handling
- gap behavior and uncertainty controls
- volatility classification

Route-level payload behavior is covered in `backend/test/routes-metrics.test.js`.
