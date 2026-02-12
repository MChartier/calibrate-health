import express from 'express';
import { type BodyMetric } from '@prisma/client';
import prisma from '../config/database';
import {
    gramsToWeight,
    isWeightUnit,
    parseWeightToGrams,
    type WeightUnit
} from '../utils/units';
import { MS_PER_DAY, addUtcDays, getUtcTodayDateOnlyInTimeZone, normalizeToUtcDateOnly } from '../utils/date';
import { parsePositiveInteger } from '../utils/requestParsing';
import { computeWeightTrend, type VolatilityLevel } from '../services/weightTrend';

/**
 * Weight and body metric log endpoints.
 *
 * We store metrics as date-only values and convert weights using the user's unit preference.
 */
const router = express.Router();

const ROLLING_WEIGHT_AVERAGE_DAYS = 7; // Rolling window length for weight smoothing requests.
const METRICS_RANGE_OPTIONS = {
    WEEK: 'week',
    MONTH: 'month',
    YEAR: 'year',
    ALL: 'all'
} as const;

type MetricsRange = (typeof METRICS_RANGE_OPTIONS)[keyof typeof METRICS_RANGE_OPTIONS];

type MetricRecord = Pick<BodyMetric, 'id' | 'user_id' | 'date' | 'weight_grams' | 'body_fat_percent'>;
type MetricAverage = { metric: MetricRecord; averageWeightGrams: number };
type SerializedMetric = {
    id: number;
    user_id: number;
    date: Date;
    body_fat_percent: number | null;
    weight: number;
};
type SerializedTrendMetric = SerializedMetric & {
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
    };
};

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
 * Apply a relative date window anchored to the latest metric date in the current set.
 */
function applyRelativeRangeFilter<T>(rows: T[], range: MetricsRange | null, getDate: (row: T) => Date): T[] {
    if (range === null || range === METRICS_RANGE_OPTIONS.ALL || rows.length === 0) {
        return rows;
    }

    const latestDate = getDate(rows[rows.length - 1]);
    const daysToInclude =
        range === METRICS_RANGE_OPTIONS.WEEK ? 7 : range === METRICS_RANGE_OPTIONS.MONTH ? 30 : 365;
    const startDate = addUtcDays(latestDate, -(daysToInclude - 1));
    return rows.filter((row) => getDate(row) >= startDate);
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
    metricsAsc: MetricRecord[],
    filteredAsc: MetricRecord[],
    weightUnit: WeightUnit
): TrendMetricsResponse {
    const observations = metricsAsc.map((metric) => ({
        date: metric.date,
        weight: gramsToWeight(metric.weight_grams, weightUnit)
    }));
    const trendResult = computeWeightTrend(observations, weightUnit);

    const trendByDateMs = new Map<number, (typeof trendResult.points)[number]>();
    for (const point of trendResult.points) {
        trendByDateMs.set(point.date.getTime(), point);
    }

    const metrics: SerializedTrendMetric[] = filteredAsc
        .slice()
        .reverse()
        .map((metric) => {
            const trendPoint = trendByDateMs.get(metric.date.getTime());
            const weight = gramsToWeight(metric.weight_grams, weightUnit);
            return {
                id: metric.id,
                user_id: metric.user_id,
                date: metric.date,
                body_fat_percent: metric.body_fat_percent,
                weight,
                trend_weight: trendPoint?.trendWeight ?? weight,
                trend_ci_lower: trendPoint?.lower95 ?? weight,
                trend_ci_upper: trendPoint?.upper95 ?? weight,
                trend_std: trendPoint?.trendStd ?? 0
            };
        });

    return {
        metrics,
        meta: {
            weekly_rate: trendResult.weeklyRate,
            volatility: trendResult.volatility,
            total_points: metricsAsc.length,
            total_span_days: getMetricsSpanDays(metricsAsc)
        }
    };
}

/**
 * Ensure the session is authenticated before accessing metrics.
 */
const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

router.get('/', async (req, res) => {
    const user = req.user as any;
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
                if (start) requestedStart = normalizeToUtcDateOnly(start);
                if (end) requestedEnd = normalizeToUtcDateOnly(end);
            } catch {
                return res.status(400).json({ message: 'Invalid date range' });
            }
        }

        if (includeTrend) {
            const metricsAsc = await prisma.bodyMetric.findMany({
                where: { user_id: user.id },
                orderBy: { date: 'asc' }
            });

            const absoluteFiltered = applyAbsoluteDateFilter(metricsAsc, requestedStart, requestedEnd);
            const relativeFiltered = applyRelativeRangeFilter(absoluteFiltered, rangeOption ?? null, (row) => row.date);
            return res.json(buildTrendMetricsResponse(metricsAsc, relativeFiltered, weightUnit));
        }

        const smoothingWindowDays = typeof smoothingDays === 'number' ? smoothingDays : null;
        const queryStart =
            smoothingWindowDays && requestedStart ? addUtcDays(requestedStart, -(smoothingWindowDays - 1)) : requestedStart;

        const whereClause: any = { user_id: user.id };
        if (queryStart || requestedEnd) {
            whereClause.date = {};
            if (queryStart) whereClause.date.gte = queryStart;
            if (requestedEnd) whereClause.date.lte = requestedEnd;
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
        const relativeFiltered = applyRelativeRangeFilter(absoluteFiltered, rangeOption ?? null, (row) => row.metric.date);

        res.json(serializeMetrics(relativeFiltered, weightUnit));
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = req.user as any;
    const { weight, body_fat_percent, date } = req.body;
    const weightUnit: WeightUnit = isWeightUnit(user.weight_unit) ? user.weight_unit : 'KG';
    try {
        let metricDate: Date;
        try {
            const timeZone = typeof user.timezone === 'string' ? user.timezone : 'UTC';
            // Store date-only values in UTC, derived from the user's local day.
            metricDate = date
                ? normalizeToUtcDateOnly(date)
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
                const parsedBodyFat = parseFloat(body_fat_percent);
                if (!Number.isFinite(parsedBodyFat)) {
                    return res.status(400).json({ message: 'Invalid body_fat_percent' });
                }
                updateData.body_fat_percent = parsedBodyFat;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        const whereUnique = { user_id_date: { user_id: user.id, date: metricDate } } as const;

        let metric;
        if (updateData.weight_grams === undefined) {
            const existing = await prisma.bodyMetric.findUnique({ where: whereUnique });
            if (!existing) {
                return res.status(400).json({ message: 'Weight is required for a new day' });
            }
            metric = await prisma.bodyMetric.update({
                where: { id: existing.id },
                data: updateData
            });
        } else {
            metric = await prisma.bodyMetric.upsert({
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

        const { weight_grams: savedWeightGrams, ...savedMetric } = metric;
        res.json({ ...savedMetric, weight: gramsToWeight(savedWeightGrams, weightUnit) });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const user = req.user as any;
    const id = parsePositiveInteger(req.params.id);
    if (id === null) {
        return res.status(400).json({ message: 'Invalid metric id' });
    }

    try {
        const deleteResult = await prisma.bodyMetric.deleteMany({ where: { id, user_id: user.id } });
        if (deleteResult.count === 0) {
            return res.status(404).json({ message: 'Metric not found' });
        }

        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
