import express from 'express';
import prisma from '../config/database';
import { getFoodDataProvider } from '../services/foodData';
import { MealPeriod } from '@prisma/client';
import { getSafeUtcTodayDateOnlyInTimeZone, parseLocalDateOnly } from '../utils/date';

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
 * Parse an integer ID from a route param.
 */
function parseIdParam(value: unknown): number | null {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
        return null;
    }
    return numeric;
}

/**
 * Parse a calories field into a non-negative integer.
 */
function parseCalories(value: unknown): number | null {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : Number.NaN;
    if (!Number.isFinite(numeric)) {
        return null;
    }
    const parsed = Math.trunc(numeric);
    if (parsed < 0) {
        return null;
    }
    return parsed;
}

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
    const { name, calories, meal_period, date } = req.body;
    try {
        const parsedMealPeriod = parseMealPeriod(meal_period);
        if (!parsedMealPeriod) {
            return res.status(400).json({ message: 'Invalid meal period' });
        }

        let local_date: Date;
        if (date === undefined || date === null || (typeof date === 'string' && date.trim().length === 0)) {
            local_date = getSafeUtcTodayDateOnlyInTimeZone(user.timezone);
        } else {
            try {
                local_date = parseLocalDateOnly(date);
            } catch {
                return res.status(400).json({ message: 'Invalid date' });
            }
        }

        const entryTimestamp = date ? new Date(date) : new Date();
        if (Number.isNaN(entryTimestamp.getTime())) {
            return res.status(400).json({ message: 'Invalid date' });
        }

        const caloriesValue = Number.parseInt(String(calories), 10);
        if (!Number.isFinite(caloriesValue)) {
            return res.status(400).json({ message: 'Invalid calories' });
        }

        const log = await prisma.foodLog.create({
            data: {
                user_id: user.id,
                name,
                calories: caloriesValue,
                meal_period: parsedMealPeriod,
                date: entryTimestamp,
                local_date
            }
        });
        res.json(log);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.patch('/:id', async (req, res) => {
    const user = req.user as any;
    const id = parseIdParam(req.params.id);
    if (id === null) {
        return res.status(400).json({ message: 'Invalid food log id' });
    }

    const { name, calories, meal_period } = req.body;

    const updateData: Partial<{ name: string; calories: number; meal_period: MealPeriod }> = {};

    if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ message: 'Invalid name' });
        }
        updateData.name = name.trim();
    }

    if (calories !== undefined) {
        const parsedCalories = parseCalories(calories);
        if (parsedCalories === null) {
            return res.status(400).json({ message: 'Invalid calories' });
        }
        updateData.calories = parsedCalories;
    }

    if (meal_period !== undefined) {
        const parsedMealPeriod = parseMealPeriod(meal_period);
        if (!parsedMealPeriod) {
            return res.status(400).json({ message: 'Invalid meal period' });
        }
        updateData.meal_period = parsedMealPeriod;
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
    }

    try {
        const updateResult = await prisma.foodLog.updateMany({
            where: { id, user_id: user.id },
            data: updateData
        });

        if (updateResult.count === 0) {
            return res.status(404).json({ message: 'Food log not found' });
        }

        const updated = await prisma.foodLog.findFirst({ where: { id, user_id: user.id } });
        if (!updated) {
            return res.status(404).json({ message: 'Food log not found' });
        }

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const user = req.user as any;
    const id = parseIdParam(req.params.id);
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
