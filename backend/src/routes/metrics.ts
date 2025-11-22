import express from 'express';
import prisma from '../config/database';

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
    try {
        const metrics = await prisma.bodyMetric.findMany({
            where: { user_id: user.id },
            orderBy: { date: 'desc' }
        });
        res.json(metrics);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = req.user as any;
    const { weight, body_fat_percent, date } = req.body;
    try {
        const metric = await prisma.bodyMetric.create({
            data: {
                user_id: user.id,
                weight: parseFloat(weight),
                body_fat_percent: body_fat_percent ? parseFloat(body_fat_percent) : null,
                date: date ? new Date(date) : new Date()
            }
        });
        res.json(metric);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
