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
        const goal = await prisma.goal.findFirst({
            where: { user_id: user.id },
            orderBy: { created_at: 'desc' }
        });
        res.json(goal);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = req.user as any;
    const { start_weight, target_weight, target_date, daily_deficit } = req.body;
    try {
        const goal = await prisma.goal.create({
            data: {
                user_id: user.id,
                start_weight: parseFloat(start_weight),
                target_weight: parseFloat(target_weight),
                target_date: target_date ? new Date(target_date) : null,
                daily_deficit: parseInt(daily_deficit)
            }
        });
        res.json(goal);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
