import express from 'express';
import { InAppNotificationType } from '@prisma/client';
import {
    getFoodDataProviderByName,
    listFoodDataProviders,
    type FoodDataProviderInfo,
    type FoodDataSource,
    type FoodSearchRequest
} from '../services/foodData';
import { buildReminderPayload, type PushNotificationPayload } from '../services/pushNotificationPayloads';
import {
    DEFAULT_NOTIFICATION_DELIVERY_CHANNELS,
    NOTIFICATION_DELIVERY_CHANNELS,
    parseNotificationDeliveryChannels,
    type NotificationDeliveryChannel
} from '../../../shared/notificationDelivery';
import { getSafeUtcTodayDateOnlyInTimeZone } from '../utils/date';
import { deliverUserNotification, type DeliverUserNotificationResult } from '../services/notificationDelivery';

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

type AuthenticatedDevUser = {
    id: number;
    timezone?: string;
};

/**
 * Read an endpoint from the request body so dev sends can target the current browser only.
 */
const resolvePushEndpoint = (body: unknown): string => {
    if (!body || typeof body !== 'object') {
        return '';
    }
    const endpoint = (body as { endpoint?: unknown }).endpoint;
    return typeof endpoint === 'string' ? endpoint.trim() : '';
};

/**
 * Parse requested delivery channels, defaulting to both when the body omits channel selection.
 */
const resolveRequestedChannels = (body: unknown): NotificationDeliveryChannel[] => {
    if (!body || typeof body !== 'object') {
        return [...DEFAULT_NOTIFICATION_DELIVERY_CHANNELS];
    }

    const rawChannels = (body as { channels?: unknown }).channels;
    if (rawChannels === undefined) {
        return [...DEFAULT_NOTIFICATION_DELIVERY_CHANNELS];
    }

    return parseNotificationDeliveryChannels(rawChannels);
};

const shouldRequirePushEndpoint = (channels: NotificationDeliveryChannel[]): boolean => {
    return channels.includes(NOTIFICATION_DELIVERY_CHANNELS.PUSH);
};

const buildDeliveryResponse = (
    channels: NotificationDeliveryChannel[],
    result: DeliverUserNotificationResult
) => {
    const pushSelected = channels.includes(NOTIFICATION_DELIVERY_CHANNELS.PUSH);
    const inAppSelected = channels.includes(NOTIFICATION_DELIVERY_CHANNELS.IN_APP);

    const pushSucceeded = !pushSelected || result.push.sent > 0;
    const inAppSucceeded = !inAppSelected || result.inApp.created > 0;

    const ok = pushSucceeded && inAppSucceeded;
    const partial = !ok && ((pushSelected && result.push.sent > 0) || (inAppSelected && result.inApp.created > 0));

    return {
        ok,
        partial,
        channels,
        push: result.push,
        in_app: result.inApp
    };
};

const getUserLocalDate = (user: AuthenticatedDevUser, now = new Date()): Date => {
    return getSafeUtcTodayDateOnlyInTimeZone(user.timezone || 'UTC', now);
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
    const user = req.user as AuthenticatedDevUser;
    const channels = resolveRequestedChannels(req.body);
    if (channels.length === 0) {
        return res.status(400).json({ message: 'Select at least one notification channel.' });
    }

    const endpoint = resolvePushEndpoint(req.body);
    if (shouldRequirePushEndpoint(channels) && !endpoint) {
        return res.status(400).json({ message: 'Endpoint is required when push delivery is selected.' });
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const localDate = getUserLocalDate(user);

    const payload: PushNotificationPayload = {
        title: title || 'calibrate',
        body: body || 'This is a test notification.',
        url: url || '/'
    };

    const result = await deliverUserNotification({
        userId: user.id,
        channels,
        push: {
            payload,
            endpoint
        },
        inApp: {
            type: InAppNotificationType.GENERIC,
            localDate,
            title: payload.title,
            body: payload.body,
            actionUrl: payload.url
        }
    });

    res.json(buildDeliveryResponse(channels, result));
});

router.post('/notifications/log-weight', requireAuthenticatedUser, async (req, res) => {
    const user = req.user as AuthenticatedDevUser;
    const channels = resolveRequestedChannels(req.body);
    if (channels.length === 0) {
        return res.status(400).json({ message: 'Select at least one notification channel.' });
    }

    const endpoint = resolvePushEndpoint(req.body);
    if (shouldRequirePushEndpoint(channels) && !endpoint) {
        return res.status(400).json({ message: 'Endpoint is required when push delivery is selected.' });
    }

    const localDate = getUserLocalDate(user);
    const payload = buildReminderPayload({ missingWeight: true, missingFood: false });
    const result = await deliverUserNotification({
        userId: user.id,
        channels,
        push: {
            payload,
            endpoint
        },
        inApp: {
            type: InAppNotificationType.LOG_WEIGHT_REMINDER,
            localDate
        }
    });

    res.json(buildDeliveryResponse(channels, result));
});

router.post('/notifications/log-food', requireAuthenticatedUser, async (req, res) => {
    const user = req.user as AuthenticatedDevUser;
    const channels = resolveRequestedChannels(req.body);
    if (channels.length === 0) {
        return res.status(400).json({ message: 'Select at least one notification channel.' });
    }

    const endpoint = resolvePushEndpoint(req.body);
    if (shouldRequirePushEndpoint(channels) && !endpoint) {
        return res.status(400).json({ message: 'Endpoint is required when push delivery is selected.' });
    }

    const localDate = getUserLocalDate(user);
    const payload = buildReminderPayload({ missingWeight: false, missingFood: true });
    const result = await deliverUserNotification({
        userId: user.id,
        channels,
        push: {
            payload,
            endpoint
        },
        inApp: {
            type: InAppNotificationType.LOG_FOOD_REMINDER,
            localDate
        }
    });

    res.json(buildDeliveryResponse(channels, result));
});

export default router;
