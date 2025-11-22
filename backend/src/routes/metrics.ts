import express from 'express';
import prisma from '../config/database';
import { convertToGrams, convertFromGrams } from '../utils/units';

const router = express.Router();

router.get('/', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    const user = req.user as any;

    try {
        const metrics = await prisma.bodyMetric.findMany({
            where: { user_id: user.id },
            orderBy: { date: 'desc' }
        });

        const convertedMetrics = metrics.map(m => ({
            ...m,
            weight: {
                value: convertFromGrams(m.weight, user.weight_unit),
                unit: user.weight_unit
            }
        }));

        res.json(convertedMetrics);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    const user = req.user as any;
    const { weight, body_fat_percent, date } = req.body;

    try {
        const weightInGrams = convertToGrams(parseFloat(weight), user.weight_unit);

        const metric = await prisma.bodyMetric.upsert({
            where: {
                user_id_date: {
                    user_id: user.id,
                    date: date ? new Date(date) : new Date()
                }
            },
            update: {
                weight: weightInGrams,
                body_fat_percent: body_fat_percent ? parseFloat(body_fat_percent) : undefined
            },
            create: {
                user_id: user.id,
                date: date ? new Date(date) : new Date(),
                weight: weightInGrams,
                body_fat_percent: body_fat_percent ? parseFloat(body_fat_percent) : undefined
            }
        });

        res.json({
            ...metric,
            weight: {
                value: convertFromGrams(metric.weight, user.weight_unit),
                unit: user.weight_unit
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
