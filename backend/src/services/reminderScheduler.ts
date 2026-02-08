import prisma from '../config/database';
import { InAppNotificationType } from '@prisma/client';
import { getSafeUtcTodayDateOnlyInTimeZone } from '../utils/date';
import { parsePositiveInteger } from '../utils/requestParsing';
import { MS_PER_MINUTE } from '../utils/time';
import {
    buildReminderInAppDedupeKey,
    getReminderMissingStatusForDate,
    resolveInactiveReminderNotificationsForUser
} from './inAppNotifications';
import { deliverUserNotification, type InAppNotificationDeliveryRequest } from './notificationDelivery';
import { buildReminderPayload } from './pushNotificationPayloads';
import {
    DEFAULT_NOTIFICATION_DELIVERY_CHANNELS,
    NOTIFICATION_DELIVERY_CHANNELS
} from '../../../shared/notificationDelivery';
import { ensureWebPushConfigured } from './webPush';

const DEFAULT_REMINDER_SEND_HOUR_LOCAL = 9; // Local hour (0-23) to begin sending reminders.
const DEFAULT_REMINDER_JOB_INTERVAL_MINUTES = 15; // How often to scan for eligible reminders.

let hasLoggedMissingConfig = false;

const parseReminderHour = (value: string | undefined): number | null => {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 23) {
        return null;
    }
    return parsed;
};

const resolveReminderHour = (env: NodeJS.ProcessEnv = process.env): number => {
    const parsed = parseReminderHour(env.REMINDER_SEND_LOCAL_HOUR);
    if (parsed === null) {
        if (env.REMINDER_SEND_LOCAL_HOUR) {
            console.warn(
                `REMINDER_SEND_LOCAL_HOUR="${env.REMINDER_SEND_LOCAL_HOUR}" is invalid; using ${DEFAULT_REMINDER_SEND_HOUR_LOCAL}.`
            );
        }
        return DEFAULT_REMINDER_SEND_HOUR_LOCAL;
    }
    return parsed;
};

const resolveJobIntervalMinutes = (env: NodeJS.ProcessEnv = process.env): number => {
    const parsed = parsePositiveInteger(env.REMINDER_JOB_INTERVAL_MINUTES);
    if (!parsed) {
        if (env.REMINDER_JOB_INTERVAL_MINUTES) {
            console.warn(
                `REMINDER_JOB_INTERVAL_MINUTES="${env.REMINDER_JOB_INTERVAL_MINUTES}" is invalid; using ${DEFAULT_REMINDER_JOB_INTERVAL_MINUTES}.`
            );
        }
        return DEFAULT_REMINDER_JOB_INTERVAL_MINUTES;
    }
    return parsed;
};

const getLocalHour = (timeZone: string, now: Date): number => {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(now);
        const hourPart = parts.find((part) => part.type === 'hour')?.value;
        const parsed = hourPart ? Number.parseInt(hourPart, 10) : Number.NaN;
        return Number.isFinite(parsed) ? parsed : now.getUTCHours();
    } catch {
        return now.getUTCHours();
    }
};

/**
 * Keep in-app reminder entries synchronized with current log completeness and local-day rollover.
 */
const resolveInactiveInAppReminders = async (now: Date): Promise<void> => {
    const usersWithActiveInAppReminders = await prisma.user.findMany({
        where: {
            in_app_notifications: {
                some: {
                    dismissed_at: null,
                    resolved_at: null
                }
            }
        },
        select: {
            id: true,
            timezone: true
        }
    });

    for (const user of usersWithActiveInAppReminders) {
        await resolveInactiveReminderNotificationsForUser({
            userId: user.id,
            timeZone: user.timezone,
            now
        });
    }
};

/**
 * Create scheduled in-app reminders and optionally fan out matching push notifications.
 */
const createAndSendScheduledReminders = async (reminderHour: number, now: Date): Promise<void> => {
    const webPushConfig = ensureWebPushConfigured();
    const channels = webPushConfig.ok
        ? [...DEFAULT_NOTIFICATION_DELIVERY_CHANNELS]
        : [NOTIFICATION_DELIVERY_CHANNELS.IN_APP];

    if (!webPushConfig.ok) {
        if (!hasLoggedMissingConfig) {
            console.warn(
                `${webPushConfig.error ?? 'Web push is not configured.'} Push delivery is disabled; in-app reminders will continue.`
            );
            hasLoggedMissingConfig = true;
        }
    } else {
        hasLoggedMissingConfig = false;
    }

    const users = await prisma.user.findMany({
        where: {
            OR: [{ reminder_log_weight_enabled: true }, { reminder_log_food_enabled: true }]
        },
        select: {
            id: true,
            timezone: true,
            reminder_log_weight_enabled: true,
            reminder_log_food_enabled: true
        }
    });

    for (const user of users) {
        const timeZone = user.timezone || 'UTC';
        const localHour = getLocalHour(timeZone, now);
        if (localHour < reminderHour) {
            continue;
        }

        const todayLocalDate = getSafeUtcTodayDateOnlyInTimeZone(timeZone, now);
        const { missingWeight, missingFood } = await getReminderMissingStatusForDate({
            userId: user.id,
            localDate: todayLocalDate,
            reminderLogWeightEnabled: user.reminder_log_weight_enabled,
            reminderLogFoodEnabled: user.reminder_log_food_enabled
        });

        if (!missingWeight && !missingFood) {
            continue;
        }

        const inAppNotifications: InAppNotificationDeliveryRequest[] = [];
        if (missingWeight) {
            inAppNotifications.push({
                type: InAppNotificationType.LOG_WEIGHT_REMINDER,
                localDate: todayLocalDate,
                dedupeKey: buildReminderInAppDedupeKey(InAppNotificationType.LOG_WEIGHT_REMINDER, todayLocalDate)
            });
        }
        if (missingFood) {
            inAppNotifications.push({
                type: InAppNotificationType.LOG_FOOD_REMINDER,
                localDate: todayLocalDate,
                dedupeKey: buildReminderInAppDedupeKey(InAppNotificationType.LOG_FOOD_REMINDER, todayLocalDate)
            });
        }
        const payload = buildReminderPayload({ missingFood, missingWeight });
        const result = await deliverUserNotification({
            userId: user.id,
            channels,
            inApp: inAppNotifications,
            push: {
                payload,
                skipIfLastSentLocalDate: todayLocalDate,
                markSentLocalDate: todayLocalDate
            }
        });

        if (result.push.failed > 0 && result.push.message) {
            console.warn(`Reminder push delivery for user ${user.id} had failures. ${result.push.message}`);
        }
    }
};

const runReminderCheck = async (): Promise<void> => {
    const reminderHour = resolveReminderHour();
    const now = new Date();

    await resolveInactiveInAppReminders(now);
    await createAndSendScheduledReminders(reminderHour, now);
};

/**
 * Start the reminder scheduler loop.
 */
export const startReminderScheduler = (): void => {
    const intervalMinutes = resolveJobIntervalMinutes();
    const intervalMs = intervalMinutes * MS_PER_MINUTE;

    void runReminderCheck();
    setInterval(() => {
        void runReminderCheck();
    }, intervalMs);
};
