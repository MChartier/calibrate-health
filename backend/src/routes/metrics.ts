import express from 'express';
import { type BodyMetric, type BodyMetricTrend, type Prisma } from '@prisma/client';
import prisma from '../config/database';
import {
    gramsToWeight,
    isWeightUnit,
    parseWeightToGrams,
    type WeightUnit
} from '../utils/units';
import {
    MS_PER_DAY,
    addUtcDays,
    addUtcYearsClamped,
    formatDateToLocalDateString,
    getSafeUtcTodayDateOnlyInTimeZone,
    getUtcTodayDateOnlyInTimeZone,
    parseLocalDateOnly
} from '../utils/date';
import { parseNonNegativeNumber, parsePositiveInteger } from '../utils/requestParsing';
import {
    computeWeightTrend,
    summarizeWeightTrend,
    type VolatilityLevel,
    type WeightTrendEvidenceStatus,
    type WeightTrendRateStatus,
    type WeightTrendResult
} from '../services/weightTrend';
import {
    ensureMaterializedWeightTrends,
    getMaterializedTrendWindowFromLatestDate,
    refreshMaterializedWeightTrendsBestEffort,
    WEIGHT_TREND_MODEL_VERSION
} from '../services/materializedWeightTrend';
import {
    ClientOperationConflictError,
    executeIdempotentMutation,
    parseClientOperationId,
    recordSyncChange
} from '../services/clientOperations';
import { getAuthenticatedUser, requireAuthenticatedUser } from '../middleware/authenticatedUser';
import {
    evaluateMetricProgressUpdate,
    type MetricProgressGoal,
    type MetricProgressHistoryEntry,
    type MetricSaveKind
} from '../services/metricProgress';

/**
 * Weight and body metric log endpoints.
 *
 * We store metrics as date-only values and convert weights using the user's unit preference.
 */
const router = express.Router();

const ROLLING_WEIGHT_AVERAGE_DAYS = 7; // Rolling window length for weight smoothing requests.
const WEEK_COMPARISON_DAYS = 7; // Includes both endpoints so the chart can compare the same weekday.
const FOUR_WEEK_COMPARISON_DAYS = 28; // Includes both endpoints for a four-weeks-ago comparison.
const GRAMS_PER_KILOGRAM = 1000; // Canonical conversion used for trend serialization.
const POUNDS_PER_KILOGRAM = 2.2046226218487757; // High-precision factor so trend math stays unit-invariant.
const CENTRAL_80_Z_SCORE = 1.2815515655446004; // Half-width multiplier for the central 80% normal interval.
const TREND_CURRENT_MAX_AGE_DAYS = 7; // A reading from the last week is current evidence.
const TREND_STALE_MAX_AGE_DAYS = 14; // Older evidence is stale through two weeks, then outdated.
const METRICS_RANGE_OPTIONS = {
    WEEK: 'week',
    MONTH: 'month',
    YEAR: 'year',
    ALL: 'all'
} as const;

type MetricsRange = (typeof METRICS_RANGE_OPTIONS)[keyof typeof METRICS_RANGE_OPTIONS];

type MetricRecord = Pick<BodyMetric, 'id' | 'user_id' | 'date' | 'weight_grams' | 'body_fat_percent'>;
type MetricTrendRecord = Pick<
    BodyMetricTrend,
    | 'trend_weight_grams'
    | 'trend_ci_lower_grams'
    | 'trend_ci_upper_grams'
    | 'trend_std_grams'
    | 'trend_rate_grams_per_day'
    | 'trend_rate_std_grams_per_day'
    | 'model_version'
>;
type MetricRecordWithTrend = MetricRecord & { trend: MetricTrendRecord | null };
type MetricAverage = { metric: MetricRecord; averageWeightGrams: number };
type SerializedMetric = {
    id: number;
    user_id: number;
    date: Date;
    body_fat_percent: number | null;
    weight: number;
};
type SerializedTrendMetric = SerializedMetric & {
    trend_is_materialized: boolean;
    trend_segment_start?: boolean;
    trend_weight: number;
    trend_ci_lower: number;
    trend_ci_upper: number;
    trend_std: number;
};
type TrendMetricsResponse = {
    metrics: SerializedTrendMetric[];
    meta: {
        weekly_rate: number;
        volatility: VolatilityLevel;
        total_points: number;
        total_span_days: number;
        trend_summary: TrendSummary;
    };
};

