import express from 'express';
import { type BodyMetric } from '@prisma/client';
import prisma from '../config/database';
import {
    gramsToWeight,
    isWeightUnit,
    parseWeightToGrams,
    type WeightUnit
} from '../utils/units';
import { addUtcDays, getUtcTodayDateOnlyInTimeZone, normalizeToUtcDateOnly } from '../utils/date';
import { parsePositiveInteger } from '../utils/requestParsing';

/**
 * Weight and body metric log endpoints.
 *
 * We store metrics as date-only values and convert weights using the user's unit preference.
 */
const router = express.Router();

const ROLLING_WEIGHT_AVERAGE_DAYS = 7; // Rolling window length for weight smoothing requests.

type MetricRecord = Pick<BodyMetric, 'id' | 'user_id' | 'date' | 'weight_grams' | 'body_fat_percent'>;
type MetricAverage = { metric: MetricRecord; averageWeightGrams: number };

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
    const smoothingDays = parseSmoothingDays(req.query.smoothing);
    if (smoothingDays === undefined) {
        return res.status(400).json({ message: 'Invalid smoothing option' });
    }
    try {
        let rangeStart: Date | undefined;
        let rangeEnd: Date | undefined;

        if (start || end) {
            try {
                if (start) rangeStart = normalizeToUtcDateOnly(start);
                if (end) rangeEnd = normalizeToUtcDateOnly(end);
            } catch {
                return res.status(400).json({ message: 'Invalid date range' });
            }
        }

        const smoothingWindowDays = typeof smoothingDays === 'number' ? smoothingDays : null;
        const queryStart =
            smoothingWindowDays && rangeStart ? addUtcDays(rangeStart, -(smoothingWindowDays - 1)) : rangeStart;

        const whereClause: any = { user_id: user.id };
        if (queryStart || rangeEnd) {
            whereClause.date = {};
            if (queryStart) whereClause.date.gte = queryStart;
            if (rangeEnd) whereClause.date.lte = rangeEnd;
        }

        const metrics = await prisma.bodyMetric.findMany({
            where: whereClause,
            orderBy: { date: 'asc' }
        });

        const metricsWithWeight = smoothingWindowDays
            ? computeRollingAverageWeights(metrics, smoothingWindowDays)
            : metrics.map((metric) => ({ metric, averageWeightGrams: metric.weight_grams }));

        const filtered = metricsWithWeight.filter(({ metric }) => {
            if (rangeStart && metric.date < rangeStart) return false;
            if (rangeEnd && metric.date > rangeEnd) return false;
            return true;
        });

        res.json(
            filtered
                .slice()
                .reverse()
                .map(({ metric, averageWeightGrams }) => {
                    const { weight_grams, ...rest } = metric;
                    return {
                        ...rest,
                        weight: gramsToWeight(averageWeightGrams, weightUnit)
                    };
                })
        );
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
