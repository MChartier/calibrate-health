import express from 'express';
import prisma from '../config/database';
import { getFoodDataProvider } from '../services/foodData';
import { MealPeriod } from '@prisma/client';

const router = express.Router();

const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

const MEAL_PERIOD_ALIASES: Record<string, MealPeriod> = {
    breakfast: MealPeriod.BREAKFAST,
    'morning snack': MealPeriod.MORNING_SNACK,
    morning: MealPeriod.MORNING_SNACK,
    morning_snack: MealPeriod.MORNING_SNACK,
    lunch: MealPeriod.LUNCH,
    'afternoon snack': MealPeriod.AFTERNOON_SNACK,
    afternoon: MealPeriod.AFTERNOON_SNACK,
    afternoon_snack: MealPeriod.AFTERNOON_SNACK,
    dinner: MealPeriod.DINNER,
    'evening snack': MealPeriod.EVENING_SNACK,
    evening: MealPeriod.EVENING_SNACK,
    evening_snack: MealPeriod.EVENING_SNACK
};

/**
 * Parse and validate a meal period identifier coming from API requests.
 *
 * `FoodLog.meal_period` is stored as a Prisma/Postgres enum so we validate input
 * early and return a 400 instead of letting Prisma throw a 500.
 */
const parseMealPeriod = (value: unknown): MealPeriod | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    return MEAL_PERIOD_ALIASES[normalized] ?? null;
};

/**
 * Prefer an explicit language code, otherwise fall back to the request locale hint.
 */
const getLanguageCode = (req: express.Request): string | undefined => {
    const raw = typeof req.query.lc === 'string' ? req.query.lc.trim().toLowerCase() : undefined;
    if (raw) {
        return raw;
    }
    const header = req.headers['accept-language'];
    if (!header || typeof header !== 'string') {
        return undefined;
    }
    const primary = header.split(',')[0]?.trim();
    if (!primary) {
        return undefined;
    }
    return primary.split('-')[0]?.toLowerCase();
};

router.get('/search', async (req, res) => {
    const provider = getFoodDataProvider();
    const query = (req.query.q as string) || (req.query.query as string);
    const barcode = req.query.barcode as string | undefined;

    if (!query && !barcode) {
        return res.status(400).json({ message: 'Provide a search query or barcode.' });
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;
    const quantityInGrams = req.query.grams ? parseFloat(req.query.grams as string) : undefined;
    const languageCode = getLanguageCode(req);

    try {
        const result = await provider.searchFoods({
            query: query || undefined,
            barcode,
            page,
            pageSize,
            quantityInGrams,
            languageCode
        });

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
        const parsedMealPeriod = parseMealPeriod(meal_period);
        if (!parsedMealPeriod) {
            return res.status(400).json({ message: 'Invalid meal period' });
        }

        const log = await prisma.foodLog.create({
            data: {
                user_id: user.id,
                name,
                calories: parseInt(String(calories), 10),
                meal_period: parsedMealPeriod,
                date: date ? new Date(date) : new Date()
            }
        });
        res.json(log);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
