import express from 'express';
import prisma from '../config/database';
import {
    getEnabledFoodDataProviders,
    getFoodDataProviderByName,
    type FoodDataSource
} from '../services/foodData';
import type { FoodDataProvider, FoodSearchRequest, FoodSearchResult } from '../services/foodData';
import { parseLocalDateOnly } from '../utils/date';
import { parsePositiveInteger } from '../utils/requestParsing';
import { parseFoodLogCreateBody, parseFoodLogUpdateBody, parseFoodSearchParams } from './foodUtils';

/**
 * Food log and food search endpoints.
 *
 * Logs are stored with a local-date column so day grouping respects the user's timezone.
 */
const router = express.Router();

type ProviderSearchAttempt = {
    name: FoodDataSource;
    status: 'skipped' | 'error' | 'empty';
    detail?: string;
};

type ProviderSearchOutcome =
    | {
          found: true;
          provider: FoodDataProvider;
          result: FoodSearchResult;
          attempts: ProviderSearchAttempt[];
      }
    | {
          found: false;
          attempts: ProviderSearchAttempt[];
          sawSuccessfulResponse: boolean;
          lastError: Error | null;
      };

/**
 * Summarize provider search attempts for logs without leaking request details.
 */
const formatProviderAttemptSummary = (attempts: ProviderSearchAttempt[]): string => {
    return attempts
        .map((attempt) => {
            const detail = attempt.detail ? ` - ${attempt.detail}` : '';
            return `${attempt.name} (${attempt.status}${detail})`;
        })
        .join(', ');
};

const RECENT_FOOD_LOOKBACK_LIMIT = 200;
const RECENT_FOOD_DEFAULT_LIMIT = 12;
const RECENT_FOOD_MAX_LIMIT = 40;

type RecentFoodAccumulator = {
    id: string;
    name: string;
    meal_period: string;
    calories: number;
    my_food_id: number | null;
    servings_consumed: number | null;
    serving_size_quantity_snapshot: number | null;
    serving_unit_label_snapshot: string | null;
    calories_per_serving_snapshot: number | null;
    external_source: string | null;
    external_id: string | null;
    brand_snapshot: string | null;
    locale_snapshot: string | null;
    barcode_snapshot: string | null;
    measure_label_snapshot: string | null;
    grams_per_measure_snapshot: number | null;
    measure_quantity_snapshot: number | null;
    grams_total_snapshot: number | null;
    last_logged_at: Date;
    times_logged: number;
};

/**
 * Build a stable key for "recent foods" so repeated logs collapse into one reusable suggestion.
 */
const getRecentFoodKey = (log: any): string => {
    if (typeof log.my_food_id === 'number') {
        return `my-food:${log.my_food_id}`;
    }

    if (log.external_source && log.external_id) {
        return [
            'external',
            log.external_source,
            log.external_id,
            log.measure_label_snapshot ?? '',
            log.grams_per_measure_snapshot ?? ''
        ].join(':');
    }

    return [
        'manual',
        String(log.name ?? '').trim().toLowerCase(),
        log.serving_size_quantity_snapshot ?? '',
        String(log.serving_unit_label_snapshot ?? '').trim().toLowerCase(),
        log.calories_per_serving_snapshot ?? log.calories ?? ''
    ].join(':');
};

/**
 * Convert a food log row into the compact shape consumed by the quick-add UI.
 */
const buildRecentFoodAccumulator = (log: any, key: string): RecentFoodAccumulator => ({
    id: key,
    name: log.name,
    meal_period: log.meal_period,
    calories: log.calories,
    my_food_id: log.my_food_id ?? null,
    servings_consumed: log.servings_consumed ?? null,
    serving_size_quantity_snapshot: log.serving_size_quantity_snapshot ?? null,
    serving_unit_label_snapshot: log.serving_unit_label_snapshot ?? null,
    calories_per_serving_snapshot: log.calories_per_serving_snapshot ?? null,
    external_source: log.external_source ?? null,
    external_id: log.external_id ?? null,
    brand_snapshot: log.brand_snapshot ?? null,
    locale_snapshot: log.locale_snapshot ?? null,
    barcode_snapshot: log.barcode_snapshot ?? null,
    measure_label_snapshot: log.measure_label_snapshot ?? null,
    grams_per_measure_snapshot: log.grams_per_measure_snapshot ?? null,
    measure_quantity_snapshot: log.measure_quantity_snapshot ?? null,
    grams_total_snapshot: log.grams_total_snapshot ?? null,
    last_logged_at: log.created_at,
    times_logged: 1
});

/**
 * Search ready providers in configured order, stopping at the first provider with results.
 */
