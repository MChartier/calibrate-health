import { InAppNotificationType } from '@prisma/client';
import type { NativePushProvider } from '@prisma/client';
import prisma from '../config/database';
import {
    DEFAULT_NOTIFICATION_DELIVERY_CHANNELS,
    NOTIFICATION_DELIVERY_CHANNELS,
    resolveNotificationDeliveryChannels,
    type NotificationDeliveryChannel
} from '../../../shared/notificationDelivery';
import { type PushNotificationPayload } from './pushNotificationPayloads';
import { sendNativePushNotification } from './nativePush';
import { ensureWebPushConfigured, sendWebPushNotification } from './webPush';
import { diagnosticsRegistry } from '../observability';

export type InAppNotificationDeliveryRequest = {
    type: InAppNotificationType;
    localDate: Date;
    title?: string;
    body?: string;
    actionUrl?: string;
    dedupeKey?: string;
};

export type PushNotificationDeliveryRequest = {
    payload: PushNotificationPayload;
    endpoint?: string;
    skipIfLastSentLocalDate?: Date;
    markSentLocalDate?: Date;
};

type DeliverUserNotificationRequest = {
    userId: number;
    channels?: NotificationDeliveryChannel[];
    inApp?: InAppNotificationDeliveryRequest | InAppNotificationDeliveryRequest[];
    push?: PushNotificationDeliveryRequest;
};

type InAppDeliveryResult = {
    attempted: boolean;
    created: number;
    skipped: boolean;
    deduped: boolean;
    message?: string;
};

type PushDeliveryResult = {
    attempted: boolean;
    sent: number;
    failed: number;
    skipped: boolean;
    deduped: boolean;
    message?: string;
};

export type DeliverUserNotificationResult = {
    channels: NotificationDeliveryChannel[];
    inApp: InAppDeliveryResult;
    push: PushDeliveryResult;
};

type NormalizedPushSubscription = {
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    last_sent_local_date: Date | null;
};

type NormalizedNativePushSubscription = {
    id: number;
    provider: NativePushProvider;
    token: string;
    last_sent_local_date: Date | null;
};

const isSameUtcDate = (left: Date | null | undefined, right: Date): boolean => {
    if (!left) return false;
    return left.getTime() === right.getTime();
};

const shouldDeleteSubscription = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const statusCode = (error as { statusCode?: number }).statusCode;
    return statusCode === 404 || statusCode === 410;
};

const normalizeOptionalText = (value: string | undefined): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const normalizeInAppRequests = (
    inApp: InAppNotificationDeliveryRequest | InAppNotificationDeliveryRequest[] | undefined
): InAppNotificationDeliveryRequest[] => {
    if (!inApp) {
        return [];
    }

    return Array.isArray(inApp) ? inApp : [inApp];
};

const createInAppNotifications = async (
    userId: number,
    inAppRequests: InAppNotificationDeliveryRequest[]
): Promise<InAppDeliveryResult> => {
    if (inAppRequests.length === 0) {
        return {
            attempted: true,
            created: 0,
            skipped: true,
            deduped: false,
            message: 'In-app payload is missing.'
        };
    }

    let created = 0;
    let dedupeSkipCount = 0;

    for (const notification of inAppRequests) {
        const dedupeKey = normalizeOptionalText(notification.dedupeKey);
        if (dedupeKey) {
            const existing = await prisma.inAppNotification.findUnique({
                where: {
                    user_id_dedupe_key: {
                        user_id: userId,
                        dedupe_key: dedupeKey
                    }
                },
                select: { id: true }
            });

            if (existing) {
                dedupeSkipCount += 1;
                continue;
            }
        }

        await prisma.inAppNotification.create({
            data: {
                user_id: userId,
                type: notification.type,
                local_date: notification.localDate,
                title: normalizeOptionalText(notification.title),
                body: normalizeOptionalText(notification.body),
                action_url: normalizeOptionalText(notification.actionUrl),
                dedupe_key: dedupeKey
            }
        });

        created += 1;
    }

    if (created === 0 && dedupeSkipCount > 0) {
        return {
            attempted: true,
            created: 0,
            skipped: true,
            deduped: true,
            message: 'In-app notifications were skipped because matching dedupe keys already exist.'
        };
    }

    return {
        attempted: true,
        created,
        skipped: created === 0,
        deduped: dedupeSkipCount > 0
    };
};

