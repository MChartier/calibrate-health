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

type DevNotificationAction = {
    action: string;
    title: string;
};

type DevPushPayload = {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    actions?: DevNotificationAction[];
    actionUrls?: Record<string, string>;
};

const QUICK_ADD_BASE_PATH = '/log'; // Route used for quick-add notification deep links.
const QUICK_ADD_QUERY_PARAM = 'quickAdd'; // Matches frontend quick-add query param name.
const QUICK_ADD_ACTIONS = {
    weight: 'weight',
    food: 'food'
} as const;

const REMINDER_ACTION_IDS = {
    logWeight: 'log_weight',
    logFood: 'log_food'
} as const;

const REMINDER_ACTIONS: DevNotificationAction[] = [
    { action: REMINDER_ACTION_IDS.logWeight, title: 'Log weight' },
    { action: REMINDER_ACTION_IDS.logFood, title: 'Log food' }
];

const buildQuickAddUrl = (action: typeof QUICK_ADD_ACTIONS[keyof typeof QUICK_ADD_ACTIONS]): string => {
    return `${QUICK_ADD_BASE_PATH}?${QUICK_ADD_QUERY_PARAM}=${action}`;
};

const REMINDER_ACTION_URLS: Record<string, string> = {
    [REMINDER_ACTION_IDS.logWeight]: buildQuickAddUrl(QUICK_ADD_ACTIONS.weight),
    [REMINDER_ACTION_IDS.logFood]: buildQuickAddUrl(QUICK_ADD_ACTIONS.food)
};

const buildReminderPayload = (variant: 'log_weight' | 'log_food'): DevPushPayload => {
    const isWeight = variant === REMINDER_ACTION_IDS.logWeight;
    const targetUrl = isWeight
        ? REMINDER_ACTION_URLS[REMINDER_ACTION_IDS.logWeight]
        : REMINDER_ACTION_URLS[REMINDER_ACTION_IDS.logFood];
    return {
        title: 'calibrate',
        body: isWeight ? 'Time to log your weight.' : 'Time to log your food.',
        url: targetUrl,
        tag: `reminder-${variant}`,
        actions: REMINDER_ACTIONS,
        actionUrls: REMINDER_ACTION_URLS
    };
};

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

const sendDevPushToUser = async (userId: number, payload: DevPushPayload) => {
    const subscriptions = await prisma.pushSubscription.findMany({
        where: { user_id: userId }
    });

    if (subscriptions.length === 0) {
        return { sent: 0, failed: 0, message: 'No push subscriptions found for this user.' };
    }

    const payloadString = JSON.stringify(payload);
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
                payloadString
            )
        )
    );

    const failures = results.filter((result) => result.status === 'rejected');
    return {
        sent: results.length,
        failed: failures.length,
        message:
            failures.length > 0
                ? 'Some subscriptions failed. Clear them and re-subscribe to refresh.'
                : undefined
    };
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

    const payload: DevPushPayload = {
        title: title || 'calibrate',
        body: body || 'This is a test notification.',
        url: url || '/'
    };

    const subscription = await prisma.pushSubscription.findFirst({
        where: { user_id: user.id },
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }]
    });

    if (!subscription) {
        return res.status(400).json({ message: 'No push subscriptions found for this user.' });
    }

    // Send only one deterministic test notification to avoid duplicate toasts when users have multiple devices.
    const result = await Promise.allSettled([
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
    ]);

    const failures = result.filter((entry) => entry.status === 'rejected');

    if (failures.length > 0) {
        console.warn(
            `Dev push test failed for user ${user.id}. The selected subscription may be expired; clear it and re-subscribe to refresh.`
        );
    }

    res.json({
        ok: failures.length === 0,
        sent: result.length,
        failed: failures.length
    });
});

router.post('/notifications/log-weight', requireAuthenticatedUser, async (req, res) => {
    const configured = ensureWebPushConfigured();
    if (!configured.ok) {
        return res.status(500).json({ message: configured.error ?? 'Web push is not configured.' });
    }

    const user = req.user as { id: number };
    const payload = buildReminderPayload(REMINDER_ACTION_IDS.logWeight);
    const result = await sendDevPushToUser(user.id, payload);

    if (result.sent === 0) {
        return res.status(400).json({ message: result.message ?? 'No push subscriptions found for this user.' });
    }

    if (result.message) {
        console.warn(`Dev push log weight sent with ${result.failed} failures. ${result.message}`);
    }

    res.json({
        ok: result.failed === 0,
        sent: result.sent,
        failed: result.failed
    });
});

router.post('/notifications/log-food', requireAuthenticatedUser, async (req, res) => {
    const configured = ensureWebPushConfigured();
    if (!configured.ok) {
        return res.status(500).json({ message: configured.error ?? 'Web push is not configured.' });
    }

    const user = req.user as { id: number };
    const payload = buildReminderPayload(REMINDER_ACTION_IDS.logFood);
    const result = await sendDevPushToUser(user.id, payload);

    if (result.sent === 0) {
        return res.status(400).json({ message: result.message ?? 'No push subscriptions found for this user.' });
    }

    if (result.message) {
        console.warn(`Dev push log food sent with ${result.failed} failures. ${result.message}`);
    }

    res.json({
        ok: result.failed === 0,
        sent: result.sent,
        failed: result.failed
    });
});

export default router;