type TrendSummaryStatus = 'insufficient' | 'provisional' | 'sufficient' | 'stale';
type TrendSummaryEvidence = Exclude<TrendSummaryStatus, 'stale'>;
type TrendSummaryFreshness = 'current' | 'stale' | 'outdated';
type TrendSummary = {
    status: TrendSummaryStatus;
    evidence: TrendSummaryEvidence;
    freshness: TrendSummaryFreshness;
    model_version: number;
    as_of_date: string;
    scope_start_date: string | null;
    scope_end_date: string | null;
    latest_observation_date: string | null;
    days_since_latest: number | null;
    modeled_start_date: string | null;
    returned_points: number;
    modeled_points: number;
    observation_span_days: number;
    segment_start_date: string | null;
    interval_kind: 'latent_weight_model_uncertainty';
    confidence_level: 0.95;
    latest_trend: {
        weight: number;
        lower: number;
        upper: number;
    } | null;
    weekly_rate: {
        estimate: number;
        std: number;
        lower: number;
        upper: number;
        point_count: number;
        span_days: number;
        evidence: TrendSummaryEvidence;
        interval_kind: 'local_velocity_state_model_uncertainty';
    } | null;
    short_term_variation: {
        standard_deviation: number;
        central_80_half_width: number;
    } | null;
};

function formatLocalDateForTimeZone(date: Date, timeZone: string): string {
    try {
        return formatDateToLocalDateString(date, timeZone);
    } catch {
        return formatDateToLocalDateString(date, 'UTC');
    }
}

/**
 * Parse the smoothing query parameter into a rolling window size.
 *
 * Returns:
 * - number: enable smoothing with the specified window
 * - null: smoothing disabled or absent
 * - undefined: invalid value supplied
 */
function parseSmoothingDays(value: unknown): number | null | undefined {
    if (value === undefined) return null;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    if (trimmed === 'false' || trimmed === '0' || trimmed === 'off') return null;
    if (trimmed === 'true' || trimmed === '1' || trimmed === `${ROLLING_WEIGHT_AVERAGE_DAYS}d`) {
        return ROLLING_WEIGHT_AVERAGE_DAYS;
    }

    return undefined;
}

/**
 * Parse an opt-in query flag.
 *
 * Returns:
 * - boolean: valid flag value
 * - undefined: invalid value supplied
 */
