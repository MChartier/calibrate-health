import express from 'express';
import prisma from '../config/database';
import {
    getFoodDataProviderByName,
    listFoodDataProviders,
    type FoodDataProviderInfo,
    type FoodDataSource,
    type FoodSearchRequest
} from '../services/foodData';
import { ensureWebPushConfigured, sendWebPushNotification } from '../services/webPush';

/**
 * Dev-only endpoints for food provider diagnostics and comparisons.
 */
const router = express.Router();

/**
 * Normalize query parameters into a single search request for provider comparisons.
 */
const buildSearchRequest = (req: express.Request): FoodSearchRequest => {
    const query = (req.query.q as string) || (req.query.query as string);
    const barcode = typeof req.query.barcode === 'string' ? req.query.barcode : undefined;
    const page = typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : undefined;
    const pageSize = typeof req.query.pageSize === 'string' ? parseInt(req.query.pageSize, 10) : undefined;
    const quantityInGrams = typeof req.query.grams === 'string' ? parseFloat(req.query.grams) : undefined;
    const includeIncompleteParam = typeof req.query.includeIncomplete === 'string' ? req.query.includeIncomplete : undefined;
    const includeIncomplete = includeIncompleteParam
        ? ['true', '1', 'yes'].includes(includeIncompleteParam.toLowerCase())
        : true;
    const rawLanguage = typeof req.query.lc === 'string' ? req.query.lc.trim().toLowerCase() : undefined;
    const headerLanguage =
        typeof req.headers['accept-language'] === 'string'
            ? req.headers['accept-language'].split(',')[0]?.trim().split('-')[0]?.toLowerCase()
            : undefined;
    const languageCode = rawLanguage || headerLanguage;

    return {
        query: query?.trim() ? query.trim() : undefined,
        barcode,
        page,
        pageSize,
        quantityInGrams,
        includeIncomplete,
        languageCode
    };
};

/**
 * Resolve which providers to query so the dev UI can default to ready providers.
 */
const resolveRequestedProviders = (req: express.Request, available: FoodDataProviderInfo[]): FoodDataSource[] => {
    const requestedParam = typeof req.query.providers === 'string' ? req.query.providers : undefined;
    const readyProviders = available.filter((provider) => provider.ready).map((provider) => provider.name);

    if (!requestedParam) {
        return readyProviders;
    }

    const availableNames = new Set(available.map((provider) => provider.name));
    const requested = requestedParam
        .split(',')
        .map((name) => name.trim())
        .filter((name) => Boolean(name))
        .filter((name): name is FoodDataSource => availableNames.has(name as FoodDataSource));

    return requested.length ? requested : readyProviders;
};

/**
 * Ensure the session is authenticated before executing dev-only notification actions.
 */
const requireAuthenticatedUser = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.get('/food/providers', (req, res) => {
    res.json({ providers: listFoodDataProviders() });
});

router.get('/food/search', async (req, res) => {
    const searchRequest = buildSearchRequest(req);
    if (!searchRequest.query && !searchRequest.barcode) {
        return res.status(400).json({ message: 'Provide a search query or barcode.' });
    }

    const providers = listFoodDataProviders();
    const selectedProviders = resolveRequestedProviders(req, providers);
    if (selectedProviders.length === 0) {
        return res.status(400).json({ message: 'No providers are configured for search.' });
    }

    const results = await Promise.all(
        selectedProviders.map(async (name) => {
            const providerInfo = providers.find((provider) => provider.name === name);
            if (!providerInfo) {
                return {
                    name,
                    label: name,
                    supportsBarcodeLookup: false,
                    ready: false,
                    items: [],
                    error: 'Provider metadata missing.'
                };
            }

            if (!providerInfo.ready) {
                return {
                    ...providerInfo,
                    items: [],
                    error: providerInfo.detail || 'Provider is not ready.'
                };
            }

            const resolution = getFoodDataProviderByName(name);
            if (!resolution.provider) {
                return {
                    ...providerInfo,
                    items: [],
                    error: resolution.error || 'Provider is not available.'
                };
            }

            const startedAt = Date.now();
            try {
                const searchResult = await resolution.provider.searchFoods(searchRequest);
                return {
                    ...providerInfo,
                    items: searchResult.items,
                    elapsedMs: Date.now() - startedAt
                };
            } catch (error) {
                console.error(`Dev provider search failed for ${name}:`, error);
                return {
                    ...providerInfo,
                    items: [],
                    elapsedMs: Date.now() - startedAt,
                    error: error instanceof Error ? error.message : 'Search failed.'
                };
            }
        })
    );

    res.json({
        query: searchRequest.query,
        barcode: searchRequest.barcode,
        results
    });
});

router.post('/notifications/test', requireAuthenticatedUser, async (req, res) => {
    const configured = ensureWebPushConfigured();
    if (!configured.ok) {
        return res.status(500).json({ message: configured.error ?? 'Web push is not configured.' });
    }

    const user = req.user as { id: number };
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';

    const payload = JSON.stringify({
        title: title || 'calibrate',
        body: body || 'This is a test notification.',
        url: url || '/'
    });

    const subscriptions = await prisma.pushSubscription.findMany({
        where: { user_id: user.id }
    });

    if (subscriptions.length === 0) {
        return res.status(400).json({ message: 'No push subscriptions found for this user.' });
    }

    const results = await Promise.allSettled(
        subscriptions.map((subscription) =>
            sendWebPushNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.p256dh,
                        auth: subscription.auth
                    }
                },
                payload
            )
        )
    );

    const failures = results.filter((result) => result.status === 'rejected');

    if (failures.length > 0) {
        console.warn(
            `Dev push test sent with ${failures.length} failures. Some subscriptions may be expired; clear them and re-subscribe to refresh.`
        );
    }

    res.json({
        ok: failures.length === 0,
        sent: results.length,
        failed: failures.length
    });
});

export default router;
