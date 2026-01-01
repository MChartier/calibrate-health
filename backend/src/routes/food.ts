import express from 'express';
import prisma from '../config/database';
import { getFoodDataProvider } from '../services/foodData';
import { parseLocalDateOnly } from '../utils/date';
import { parsePositiveInteger } from '../utils/requestParsing';
import { parseFoodLogCreateBody, parseFoodLogUpdateBody, parseFoodSearchParams } from './foodUtils';

const router = express.Router();

const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

router.get('/search', async (req, res) => {
    const parsed = parseFoodSearchParams({
        query: req.query as Record<string, unknown>,
        acceptLanguageHeader: req.headers['accept-language']
    });

    if (!parsed.ok) {
        return res.status(parsed.statusCode).json({ message: parsed.message });
    }

    const provider = getFoodDataProvider();

    try {
        const result = await provider.searchFoods(parsed.params);

        res.json({
            provider: provider.name,
            supportsBarcodeLookup: provider.supportsBarcodeLookup,
            ...result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Unable to search foods right now.' });
    }
});

router.get('/', async (req, res) => {
    const user = req.user as any;
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const localDateParam = typeof req.query.local_date === 'string' ? req.query.local_date : undefined;
    const requestedDate = localDateParam ?? dateParam;

    let whereClause: any = { user_id: user.id };
    if (requestedDate !== undefined) {
        try {
            whereClause.local_date = parseLocalDateOnly(requestedDate);
        } catch {
            return res.status(400).json({ message: 'Invalid date' });
        }
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
    try {
        const parsedBody = parseFoodLogCreateBody({
            body: req.body,
            userTimeZone: user.timezone
        });

        if (!parsedBody.ok) {
            return res.status(parsedBody.statusCode).json({ message: parsedBody.message });
        }

        if (parsedBody.kind === 'MY_FOOD') {
            const myFood = await prisma.myFood.findFirst({
                where: { id: parsedBody.myFoodId, user_id: user.id }
            });
            if (!myFood) {
                return res.status(404).json({ message: 'My food not found' });
            }

            const caloriesTotal = Math.round(parsedBody.servingsConsumed * myFood.calories_per_serving);

            const log = await prisma.foodLog.create({
                data: {
                    user_id: user.id,
                    my_food_id: myFood.id,
                    name: myFood.name,
                    calories: caloriesTotal,
                    meal_period: parsedBody.mealPeriod,
                    date: parsedBody.entryTimestamp,
                    local_date: parsedBody.localDate,
                    servings_consumed: parsedBody.servingsConsumed,
                    serving_size_quantity_snapshot: myFood.serving_size_quantity,
                    serving_unit_label_snapshot: myFood.serving_unit_label,
                    calories_per_serving_snapshot: myFood.calories_per_serving
                }
            });
            return res.json(log);
        }

        const log = await prisma.foodLog.create({
            data: {
                user_id: user.id,
                name: parsedBody.name,
                calories: parsedBody.calories,
                meal_period: parsedBody.mealPeriod,
                date: parsedBody.entryTimestamp,
                local_date: parsedBody.localDate
            }
        });
        return res.json(log);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.patch('/:id', async (req, res) => {
    const user = req.user as any;
    const id = parsePositiveInteger(req.params.id);
    if (id === null) {
        return res.status(400).json({ message: 'Invalid food log id' });
    }

    const existing = await prisma.foodLog.findFirst({ where: { id, user_id: user.id } });
    if (!existing) {
        return res.status(404).json({ message: 'Food log not found' });
    }

    const parsedUpdate = parseFoodLogUpdateBody({ body: req.body, existing });
    if (!parsedUpdate.ok) {
        return res.status(parsedUpdate.statusCode).json({ message: parsedUpdate.message });
    }

    try {
        const updated = await prisma.foodLog.update({
            where: { id },
            data: parsedUpdate.updateData
        });

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const user = req.user as any;
    const id = parsePositiveInteger(req.params.id);
    if (id === null) {
        return res.status(400).json({ message: 'Invalid food log id' });
    }

    try {
        const deleteResult = await prisma.foodLog.deleteMany({ where: { id, user_id: user.id } });
        if (deleteResult.count === 0) {
            return res.status(404).json({ message: 'Food log not found' });
        }

        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