function parseBooleanFlag(value: unknown, fallback: boolean): boolean | undefined {
    if (value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return fallback;
    if (trimmed === 'true' || trimmed === '1' || trimmed === 'on') return true;
    if (trimmed === 'false' || trimmed === '0' || trimmed === 'off') return false;
    return undefined;
}

/**
 * Parse a relative range option used by the chart UI.
 *
 * Returns:
 * - range key: valid option
 * - null: absent/disabled
 * - undefined: invalid option
 */
function parseRangeOption(value: unknown): MetricsRange | null | undefined {
    if (value === undefined) return null;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;

    switch (trimmed) {
        case METRICS_RANGE_OPTIONS.WEEK:
        case METRICS_RANGE_OPTIONS.MONTH:
        case METRICS_RANGE_OPTIONS.YEAR:
        case METRICS_RANGE_OPTIONS.ALL:
            return trimmed;
        default:
            return undefined;
    }
}

/**
 * Compute rolling averages using calendar-day windows, so gaps in logging do not inflate the window size.
 */
function computeRollingAverageWeights(metrics: MetricRecord[], windowDays: number): MetricAverage[] {
    if (metrics.length === 0) return [];

    const results: MetricAverage[] = [];
    let windowStartIndex = 0;
    let windowSum = 0;

    for (let i = 0; i < metrics.length; i += 1) {
        const metric = metrics[i];
        windowSum += metric.weight_grams;

        const windowStartDate = addUtcDays(metric.date, -(windowDays - 1));
        while (metrics[windowStartIndex].date < windowStartDate) {
            windowSum -= metrics[windowStartIndex].weight_grams;
            windowStartIndex += 1;
        }

        const windowCount = i - windowStartIndex + 1;
        results.push({ metric, averageWeightGrams: windowSum / windowCount });
    }

    return results;
}

/**
 * Apply explicit start/end date filters.
 */
function applyAbsoluteDateFilter<T extends { date: Date }>(rows: T[], start?: Date, end?: Date): T[] {
    if (!start && !end) return rows;
    return rows.filter((row) => {
        if (start && row.date < start) return false;
        if (end && row.date > end) return false;
        return true;
    });
}

/**
 * Apply a relative date window anchored to the user's current local date.
 */
function applyRelativeRangeFilter<T>(
    rows: T[],
    range: MetricsRange | null,
    rangeEndDate: Date,
    getDate: (row: T) => Date
): T[] {
    if (range === null || range === METRICS_RANGE_OPTIONS.ALL || rows.length === 0) {
        return rows;
    }

    let startDate: Date;
    switch (range) {
        case METRICS_RANGE_OPTIONS.WEEK:
            startDate = addUtcDays(rangeEndDate, -WEEK_COMPARISON_DAYS);
            break;
        case METRICS_RANGE_OPTIONS.MONTH:
            startDate = addUtcDays(rangeEndDate, -FOUR_WEEK_COMPARISON_DAYS);
            break;
        case METRICS_RANGE_OPTIONS.YEAR:
            startDate = addUtcYearsClamped(rangeEndDate, -1);
            break;
        default:
            return rows;
    }
    return rows.filter((row) => {
        const rowDate = getDate(row);
        return rowDate >= startDate && rowDate <= rangeEndDate;
    });
}

/**
 * Compute the day span covered by a sorted list of metrics.
 */
function getMetricsSpanDays(rows: { date: Date }[]): number {
    if (rows.length === 0) return 0;
    if (rows.length === 1) return 1;

    const first = rows[0].date;
    const last = rows[rows.length - 1].date;
    const rawDays = Math.round((last.getTime() - first.getTime()) / MS_PER_DAY);
    return Math.max(1, rawDays + 1);
}

function formatDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function mapEvidenceStatus(status: WeightTrendEvidenceStatus | WeightTrendRateStatus): TrendSummaryEvidence {
    if (status === 'insufficient') return 'insufficient';
    if (status === 'limited') return 'provisional';
    return 'sufficient';
}

/** Compute one bounded v2 model pass ending on the requested account-local as-of day. */
function computeBoundedWeightTrend(
    metricsAsc: MetricRecordWithTrend[],
    asOfDate: Date
): { result: WeightTrendResult; activeTrendStartDate: Date | null } {
    const eligible = metricsAsc.filter((metric) => metric.date <= asOfDate);
    const latestMetric = eligible[eligible.length - 1];
    if (!latestMetric) {
        return {
            result: computeWeightTrend([], { asOfDate }),
            activeTrendStartDate: null
        };
    }

    const { activeStartDate, modelStartDate } = getMaterializedTrendWindowFromLatestDate(latestMetric.date);
    const modelMetrics = eligible.filter((metric) => metric.date >= modelStartDate);
    return {
        result: computeWeightTrend(
            modelMetrics.map((metric) => ({
                date: metric.date,
                weight: metric.weight_grams / GRAMS_PER_KILOGRAM
            })),
            { asOfDate }
        ),
        activeTrendStartDate: activeStartDate
    };
}

/** Overlay an as-of model result for historical requests without mutating current materialized rows. */
function applyComputedTrend(
    metricsAsc: MetricRecordWithTrend[],
    trendResult: WeightTrendResult,
    activeTrendStartDate: Date | null
): MetricRecordWithTrend[] {
    if (!activeTrendStartDate) return metricsAsc.map((metric) => ({ ...metric, trend: null }));

    const pointsByDate = new Map(trendResult.points.map((point) => [point.date.getTime(), point]));
    return metricsAsc.map((metric) => {
        const point = pointsByDate.get(metric.date.getTime());
        if (!point || metric.date < activeTrendStartDate) return { ...metric, trend: null };
        return {
            ...metric,
            trend: {
                trend_weight_grams: Math.round(point.trendWeight * GRAMS_PER_KILOGRAM),
                trend_ci_lower_grams: Math.round(point.lower95 * GRAMS_PER_KILOGRAM),
                trend_ci_upper_grams: Math.round(point.upper95 * GRAMS_PER_KILOGRAM),
                trend_std_grams: Math.round(point.trendStd * GRAMS_PER_KILOGRAM),
                trend_rate_grams_per_day: point.trendRatePerDay * GRAMS_PER_KILOGRAM,
                trend_rate_std_grams_per_day: point.trendRateStdPerDay * GRAMS_PER_KILOGRAM,
                model_version: WEIGHT_TREND_MODEL_VERSION
            }
        };
    });
}

/**
 * Convert internal kilogram trend values into the user's display unit without chart-destabilizing rounding.
 */
function kilogramsToWeightUnit(kilograms: number, weightUnit: WeightUnit): number {
    if (weightUnit === 'KG') return kilograms;
    return kilograms * POUNDS_PER_KILOGRAM;
}

/**
 * Convert materialized trend values stored in grams to the user's display unit.
 */
function trendGramsToWeightUnit(grams: number, weightUnit: WeightUnit): number {
    return kilogramsToWeightUnit(grams / GRAMS_PER_KILOGRAM, weightUnit);
}

/**
 * Build the legacy metrics response shape.
 */
function serializeMetrics(
    rows: Array<{ metric: MetricRecord; averageWeightGrams: number }>,
    weightUnit: WeightUnit
): SerializedMetric[] {
    return rows
        .slice()
        .reverse()
        .map(({ metric, averageWeightGrams }) => {
            const { weight_grams, ...rest } = metric;
            return {
                ...rest,
                weight: gramsToWeight(averageWeightGrams, weightUnit)
            };
        });
}

/**
 * Build the trend-augmented response shape for chart rendering.
 */
function buildTrendMetricsResponse(
    metricsAsc: MetricRecordWithTrend[],
    filteredAsc: MetricRecordWithTrend[],
    weightUnit: WeightUnit,
    activeTrendStartDate: Date | null,
    trendResult: WeightTrendResult,
    asOfDate: Date
): TrendMetricsResponse {
    const activeTrendStartMs = activeTrendStartDate ? activeTrendStartDate.getTime() : Number.POSITIVE_INFINITY;
    const hasActiveTrend = (metric: MetricRecordWithTrend): metric is MetricRecord & { trend: MetricTrendRecord } =>
        metric.trend !== null &&
        metric.trend !== undefined &&
        metric.date.getTime() >= activeTrendStartMs &&
        (metric.trend.model_version === undefined || metric.trend.model_version === WEIGHT_TREND_MODEL_VERSION);

    const legacyTrendSummary = summarizeWeightTrend(
        metricsAsc
            .filter(hasActiveTrend)
            .map((metric) => ({
                date: metric.date,
                trendWeight: metric.trend.trend_weight_grams / GRAMS_PER_KILOGRAM,
                trendStd: metric.trend.trend_std_grams / GRAMS_PER_KILOGRAM
            }))
    );
    const segmentStartDates = new Set(
        trendResult.points.filter((point) => point.isSegmentStart).map((point) => point.date.getTime())
    );

    const metrics: SerializedTrendMetric[] = filteredAsc
        .slice()
        .reverse()
        .map((metric) => {
            const weight = gramsToWeight(metric.weight_grams, weightUnit);
            const trend = hasActiveTrend(metric) ? metric.trend : null;
            return {
                id: metric.id,
                user_id: metric.user_id,
                date: metric.date,
                body_fat_percent: metric.body_fat_percent,
                weight,
                trend_is_materialized: trend !== null,
                ...(trend ? { trend_segment_start: segmentStartDates.has(metric.date.getTime()) } : {}),
                trend_weight: trend ? trendGramsToWeightUnit(trend.trend_weight_grams, weightUnit) : weight,
                trend_ci_lower: trend ? trendGramsToWeightUnit(trend.trend_ci_lower_grams, weightUnit) : weight,
                trend_ci_upper: trend ? trendGramsToWeightUnit(trend.trend_ci_upper_grams, weightUnit) : weight,
                trend_std: trend ? trendGramsToWeightUnit(trend.trend_std_grams, weightUnit) : 0
            };
        });

    const modeledScope = filteredAsc.filter(hasActiveTrend);
    const scopeFirst = filteredAsc[0] ?? null;
    const scopeLast = filteredAsc[filteredAsc.length - 1] ?? null;
    // Freshness and latest estimates belong to the requested as-of model even when a narrow
    // display range contains no readings (for example, an eight-day-old latest weigh-in).
    const latestPoint = trendResult.points[trendResult.points.length - 1] ?? null;
    const latestSegment = latestPoint
        ? trendResult.segments.find((segment) => segment.id === latestPoint.segmentId) ?? null
        : null;
    const daysSinceLatest = latestPoint
        ? Math.max(0, Math.round((asOfDate.getTime() - latestPoint.date.getTime()) / MS_PER_DAY))
        : null;
    const baseStatus = mapEvidenceStatus(trendResult.evidence.status);
    const freshness: TrendSummaryFreshness =
        daysSinceLatest === null
            ? 'outdated'
            : daysSinceLatest <= TREND_CURRENT_MAX_AGE_DAYS
            ? 'current'
            : daysSinceLatest <= TREND_STALE_MAX_AGE_DAYS
              ? 'stale'
              : 'outdated';
    const summaryStatus: TrendSummaryStatus =
        latestPoint === null
            ? 'insufficient'
            : freshness !== 'current'
              ? 'stale'
              : baseStatus;
    const rateEvidence = mapEvidenceStatus(trendResult.currentRate.status);
    const hasRate =
        latestPoint !== null &&
        freshness !== 'outdated' &&
        trendResult.currentRate.status !== 'insufficient' &&
        Number.isFinite(trendResult.currentRate.estimateKgPerWeek) &&
        Number.isFinite(trendResult.currentRate.stdKgPerWeek) &&
        Number.isFinite(trendResult.currentRate.lower95KgPerWeek) &&
        Number.isFinite(trendResult.currentRate.upper95KgPerWeek);
    const hasVariation = latestPoint !== null && Number.isFinite(trendResult.measurementVariabilityKg);
    const trendSummary: TrendSummary = {
        status: summaryStatus,
        evidence: baseStatus,
        freshness,
        model_version: WEIGHT_TREND_MODEL_VERSION,
        as_of_date: formatDateOnly(asOfDate),
        scope_start_date: scopeFirst ? formatDateOnly(scopeFirst.date) : null,
        scope_end_date: scopeLast ? formatDateOnly(scopeLast.date) : null,
        latest_observation_date: latestPoint ? formatDateOnly(latestPoint.date) : null,
        days_since_latest: daysSinceLatest,
        modeled_start_date: activeTrendStartDate ? formatDateOnly(activeTrendStartDate) : null,
        returned_points: metrics.length,
        modeled_points: modeledScope.length,
        observation_span_days: latestPoint ? trendResult.evidence.latestSegmentSpanDays : 0,
        segment_start_date: latestSegment ? formatDateOnly(latestSegment.startDate) : null,
        interval_kind: 'latent_weight_model_uncertainty',
        confidence_level: 0.95,
        latest_trend: latestPoint
            ? {
                  weight: kilogramsToWeightUnit(latestPoint.trendWeight, weightUnit),
                  lower: kilogramsToWeightUnit(latestPoint.lower95, weightUnit),
                  upper: kilogramsToWeightUnit(latestPoint.upper95, weightUnit)
              }
            : null,
        weekly_rate: hasRate
            ? {
                  estimate: kilogramsToWeightUnit(trendResult.currentRate.estimateKgPerWeek, weightUnit),
                  std: kilogramsToWeightUnit(trendResult.currentRate.stdKgPerWeek, weightUnit),
                  lower: kilogramsToWeightUnit(trendResult.currentRate.lower95KgPerWeek, weightUnit),
                  upper: kilogramsToWeightUnit(trendResult.currentRate.upper95KgPerWeek, weightUnit),
                  point_count: trendResult.currentRate.pointCount,
                  span_days: trendResult.currentRate.spanDays,
                  evidence: rateEvidence,
                  interval_kind: 'local_velocity_state_model_uncertainty'
              }
            : null,
        short_term_variation: hasVariation
            ? {
                  standard_deviation: kilogramsToWeightUnit(trendResult.measurementVariabilityKg, weightUnit),
                  central_80_half_width: kilogramsToWeightUnit(
                      trendResult.measurementVariabilityKg * CENTRAL_80_Z_SCORE,
                      weightUnit
                  )
              }
            : null
    };

    return {
        metrics,
        meta: {
            weekly_rate: kilogramsToWeightUnit(legacyTrendSummary.weeklyRate, weightUnit),
            volatility: legacyTrendSummary.volatility,
            total_points: metricsAsc.length,
            total_span_days: getMetricsSpanDays(metricsAsc),
            trend_summary: trendSummary
        }
    };
}

router.use(requireAuthenticatedUser);

router.get('/', async (req, res) => {
    const user = getAuthenticatedUser(req);
    const weightUnit: WeightUnit = isWeightUnit(user.weight_unit) ? user.weight_unit : 'KG';
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;
    const includeTrend = parseBooleanFlag(req.query.include_trend, false);
    const smoothingDays = parseSmoothingDays(req.query.smoothing);
    const rangeOption = parseRangeOption(req.query.range);
    if (includeTrend === undefined) {
        return res.status(400).json({ message: 'Invalid include_trend option' });
    }
    if (smoothingDays === undefined) {
        return res.status(400).json({ message: 'Invalid smoothing option' });
    }
    if (rangeOption === undefined) {
        return res.status(400).json({ message: 'Invalid range option' });
    }
    try {
        let requestedStart: Date | undefined;
        let requestedEnd: Date | undefined;

        if (start || end) {
            try {
                if (start) requestedStart = parseLocalDateOnly(start);
                if (end) requestedEnd = parseLocalDateOnly(end);
            } catch {
                return res.status(400).json({ message: 'Invalid date range' });
            }
        }
        const currentLocalDate = getSafeUtcTodayDateOnlyInTimeZone(user.timezone);
        // Future dates are never evidence. Historical end dates become reproducible as-of boundaries.
        const effectiveEndDate = requestedEnd && requestedEnd < currentLocalDate ? requestedEnd : currentLocalDate;
        const relativeRangeEndDate = effectiveEndDate;

        if (includeTrend) {
            const isHistoricalAsOf = requestedEnd !== undefined && requestedEnd < currentLocalDate;
            if (!isHistoricalAsOf) {
                await ensureMaterializedWeightTrends(user.id, effectiveEndDate);
            }
            const queriedMetricsAsc = await prisma.bodyMetric.findMany({
                where: { user_id: user.id, date: { lte: effectiveEndDate } },
                orderBy: { date: 'asc' },
                include: {
                    trend: {
                        select: {
                            trend_weight_grams: true,
                            trend_ci_lower_grams: true,
                            trend_ci_upper_grams: true,
                            trend_std_grams: true,
                            trend_rate_grams_per_day: true,
                            trend_rate_std_grams_per_day: true,
                            model_version: true
                        }
                    }
                }
            });
            // Keep the application boundary defensive for test doubles and legacy rows as well as the DB predicate.
            const storedMetricsAsc = queriedMetricsAsc.filter((metric) => metric.date <= effectiveEndDate);

            const boundedTrend = computeBoundedWeightTrend(storedMetricsAsc, effectiveEndDate);
            const metricsAsc = isHistoricalAsOf
                ? applyComputedTrend(
                      storedMetricsAsc,
                      boundedTrend.result,
                      boundedTrend.activeTrendStartDate
                  )
                : storedMetricsAsc;

            const absoluteFiltered = applyAbsoluteDateFilter(metricsAsc, requestedStart, requestedEnd);
            const relativeFiltered = applyRelativeRangeFilter(
                absoluteFiltered,
                rangeOption ?? null,
                relativeRangeEndDate,
                (row) => row.date
            );
            return res.json(
                buildTrendMetricsResponse(
                    metricsAsc,
                    relativeFiltered,
                    weightUnit,
                    boundedTrend.activeTrendStartDate,
                    boundedTrend.result,
                    effectiveEndDate
                )
            );
        }

        const smoothingWindowDays = typeof smoothingDays === 'number' ? smoothingDays : null;
        const queryStart =
            smoothingWindowDays && requestedStart ? addUtcDays(requestedStart, -(smoothingWindowDays - 1)) : requestedStart;

        const whereClause: Prisma.BodyMetricWhereInput = { user_id: user.id };
        if (queryStart || effectiveEndDate) {
            whereClause.date = {};
            if (queryStart) whereClause.date.gte = queryStart;
            whereClause.date.lte = effectiveEndDate;
        }

        const metrics = await prisma.bodyMetric.findMany({
            where: whereClause,
            orderBy: { date: 'asc' }
        });

        const metricsWithWeight = smoothingWindowDays
            ? computeRollingAverageWeights(metrics, smoothingWindowDays)
            : metrics.map((metric) => ({ metric, averageWeightGrams: metric.weight_grams }));

        const absoluteFiltered = metricsWithWeight.filter(({ metric }) => {
            if (requestedStart && metric.date < requestedStart) return false;
            if (requestedEnd && metric.date > requestedEnd) return false;
            return true;
        });
        const relativeFiltered = applyRelativeRangeFilter(
            absoluteFiltered,
            rangeOption ?? null,
            relativeRangeEndDate,
            (row) => row.metric.date
        );

        res.json(serializeMetrics(relativeFiltered, weightUnit));
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = getAuthenticatedUser(req);
    const { weight, body_fat_percent, date } = req.body;
    const weightUnit: WeightUnit = isWeightUnit(user.weight_unit) ? user.weight_unit : 'KG';
    try {
        const operationId = parseClientOperationId(
            req.get?.('x-client-operation-id') ?? req.headers?.['x-client-operation-id']
        );
        if (operationId === null) {
            return res.status(400).json({ message: 'Invalid x-client-operation-id' });
        }

        const timeZone = typeof user.timezone === 'string' ? user.timezone : 'UTC';
        let metricDate: Date;
        try {
            // Store date-only values in UTC, derived from the user's local day.
            metricDate = date
                ? parseLocalDateOnly(date)
                : (() => {
                      try {
                          return getUtcTodayDateOnlyInTimeZone(timeZone);
                      } catch {
                          return getUtcTodayDateOnlyInTimeZone('UTC');
                      }
                  })();
        } catch {
            return res.status(400).json({ message: 'Invalid date' });
        }
        const currentLocalDateValue = getSafeUtcTodayDateOnlyInTimeZone(timeZone);
        if (metricDate > currentLocalDateValue) {
            return res.status(400).json({ message: 'Weight date cannot be in the future' });
        }

        const updateData: { weight_grams?: number; body_fat_percent?: number | null } = {};

        if (weight !== undefined && weight !== '') {
            try {
                updateData.weight_grams = parseWeightToGrams(weight, weightUnit);
            } catch {
                return res.status(400).json({ message: 'Invalid weight' });
            }
        }

        if (body_fat_percent !== undefined) {
            if (body_fat_percent === '' || body_fat_percent === null) {
                updateData.body_fat_percent = null;
            } else {
                const parsedBodyFat = parseNonNegativeNumber(body_fat_percent);
                if (parsedBodyFat === null || parsedBodyFat > 100) {
                    return res.status(400).json({ message: 'Invalid body_fat_percent' });
                }
                updateData.body_fat_percent = parsedBodyFat;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        const whereUnique = { user_id_date: { user_id: user.id, date: metricDate } } as const;
        const currentLocalDate = currentLocalDateValue.toISOString().slice(0, 10);
        const savedLocalDate = metricDate.toISOString().slice(0, 10);

        const result = await executeIdempotentMutation<unknown>({
            userId: user.id,
            operationId,
            operationKind: 'body_metric.upsert',
            requestPayload: req.body,
            mutate: async (tx, claimedOperationId) => {
                const existing = await tx.bodyMetric.findUnique({ where: whereUnique });
                let progressGoal: MetricProgressGoal | null = null;
                let previousMetrics: MetricProgressHistoryEntry[] = [];
                let hadAnyMetricBeforeSave = false;
                let saveKind: MetricSaveKind | null = null;

                if (updateData.weight_grams !== undefined) {
                    saveKind =
                        existing === null
                            ? 'created'
                            : existing.weight_grams === updateData.weight_grams
                              ? 'unchanged'
                              : 'updated';
                    hadAnyMetricBeforeSave = (await tx.bodyMetric.findFirst({
                        where: { user_id: user.id },
                        select: { id: true }
                    })) !== null;

                    const activeGoal = await tx.goal.findFirst({
                        where: { user_id: user.id },
                        orderBy: [{ created_at: 'desc' }, { id: 'desc' }]
                    });
                    if (activeGoal) {
                        const createdLocalDate = formatLocalDateForTimeZone(activeGoal.created_at, timeZone);
                        progressGoal = {
                            id: activeGoal.id,
                            startWeightGrams: activeGoal.start_weight_grams,
                            targetWeightGrams: activeGoal.target_weight_grams,
                            dailyDeficit: activeGoal.daily_deficit,
                            createdLocalDate
                        };
                        const history = await tx.bodyMetric.findMany({
                            where: {
                                user_id: user.id,
                                date: {
                                    gte: parseLocalDateOnly(createdLocalDate),
                                    lte: currentLocalDateValue
                                }
                            },
                            orderBy: [{ date: 'asc' }, { id: 'asc' }],
                            select: { date: true, weight_grams: true }
                        });
                        previousMetrics = history.map((metric) => ({
                            localDate: metric.date.toISOString().slice(0, 10),
                            weightGrams: metric.weight_grams
                        }));
                    }
                }

                let metric;
                if (updateData.weight_grams === undefined) {
                    if (!existing) {
                        return { status: 400, body: { message: 'Weight is required for a new day' } };
                    }
                    metric = await tx.bodyMetric.update({
                        where: { id: existing.id },
                        data: updateData
                    });
                } else {
                    metric = await tx.bodyMetric.upsert({
                        where: whereUnique,
                        update: updateData,
                        create: {
                            user_id: user.id,
                            date: metricDate,
                            weight_grams: updateData.weight_grams,
                            body_fat_percent: updateData.body_fat_percent ?? null
                        }
                    });
                }

                await recordSyncChange({
                    tx,
                    userId: user.id,
                    entityType: 'body_metric',
                    entityId: metric.id,
                    action: 'upsert',
                    operationId: claimedOperationId,
                    payload: metric
                });

                const { weight_grams: savedWeightGrams, ...savedMetric } = metric;
                const progressUpdate =
                    saveKind === null
                        ? null
                        : evaluateMetricProgressUpdate({
                              saveKind,
                              savedLocalDate,
                              currentLocalDate,
                              currentWeightGrams: savedWeightGrams,
                              weightUnit,
                              goal: progressGoal,
                              previousMetrics,
                              hadAnyMetricBeforeSave
                          });
                return {
                    status: 200,
                    body: {
                        ...savedMetric,
                        weight: gramsToWeight(savedWeightGrams, weightUnit),
                        ...(progressUpdate === null ? {} : { progress_update: progressUpdate })
                    }
                };
            }
        });

        if (result.status === 200 && updateData.weight_grams !== undefined) {
            await refreshMaterializedWeightTrendsBestEffort(user.id, currentLocalDateValue);
        }

        return res.status(result.status).json(result.body);
    } catch (err) {
        if (err instanceof ClientOperationConflictError) {
            return res.status(409).json({
                message: err.message,
                code: err.code,
                retryable: err.code === 'OPERATION_IN_PROGRESS'
            });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const user = getAuthenticatedUser(req);
    const id = parsePositiveInteger(req.params.id);
    if (id === null) {
        return res.status(400).json({ message: 'Invalid metric id' });
    }

    try {
        const operationId = parseClientOperationId(
            req.get?.('x-client-operation-id') ?? req.headers?.['x-client-operation-id']
        );
        if (operationId === null) {
            return res.status(400).json({ message: 'Invalid x-client-operation-id' });
        }

        const result = await executeIdempotentMutation<unknown>({
            userId: user.id,
            operationId,
            operationKind: 'body_metric.delete',
            requestPayload: { id },
            mutate: async (tx, claimedOperationId) => {
                const deleteResult = await tx.bodyMetric.deleteMany({ where: { id, user_id: user.id } });
                if (deleteResult.count === 0) {
                    return { status: 404, body: { message: 'Metric not found' } };
                }
                await recordSyncChange({
                    tx,
                    userId: user.id,
                    entityType: 'body_metric',
                    entityId: id,
                    action: 'delete',
                    operationId: claimedOperationId
                });
                return { status: 204, body: null };
            }
        });

        if (result.status === 204) {
            await refreshMaterializedWeightTrendsBestEffort(user.id);
            return res.status(204).send();
        }
        return res.status(result.status).json(result.body);
    } catch (err) {
        if (err instanceof ClientOperationConflictError) {
            return res.status(409).json({
                message: err.message,
                code: err.code,
                retryable: err.code === 'OPERATION_IN_PROGRESS'
            });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
