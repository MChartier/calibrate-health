import express from 'express';
import prisma from '../config/database';
import { gramsToWeight, parseWeightToGrams, type WeightUnit } from '../utils/weight';

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
    const weightUnit = (user.weight_unit ?? 'KG') as WeightUnit;
    try {
        const metrics = await prisma.bodyMetric.findMany({
            where: { user_id: user.id },
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
    const weightUnit = (user.weight_unit ?? 'KG') as WeightUnit;
    try {
        const weight_grams = parseWeightToGrams(weight, weightUnit);
        const metric = await prisma.bodyMetric.create({
            data: {
                user_id: user.id,
                weight_grams,
                body_fat_percent: body_fat_percent ? parseFloat(body_fat_percent) : null,
                date: date ? new Date(date) : new Date()
            }
        });
        const { weight_grams: createdWeightGrams, ...createdMetric } = metric;
        res.json({
            ...createdMetric,
            weight: gramsToWeight(createdWeightGrams, weightUnit)
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
