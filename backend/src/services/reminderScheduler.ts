import prisma from '../config/database';
import { getSafeUtcTodayDateOnlyInTimeZone } from '../utils/date';
import { parsePositiveInteger } from '../utils/requestParsing';
import { MS_PER_MINUTE } from '../utils/time';
import {
    ensureReminderInAppNotificationsForDate,
    getReminderMissingStatusForDate,
    resolveInactiveReminderNotificationsForUser
} from './inAppNotifications';
import { buildReminderPayload } from './pushNotificationPayloads';
import { ensureWebPushConfigured, sendWebPushNotification } from './webPush';

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

const isSameUtcDate = (left: Date | null | undefined, right: Date): boolean => {
    if (!left) return false;
    return left.getTime() === right.getTime();
};

const shouldDeleteSubscription = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const statusCode = (error as { statusCode?: number }).statusCode;
    return statusCode === 404 || statusCode === 410;
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
            reminder_log_food_enabled: true,
            push_subscriptions: {
                select: {
                    id: true,
                    endpoint: true,
                    p256dh: true,
                    auth: true,
                    last_sent_local_date: true
                }
            }
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

        await ensureReminderInAppNotificationsForDate({
            userId: user.id,
            localDate: todayLocalDate,
            missingWeight,
            missingFood
        });

        if (!webPushConfig.ok) {
            continue;
        }

        const payload = buildReminderPayload({ missingFood, missingWeight });

        for (const subscription of user.push_subscriptions) {
            if (isSameUtcDate(subscription.last_sent_local_date, todayLocalDate)) {
                continue;
            }

            try {
                await sendWebPushNotification(
                    {
                        endpoint: subscription.endpoint,
                        keys: {
                            p256dh: subscription.p256dh,
                            auth: subscription.auth
                        }
                    },
                    JSON.stringify(payload)
                );

                await prisma.pushSubscription.update({
                    where: { id: subscription.id },
                    data: { last_sent_local_date: todayLocalDate }
                });
            } catch (error) {
                if (shouldDeleteSubscription(error)) {
                    await prisma.pushSubscription.delete({ where: { id: subscription.id } });
                    continue;
                }

                const message = error instanceof Error ? error.message : 'Unknown error';
                console.warn(`Failed to send reminder for subscription ${subscription.id}: ${message}`);
            }
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
