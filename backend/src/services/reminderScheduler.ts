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
import {
    diagnosticsRegistry,
    emitDiagnosticEvent,
    resolveObservabilityConfig
} from '../observability';

const DEFAULT_REMINDER_SEND_HOUR_LOCAL = 9; // Local hour (0-23) to begin sending reminders.
const DEFAULT_REMINDER_JOB_INTERVAL_MINUTES = 15; // How often to scan for eligible reminders.

let hasLoggedMissingConfig = false;
let isReminderCheckInProgress = false;
const observabilityConfig = resolveObservabilityConfig(process.env);

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
    const channels = [...DEFAULT_NOTIFICATION_DELIVERY_CHANNELS];

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
            console.warn(`Reminder push delivery had ${result.push.failed} failure(s); affected subscriptions remain eligible for retry.`);
        }
        if (result.push.skipped && result.push.message?.startsWith('Web push is disabled') && !hasLoggedMissingConfig) {
            console.warn(`${result.push.message} Native push delivery can still run when native tokens are registered.`);
            hasLoggedMissingConfig = true;
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
 * Execute the reminder scan with overlap protection and crash-safe error handling.
 */
const runReminderCheckSafely = async (): Promise<void> => {
    if (isReminderCheckInProgress) {
        diagnosticsRegistry.recordJob('reminder_scheduler', 'skipped', 0);
        emitDiagnosticEvent(observabilityConfig, 'background_job.completed', {
            job: 'reminder_scheduler',
            outcome: 'skipped',
            duration_ms: 0
        });
        return;
    }

    isReminderCheckInProgress = true;
    const startedAt = process.hrtime.bigint();
    try {
        await runReminderCheck();
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        diagnosticsRegistry.recordJob('reminder_scheduler', 'success', durationMs);
        emitDiagnosticEvent(observabilityConfig, 'background_job.completed', {
            job: 'reminder_scheduler',
            outcome: 'success',
            duration_ms: Math.round(durationMs * 100) / 100
        });
    } catch (error) {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        diagnosticsRegistry.recordJob('reminder_scheduler', 'failure', durationMs);
        emitDiagnosticEvent(observabilityConfig, 'background_job.completed', {
            job: 'reminder_scheduler',
            outcome: 'failure',
            duration_ms: Math.round(durationMs * 100) / 100,
            error_type: error instanceof Error ? error.name : 'UnknownError'
        });
        console.error('Reminder scheduler run failed; the next interval will retry (details omitted from logs).');
    } finally {
        isReminderCheckInProgress = false;
    }
};

/**
 * Start the reminder scheduler loop.
 */
export const startReminderScheduler = (): void => {
    const intervalMinutes = resolveJobIntervalMinutes();
    const intervalMs = intervalMinutes * MS_PER_MINUTE;

    emitDiagnosticEvent(observabilityConfig, 'background_job.scheduled', {
        job: 'reminder_scheduler',
        interval_minutes: intervalMinutes,
        local_send_hour: resolveReminderHour()
    });

    void runReminderCheckSafely();
    setInterval(() => {
        void runReminderCheckSafely();
    }, intervalMs);
};