const resolvePushSubscriptions = async (
    userId: number,
    endpoint: string | undefined
): Promise<NormalizedPushSubscription[]> => {
    const normalizedEndpoint = normalizeOptionalText(endpoint);
    if (normalizedEndpoint) {
        const subscription = await prisma.pushSubscription.findUnique({
            where: {
                user_id_endpoint: {
                    user_id: userId,
                    endpoint: normalizedEndpoint
                }
            },
            select: {
                id: true,
                endpoint: true,
                p256dh: true,
                auth: true,
                last_sent_local_date: true
            }
        });

        return subscription ? [subscription] : [];
    }

    return prisma.pushSubscription.findMany({
        where: { user_id: userId },
        select: {
            id: true,
            endpoint: true,
            p256dh: true,
            auth: true,
            last_sent_local_date: true
        }
    });
};

const resolveNativePushSubscriptions = async (
    userId: number,
    endpoint: string | undefined
): Promise<NormalizedNativePushSubscription[]> => {
    // Endpoint-specific dev sends target a browser subscription only.
    if (endpoint) {
        return [];
    }

    const nativePushSubscription = (prisma as typeof prisma & {
        nativePushSubscription?: {
            findMany: (args: unknown) => Promise<NormalizedNativePushSubscription[]>;
        };
    }).nativePushSubscription;
    if (!nativePushSubscription) {
        return [];
    }

    return nativePushSubscription.findMany({
        where: {
            user_id: userId,
            revoked_at: null
        },
        select: {
            id: true,
            provider: true,
            token: true,
            last_sent_local_date: true
        }
    });
};

