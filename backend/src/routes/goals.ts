import express from 'express';
import prisma from '../config/database';
import { parseDailyDeficit } from '../utils/goalDeficit';
import { gramsToWeight, parseWeightToGrams, type WeightUnit } from '../utils/units';
import { validateGoalWeightsForDailyDeficit } from '../utils/goalValidation';

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
        const parsedDailyDeficit = parseDailyDeficit(daily_deficit);
        if (parsedDailyDeficit === null) {
            return res.status(400).json({ message: 'daily_deficit must be one of 0, ±250, ±500, ±750, or ±1000' });
        }

        let start_weight_grams: number;
        let target_weight_grams: number;
        try {
            start_weight_grams = parseWeightToGrams(start_weight, weightUnit);
            target_weight_grams = parseWeightToGrams(target_weight, weightUnit);
        } catch {
            return res.status(400).json({ message: 'Invalid start weight or target weight' });
        }

        const coherenceError = validateGoalWeightsForDailyDeficit({
            dailyDeficit: parsedDailyDeficit,
            startWeightGrams: start_weight_grams,
            targetWeightGrams: target_weight_grams
        });
        if (coherenceError) {
            return res.status(400).json({ message: coherenceError });
        }

        let parsedTargetDate: Date | null = null;
        if (target_date) {
            const candidate = new Date(target_date);
            if (Number.isNaN(candidate.getTime())) {
                return res.status(400).json({ message: 'Invalid target_date' });
            }
            parsedTargetDate = candidate;
        }

        const goal = await prisma.goal.create({
            data: {
                user_id: user.id,
                start_weight_grams,
                target_weight_grams,
                target_date: parsedTargetDate,
                daily_deficit: parsedDailyDeficit
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
