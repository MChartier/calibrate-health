import express from 'express';
import prisma from '../config/database';
import { convertToGrams, convertFromGrams } from '../utils/units';

const router = express.Router();

router.get('/', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    const user = req.user as any;

    try {
        const goal = await prisma.goal.findFirst({
            where: { user_id: user.id },
            orderBy: { created_at: 'desc' }
        });

        if (goal) {
            res.json({
                ...goal,
                start_weight: {
                    value: convertFromGrams(goal.start_weight, user.weight_unit),
                    unit: user.weight_unit
                },
                target_weight: {
                    value: convertFromGrams(goal.target_weight, user.weight_unit),
                    unit: user.weight_unit
                }
            });
        } else {
            res.json(null);
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    const user = req.user as any;
    const { start_weight, target_weight, daily_deficit } = req.body;

    try {
        const startWeightGrams = convertToGrams(parseFloat(start_weight), user.weight_unit);
        const targetWeightGrams = convertToGrams(parseFloat(target_weight), user.weight_unit);

        const goal = await prisma.goal.create({
            data: {
                user_id: user.id,
                start_weight: startWeightGrams,
                target_weight: targetWeightGrams,
                daily_deficit: parseInt(daily_deficit)
            }
        });

        res.json({
            ...goal,
            start_weight: {
                value: convertFromGrams(goal.start_weight, user.weight_unit),
                unit: user.weight_unit
            },
            target_weight: {
                value: convertFromGrams(goal.target_weight, user.weight_unit),
                unit: user.weight_unit
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