const sendPushNotifications = async (
    userId: number,
    pushRequest: PushNotificationDeliveryRequest | undefined
): Promise<PushDeliveryResult> => {
    if (!pushRequest) {
        return {
            attempted: true,
            sent: 0,
            failed: 0,
            skipped: true,
            deduped: false,
            message: 'Push payload is missing.'
        };
    }

    const subscriptions = await resolvePushSubscriptions(userId, pushRequest.endpoint);
    const nativeSubscriptions = await resolveNativePushSubscriptions(userId, pushRequest.endpoint);
    if (subscriptions.length === 0 && nativeSubscriptions.length === 0) {
        return {
            attempted: true,
            sent: 0,
            failed: 0,
            skipped: true,
            deduped: false,
            message: pushRequest.endpoint
                ? 'No push subscription found for this browser endpoint.'
                : 'No push subscriptions found for this user.'
        };
    }

    const pushConfig = ensureWebPushConfigured();
    const deliverableWebSubscriptions = pushConfig.ok ? subscriptions : [];

    const skipIfLastSentLocalDate = pushRequest.skipIfLastSentLocalDate;
    const filteredWebSubscriptions =
        skipIfLastSentLocalDate instanceof Date
            ? deliverableWebSubscriptions.filter(
                  (subscription) => !isSameUtcDate(subscription.last_sent_local_date, skipIfLastSentLocalDate)
              )
            : deliverableWebSubscriptions;
    const filteredNativeSubscriptions =
        skipIfLastSentLocalDate instanceof Date
            ? nativeSubscriptions.filter(
                  (subscription) => !isSameUtcDate(subscription.last_sent_local_date, skipIfLastSentLocalDate)
              )
            : nativeSubscriptions;

    if (filteredWebSubscriptions.length === 0 && filteredNativeSubscriptions.length === 0) {
        const noConfiguredWebPush = subscriptions.length > 0 && !pushConfig.ok && nativeSubscriptions.length === 0;
        return {
            attempted: true,
            sent: 0,
            failed: 0,
            skipped: true,
            deduped: !noConfiguredWebPush,
            message: noConfiguredWebPush
                ? pushConfig.error ?? 'Web push is not configured.'
                : 'All push subscriptions already received this reminder for the local day.'
        };
    }

    let sent = 0;
    let failed = 0;
    const payloadString = JSON.stringify(pushRequest.payload);

    for (const subscription of filteredWebSubscriptions) {
        try {
            await sendWebPushNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.p256dh,
                        auth: subscription.auth
                    }
                },
                payloadString
            );

            sent += 1;
            diagnosticsRegistry.recordOperation('notification_delivery', 'success');

            if (pushRequest.markSentLocalDate instanceof Date) {
                await prisma.pushSubscription.update({
                    where: { id: subscription.id },
                    data: { last_sent_local_date: pushRequest.markSentLocalDate }
                });
            }
        } catch (error) {
            failed += 1;
            diagnosticsRegistry.recordOperation('notification_delivery', 'failure');

            if (shouldDeleteSubscription(error)) {
                await prisma.pushSubscription.delete({ where: { id: subscription.id } });
                continue;
            }

            const errorType = error instanceof Error ? error.name : 'UnknownError';
            console.warn(`Web push delivery failed; the subscription remains eligible for retry (error_type=${errorType}).`);
        }
    }

    const nativePushSubscription = (prisma as typeof prisma & {
        nativePushSubscription?: {
            update: (args: unknown) => Promise<unknown>;
            updateMany: (args: unknown) => Promise<unknown>;
        };
    }).nativePushSubscription;

    for (const subscription of filteredNativeSubscriptions) {
        try {
            await sendNativePushNotification(subscription, pushRequest.payload);
            sent += 1;
            diagnosticsRegistry.recordOperation('notification_delivery', 'success');

            if (pushRequest.markSentLocalDate instanceof Date && nativePushSubscription) {
                await nativePushSubscription.update({
                    where: { id: subscription.id },
                    data: { last_sent_local_date: pushRequest.markSentLocalDate }
                });
            }
        } catch (error) {
            failed += 1;
            diagnosticsRegistry.recordOperation('notification_delivery', 'failure');

            if (shouldDeleteSubscription(error) && nativePushSubscription) {
                await nativePushSubscription.updateMany({
                    where: { id: subscription.id },
                    data: { revoked_at: new Date() }
                });
                continue;
            }

            const errorType = error instanceof Error ? error.name : 'UnknownError';
            console.warn(`Native push delivery failed; the subscription remains eligible for retry (error_type=${errorType}).`);
        }
    }

    return {
        attempted: true,
        sent,
        failed,
        skipped: sent === 0 && failed === 0,
        deduped: false
    };
};

/**
 * Deliver one logical notification to one or both channels with per-channel status reporting.
 */
export const deliverUserNotification = async ({
    userId,
    channels = [...DEFAULT_NOTIFICATION_DELIVERY_CHANNELS],
    inApp,
    push
}: DeliverUserNotificationRequest): Promise<DeliverUserNotificationResult> => {
    const resolvedChannels = resolveNotificationDeliveryChannels(channels, DEFAULT_NOTIFICATION_DELIVERY_CHANNELS);
    const hasInApp = resolvedChannels.includes(NOTIFICATION_DELIVERY_CHANNELS.IN_APP);
    const hasPush = resolvedChannels.includes(NOTIFICATION_DELIVERY_CHANNELS.PUSH);

    const inAppPromise = hasInApp
        ? createInAppNotifications(userId, normalizeInAppRequests(inApp))
        : Promise.resolve<InAppDeliveryResult>({
              attempted: false,
              created: 0,
              skipped: true,
              deduped: false,
              message: 'In-app channel not selected.'
          });

    const pushPromise = hasPush
        ? sendPushNotifications(userId, push)
        : Promise.resolve<PushDeliveryResult>({
              attempted: false,
              sent: 0,
              failed: 0,
              skipped: true,
              deduped: false,
              message: 'Push channel not selected.'
          });

    const [inAppResult, pushResult] = await Promise.all([inAppPromise, pushPromise]);

    return {
        channels: resolvedChannels,
        inApp: inAppResult,
        push: pushResult
    };
};
