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
    const { date } = req.query;

    let whereClause: any = { user_id: user.id };
    if (date) {
        const startOfDay = new Date(date as string);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date as string);
        endOfDay.setHours(23, 59, 59, 999);

        whereClause.date = {
            gte: startOfDay,
            lte: endOfDay
        };
    }

    try {
        const logs = await prisma.foodLog.findMany({
            where: whereClause,
            orderBy: { created_at: 'asc' }
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = req.user as any;
    const { name, calories, meal_period, date } = req.body;
    try {
        const log = await prisma.foodLog.create({
            data: {
                user_id: user.id,
                name,
                calories: parseInt(calories),
                meal_period,
                date: date ? new Date(date) : new Date()
            }
        });
        res.json(log);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