const searchEnabledProviders = async (
    params: FoodSearchRequest,
    opts: { requireBarcodeLookup: boolean }
): Promise<ProviderSearchOutcome> => {
    const { primary, providers } = getEnabledFoodDataProviders();
    const attempts: ProviderSearchAttempt[] = [];

    if (!primary.ready) {
        attempts.push({
            name: primary.name,
            status: 'skipped',
            detail: primary.detail || 'Provider is not ready.'
        });
    }

    let sawSuccessfulResponse = false;
    let lastError: Error | null = null;

    for (const providerInfo of providers) {
        if (opts.requireBarcodeLookup && !providerInfo.supportsBarcodeLookup) {
            attempts.push({
                name: providerInfo.name,
                status: 'skipped',
                detail: 'Barcode lookup is disabled for this provider.'
            });
            continue;
        }

        const resolution = getFoodDataProviderByName(providerInfo.name);
        if (!resolution.provider) {
            attempts.push({
                name: providerInfo.name,
                status: 'skipped',
                detail: resolution.error || providerInfo.detail || 'Provider is not available.'
            });
            continue;
        }

        if (opts.requireBarcodeLookup && !resolution.provider.supportsBarcodeLookup) {
            attempts.push({
                name: providerInfo.name,
                status: 'skipped',
                detail: 'Barcode lookup is disabled for this provider.'
            });
            continue;
        }

        try {
            const result = await resolution.provider.searchFoods(params);
            if (opts.requireBarcodeLookup && !resolution.provider.supportsBarcodeLookup) {
                attempts.push({
                    name: providerInfo.name,
                    status: 'skipped',
                    detail: 'Barcode lookup is disabled for this provider.'
                });
                continue;
            }

            sawSuccessfulResponse = true;
            if (result.items.length > 0) {
                return {
                    found: true,
                    provider: resolution.provider,
                    result,
                    attempts
                };
            }

            attempts.push({ name: providerInfo.name, status: 'empty' });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Search failed.';
            attempts.push({ name: providerInfo.name, status: 'error', detail: message });
            lastError = err instanceof Error ? err : new Error(message);
        }
    }

    return { found: false, attempts, sawSuccessfulResponse, lastError };
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

router.get('/recent', async (req, res) => {
    const user = req.user as any;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const limit =
        typeof limitRaw === 'number' && Number.isFinite(limitRaw)
            ? Math.min(Math.max(limitRaw, 1), RECENT_FOOD_MAX_LIMIT)
            : RECENT_FOOD_DEFAULT_LIMIT;

    try {
        const logs = await prisma.foodLog.findMany({
            where: { user_id: user.id },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: RECENT_FOOD_LOOKBACK_LIMIT
        });

        const byKey = new Map<string, RecentFoodAccumulator>();
        for (const log of logs) {
            if (q && !String(log.name ?? '').toLowerCase().includes(q)) {
                continue;
            }

            const key = getRecentFoodKey(log);
            const existing = byKey.get(key);
            if (existing) {
                existing.times_logged += 1;
                continue;
            }

            byKey.set(key, buildRecentFoodAccumulator(log, key));
            if (byKey.size >= limit) {
                break;
            }
        }

        return res.json({ items: Array.from(byKey.values()) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.get('/search', async (req, res) => {
    // Parse query params once so providers can remain agnostic to Express and raw query types.
    const parsed = parseFoodSearchParams({
        query: req.query as Record<string, unknown>,
        acceptLanguageHeader: req.headers['accept-language']
    });

    if (!parsed.ok) {
        return res.status(parsed.statusCode).json({ message: parsed.message });
    }

    const searchOutcome = await searchEnabledProviders(parsed.params, {
        requireBarcodeLookup: Boolean(parsed.params.barcode)
    });

    if (searchOutcome.found) {
        return res.json({
            provider: searchOutcome.provider.name,
            supportsBarcodeLookup: searchOutcome.provider.supportsBarcodeLookup,
            ...searchOutcome.result
        });
    }

    if (!searchOutcome.sawSuccessfulResponse && searchOutcome.lastError) {
        console.error(searchOutcome.lastError);
        if (searchOutcome.attempts.length > 0) {
            console.info(
                `Food search failed for all providers. Attempts: ${formatProviderAttemptSummary(searchOutcome.attempts)}`
            );
        }
        return res.status(500).json({ message: 'Unable to search foods right now.' });
    }

    if (searchOutcome.attempts.length > 0) {
        console.info(
            `Food search returned no results. Attempts: ${formatProviderAttemptSummary(searchOutcome.attempts)}`
        );
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
                local_date: parsedBody.localDate,
                servings_consumed: parsedBody.servingsConsumed,
                serving_size_quantity_snapshot: parsedBody.servingSizeQuantitySnapshot,
                serving_unit_label_snapshot: parsedBody.servingUnitLabelSnapshot,
                calories_per_serving_snapshot: parsedBody.caloriesPerServingSnapshot,
                external_source: parsedBody.externalSource,
                external_id: parsedBody.externalId,
                brand_snapshot: parsedBody.brandSnapshot,
                locale_snapshot: parsedBody.localeSnapshot,
                barcode_snapshot: parsedBody.barcodeSnapshot,
                measure_label_snapshot: parsedBody.measureLabelSnapshot,
                grams_per_measure_snapshot: parsedBody.gramsPerMeasureSnapshot,
                measure_quantity_snapshot: parsedBody.measureQuantitySnapshot,
                grams_total_snapshot: parsedBody.gramsTotalSnapshot
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
