import express from 'express';
import prisma from '../config/database';
import { getFoodDataProvider } from '../services/foodData';
import type { MealPeriod } from '@prisma/client';
import { getSafeUtcTodayDateOnlyInTimeZone, parseLocalDateOnly } from '../utils/date';
import { parseMealPeriod } from '../utils/mealPeriod';
import {
    parseNonNegativeInteger,
    parseNonNegativeNumber,
    parsePositiveInteger,
    parsePositiveNumber,
    resolveLanguageCode
} from '../utils/requestParsing';

const router = express.Router();

const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

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
    const languageCode = resolveLanguageCode({
        queryLanguageCode: req.query.lc,
        acceptLanguageHeader: req.headers['accept-language']
    });

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
    const { name, calories, meal_period, date, my_food_id, servings_consumed } = req.body;
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

        const wantsMyFood = my_food_id !== undefined && my_food_id !== null && String(my_food_id).trim().length > 0;
        const wantsManual = name !== undefined || calories !== undefined;
        if (wantsMyFood && wantsManual) {
            return res.status(400).json({ message: 'Provide either my_food_id+servings_consumed or name+calories, not both.' });
        }

        if (wantsMyFood) {
            const myFoodId = parsePositiveInteger(my_food_id);
            if (myFoodId === null) {
                return res.status(400).json({ message: 'Invalid my food id' });
            }

            const servings = parsePositiveNumber(servings_consumed);
            if (servings === null) {
                return res.status(400).json({ message: 'Invalid servings consumed' });
            }

            const myFood = await prisma.myFood.findFirst({
                where: { id: myFoodId, user_id: user.id }
            });
            if (!myFood) {
                return res.status(404).json({ message: 'My food not found' });
            }

            const caloriesTotal = Math.round(servings * myFood.calories_per_serving);

            const log = await prisma.foodLog.create({
                data: {
                    user_id: user.id,
                    my_food_id: myFood.id,
                    name: myFood.name,
                    calories: caloriesTotal,
                    meal_period: parsedMealPeriod,
                    date: entryTimestamp,
                    local_date,
                    servings_consumed: servings,
                    serving_size_quantity_snapshot: myFood.serving_size_quantity,
                    serving_unit_label_snapshot: myFood.serving_unit_label,
                    calories_per_serving_snapshot: myFood.calories_per_serving
                }
            });
            return res.json(log);
        }

        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!trimmedName) {
            return res.status(400).json({ message: 'Invalid name' });
        }

        const caloriesNumber = parseNonNegativeNumber(calories);
        if (caloriesNumber === null) {
            return res.status(400).json({ message: 'Invalid calories' });
        }
        const caloriesValue = Math.round(caloriesNumber);

        const log = await prisma.foodLog.create({
            data: {
                user_id: user.id,
                name: trimmedName,
                calories: caloriesValue,
                meal_period: parsedMealPeriod,
                date: entryTimestamp,
                local_date
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

    const { name, calories, meal_period, servings_consumed } = req.body;

    const existing = await prisma.foodLog.findFirst({ where: { id, user_id: user.id } });
    if (!existing) {
        return res.status(404).json({ message: 'Food log not found' });
    }

    const updateData: Partial<{
        name: string;
        calories: number;
        meal_period: MealPeriod;
        servings_consumed: number | null;
        calories_per_serving_snapshot: number | null;
    }> = {};

    if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ message: 'Invalid name' });
        }
        updateData.name = name.trim();
    }

    if (calories !== undefined) {
        const parsedCalories = parseNonNegativeNumber(calories);
        if (parsedCalories === null) {
            return res.status(400).json({ message: 'Invalid calories' });
        }
        updateData.calories = Math.round(parsedCalories);
    }

    if (meal_period !== undefined) {
        const parsedMealPeriod = parseMealPeriod(meal_period);
        if (!parsedMealPeriod) {
            return res.status(400).json({ message: 'Invalid meal period' });
        }
        updateData.meal_period = parsedMealPeriod;
    }

    if (servings_consumed !== undefined) {
        const parsedServings = parsePositiveNumber(servings_consumed);
        if (parsedServings === null) {
            return res.status(400).json({ message: 'Invalid servings consumed' });
        }

        if (existing.calories_per_serving_snapshot === null || existing.calories_per_serving_snapshot === undefined) {
            return res.status(400).json({ message: 'This entry does not include serving info.' });
        }

        updateData.servings_consumed = parsedServings;

        if (updateData.calories === undefined) {
            updateData.calories = Math.round(parsedServings * existing.calories_per_serving_snapshot);
        }
    }

    // If the caller supplied calories for an entry that has serving data, keep the snapshot consistent by
    // deriving calories-per-serving from the (possibly updated) servings count.
    if (updateData.calories !== undefined) {
        const servings =
            updateData.servings_consumed ??
            (existing.servings_consumed !== null && existing.servings_consumed !== undefined ? existing.servings_consumed : null);

        if (servings && servings > 0) {
            updateData.calories_per_serving_snapshot = updateData.calories / servings;
        }
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
    }

    try {
        const updated = await prisma.foodLog.update({
            where: { id },
            data: updateData
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
