import express from 'express';
import prisma from '../config/database';
import {
    getEnabledFoodDataProviders,
    getFoodDataProvider,
    getFoodDataProviderByName,
    type FoodDataSource
} from '../services/foodData';
import { parseLocalDateOnly } from '../utils/date';
import { parsePositiveInteger } from '../utils/requestParsing';
import { parseFoodLogCreateBody, parseFoodLogUpdateBody, parseFoodSearchParams } from './foodUtils';

/**
 * Food log and food search endpoints.
 *
 * Logs are stored with a local-date column so day grouping respects the user's timezone.
 */
const router = express.Router();

type BarcodeProviderAttempt = {
    name: FoodDataSource;
    status: 'skipped' | 'error' | 'empty';
    detail?: string;
};

/**
 * Summarize barcode lookup attempts for logs without leaking request details.
 */
const formatBarcodeAttemptSummary = (attempts: BarcodeProviderAttempt[]): string => {
    return attempts
        .map((attempt) => {
            const detail = attempt.detail ? ` - ${attempt.detail}` : '';
            return `${attempt.name} (${attempt.status}${detail})`;
        })
        .join(', ');
};

/**
 * Ensure the session is authenticated before accessing food data.
 */
const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

router.get('/search', async (req, res) => {
    // Parse query params once so providers can remain agnostic to Express and raw query types.
    const parsed = parseFoodSearchParams({
        query: req.query as Record<string, unknown>,
        acceptLanguageHeader: req.headers['accept-language']
    });

    if (!parsed.ok) {
        return res.status(parsed.statusCode).json({ message: parsed.message });
    }

    if (!parsed.params.barcode) {
        const provider = getFoodDataProvider();

        try {
            // Providers return normalized items so the frontend can show a consistent search UI.
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
        return;
    }

    const { primary, providers } = getEnabledFoodDataProviders();
    const barcodeProviders = providers.filter((provider) => provider.supportsBarcodeLookup);
    const attempts: BarcodeProviderAttempt[] = [];

    if (!primary.ready) {
        attempts.push({
            name: primary.name,
            status: 'skipped',
            detail: primary.detail || 'Provider is not ready.'
        });
    }

    let sawSuccessfulResponse = false;
    let lastError: Error | null = null;

    for (const providerInfo of barcodeProviders) {
        const resolution = getFoodDataProviderByName(providerInfo.name);
        if (!resolution.provider) {
            attempts.push({
                name: providerInfo.name,
                status: 'skipped',
                detail: resolution.error || providerInfo.detail || 'Provider is not available.'
            });
            continue;
        }

        try {
            const result = await resolution.provider.searchFoods(parsed.params);
            sawSuccessfulResponse = true;
            if (result.items.length > 0) {
                return res.json({
                    provider: resolution.provider.name,
                    supportsBarcodeLookup: resolution.provider.supportsBarcodeLookup,
                    ...result
                });
            }

            attempts.push({ name: providerInfo.name, status: 'empty' });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Search failed.';
            attempts.push({ name: providerInfo.name, status: 'error', detail: message });
            lastError = err instanceof Error ? err : new Error(message);
        }
    }

    if (!sawSuccessfulResponse && lastError) {
        console.error(lastError);
        if (attempts.length > 0) {
            console.info(`Barcode lookup failed for all providers. Attempts: ${formatBarcodeAttemptSummary(attempts)}`);
        }
        return res.status(500).json({ message: 'Unable to search foods right now.' });
    }

    if (attempts.length > 0) {
        console.info(`Barcode lookup returned no results. Attempts: ${formatBarcodeAttemptSummary(attempts)}`);
    }

    return res.json({ items: [] });
});

router.get('/', async (req, res) => {
    const user = req.user as any;
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const localDateParam = typeof req.query.local_date === 'string' ? req.query.local_date : undefined;
    const requestedDate = localDateParam ?? dateParam;

    let whereClause: any = { user_id: user.id };
    if (requestedDate !== undefined) {
        try {
            // Treat date strings as local-date values (no timezone math).
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
        // Supports either manual entries or a "my food" reference with servings.
        const parsedBody = parseFoodLogCreateBody({
            body: req.body,
            userTimeZone: user.timezone
        });

        if (!parsedBody.ok) {
            return res.status(parsedBody.statusCode).json({ message: parsedBody.message });
        }

        if (parsedBody.kind === 'MY_FOOD') {
            // Snapshot serving details so later edits to "my foods" do not mutate historical logs.
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
