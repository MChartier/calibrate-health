import express from 'express';
import prisma from '../config/database';
import {
    gramsToWeight,
    parseWeightToGrams,
    resolveWeightUnit,
    type WeightUnit
} from '../utils/weight';
import { getUtcTodayDateOnlyInTimeZone, normalizeToUtcDateOnly } from '../utils/date';

const router = express.Router();

const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

router.get('/', async (req, res) => {
    const user = req.user as any;
    const weightUnit = resolveWeightUnit({ weight_unit: user.weight_unit, unit_system: user.unit_system });
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;
    try {
        const whereClause: any = { user_id: user.id };
        if (start || end) {
            whereClause.date = {};
            try {
                if (start) whereClause.date.gte = normalizeToUtcDateOnly(start);
                if (end) whereClause.date.lte = normalizeToUtcDateOnly(end);
            } catch {
                return res.status(400).json({ message: 'Invalid date range' });
            }
        }

        const metrics = await prisma.bodyMetric.findMany({
            where: whereClause,
            orderBy: { date: 'desc' }
        });
        res.json(
            metrics.map(({ weight_grams, ...metric }) => ({
                ...metric,
                weight: gramsToWeight(weight_grams, weightUnit)
            }))
        );
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = req.user as any;
    const { weight, body_fat_percent, date } = req.body;
    const weightUnit = resolveWeightUnit({ weight_unit: user.weight_unit, unit_system: user.unit_system });
    try {
        let metricDate: Date;
        try {
            const timeZone = typeof user.timezone === 'string' ? user.timezone : 'UTC';
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

export default router;
