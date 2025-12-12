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
        const goal = await prisma.goal.findFirst({
            where: { user_id: user.id },
            orderBy: { created_at: 'desc' }
        });
        if (!goal) {
            return res.json(null);
        }

        const { start_weight_grams, target_weight_grams, ...rest } = goal;
        res.json({
            ...rest,
            start_weight: gramsToWeight(start_weight_grams, weightUnit),
            target_weight: gramsToWeight(target_weight_grams, weightUnit)
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = req.user as any;
    const { start_weight, target_weight, target_date, daily_deficit } = req.body;
    const weightUnit = (user.weight_unit ?? 'KG') as WeightUnit;
    try {
        const start_weight_grams = parseWeightToGrams(start_weight, weightUnit);
        const target_weight_grams = parseWeightToGrams(target_weight, weightUnit);
        const goal = await prisma.goal.create({
            data: {
                user_id: user.id,
                start_weight_grams,
                target_weight_grams,
                target_date: target_date ? new Date(target_date) : null,
                daily_deficit: parseInt(daily_deficit)
            }
        });
        const { start_weight_grams: createdStartWeightGrams, target_weight_grams: createdTargetWeightGrams, ...createdGoal } = goal;
        res.json({
            ...createdGoal,
            start_weight: gramsToWeight(createdStartWeightGrams, weightUnit),
            target_weight: gramsToWeight(createdTargetWeightGrams, weightUnit)
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
