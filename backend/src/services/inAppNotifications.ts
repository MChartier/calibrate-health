import { InAppNotificationType, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { getSafeUtcTodayDateOnlyInTimeZone } from '../utils/date';
import { IN_APP_NOTIFICATION_ACTION_URLS, IN_APP_NOTIFICATION_TYPES, type InAppNotificationType as SharedInAppNotificationType } from '../../../shared/inAppNotifications';

const REMINDER_TYPES: readonly InAppNotificationType[] = [
    InAppNotificationType.LOG_WEIGHT_REMINDER,
    InAppNotificationType.LOG_FOOD_REMINDER
] as const;

const ACTION_URL_BY_TYPE: Record<InAppNotificationType, string> = {
    [InAppNotificationType.LOG_WEIGHT_REMINDER]:
        IN_APP_NOTIFICATION_ACTION_URLS[IN_APP_NOTIFICATION_TYPES.LOG_WEIGHT_REMINDER],
    [InAppNotificationType.LOG_FOOD_REMINDER]:
        IN_APP_NOTIFICATION_ACTION_URLS[IN_APP_NOTIFICATION_TYPES.LOG_FOOD_REMINDER]
};

type InAppNotificationClient = {
    inAppNotification: {
        findMany: typeof prisma.inAppNotification.findMany;
        createMany: typeof prisma.inAppNotification.createMany;
        updateMany: typeof prisma.inAppNotification.updateMany;
    };
    foodLog: {
        count: typeof prisma.foodLog.count;
    };
    bodyMetric: {
        count: typeof prisma.bodyMetric.count;
    };
};

export type InAppNotificationWire = {
    id: number;
    type: SharedInAppNotificationType;
    local_date: string;
    created_at: string;
    read_at: string | null;
    action_url: string;
};

type InAppNotificationListResponse = {
    notifications: InAppNotificationWire[];
    unreadCount: number;
};

type ReminderMissingStatus = {
    missingWeight: boolean;
    missingFood: boolean;
};

type ReminderMissingStatusArgs = {
    userId: number;
    localDate: Date;
    reminderLogWeightEnabled: boolean;
    reminderLogFoodEnabled: boolean;
    db?: InAppNotificationClient;
};

type EnsureReminderNotificationsArgs = {
    userId: number;
    localDate: Date;
    missingWeight: boolean;
    missingFood: boolean;
    db?: InAppNotificationClient;
};

type ResolveInactiveReminderNotificationsArgs = {
    userId: number;
    timeZone: string;
    now?: Date;
    db?: InAppNotificationClient;
};

type ListActiveInAppNotificationsArgs = {
    userId: number;
    db?: InAppNotificationClient;
};

type MarkInAppNotificationArgs = {
    userId: number;
    notificationId: number;
    now?: Date;
    db?: InAppNotificationClient;
};

type NotificationRow = Prisma.InAppNotificationGetPayload<{
    select: {
        id: true;
        type: true;
        local_date: true;
        created_at: true;
        read_at: true;
    };
}>;

const isSameUtcDate = (left: Date, right: Date): boolean => left.getTime() === right.getTime();

const formatUtcDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const serializeNotification = (row: NotificationRow): InAppNotificationWire => {
    return {
        id: row.id,
        type: row.type,
        local_date: formatUtcDateOnly(row.local_date),
        created_at: row.created_at.toISOString(),
        read_at: row.read_at ? row.read_at.toISOString() : null,
        action_url: ACTION_URL_BY_TYPE[row.type]
    };
};

/**
 * Count today's user logs and derive reminder gaps for each reminder type.
 */
export const getReminderMissingStatusForDate = async ({
    userId,
    localDate,
    reminderLogWeightEnabled,
    reminderLogFoodEnabled,
    db = prisma
}: ReminderMissingStatusArgs): Promise<ReminderMissingStatus> => {
    const [foodCount, weightCount] = await Promise.all([
        reminderLogFoodEnabled
            ? db.foodLog.count({
                  where: {
                      user_id: userId,
                      local_date: localDate
                  }
              })
            : Promise.resolve(1),
        reminderLogWeightEnabled
            ? db.bodyMetric.count({
                  where: {
                      user_id: userId,
                      date: localDate
                  }
              })
            : Promise.resolve(1)
    ]);

    return {
        missingWeight: reminderLogWeightEnabled && weightCount === 0,
        missingFood: reminderLogFoodEnabled && foodCount === 0
    };
};

/**
 * Create in-app reminder entries for missing logs, without re-opening dismissed items.
 */
export const ensureReminderInAppNotificationsForDate = async ({
    userId,
    localDate,
    missingWeight,
    missingFood,
    db = prisma
}: EnsureReminderNotificationsArgs): Promise<void> => {
    const rows: Prisma.InAppNotificationCreateManyInput[] = [];

    if (missingWeight) {
        rows.push({
            user_id: userId,
            type: InAppNotificationType.LOG_WEIGHT_REMINDER,
            local_date: localDate
        });
    }

    if (missingFood) {
        rows.push({
            user_id: userId,
            type: InAppNotificationType.LOG_FOOD_REMINDER,
            local_date: localDate
        });
    }

    if (rows.length === 0) {
        return;
    }

    await db.inAppNotification.createMany({
        data: rows,
        skipDuplicates: true
    });
};

/**
 * Resolve active reminders when the user completes a log or when the local day has passed.
 */
export const resolveInactiveReminderNotificationsForUser = async ({
    userId,
    timeZone,
    now = new Date(),
    db = prisma
}: ResolveInactiveReminderNotificationsArgs): Promise<number> => {
    const activeNotifications = await db.inAppNotification.findMany({
        where: {
            user_id: userId,
            type: { in: [...REMINDER_TYPES] },
            dismissed_at: null,
            resolved_at: null
        },
        select: {
            id: true,
            type: true,
            local_date: true
        }
    });

    if (activeNotifications.length === 0) {
        return 0;
    }

    const todayLocalDate = getSafeUtcTodayDateOnlyInTimeZone(timeZone, now);

    const hasTodayFoodReminder = activeNotifications.some(
        (notification) =>
            notification.type === InAppNotificationType.LOG_FOOD_REMINDER &&
            isSameUtcDate(notification.local_date, todayLocalDate)
    );
    const hasTodayWeightReminder = activeNotifications.some(
        (notification) =>
            notification.type === InAppNotificationType.LOG_WEIGHT_REMINDER &&
            isSameUtcDate(notification.local_date, todayLocalDate)
    );

    const [foodCountToday, weightCountToday] = await Promise.all([
        hasTodayFoodReminder
            ? db.foodLog.count({
                  where: {
                      user_id: userId,
                      local_date: todayLocalDate
                  }
              })
            : Promise.resolve(0),
        hasTodayWeightReminder
            ? db.bodyMetric.count({
                  where: {
                      user_id: userId,
                      date: todayLocalDate
                  }
              })
            : Promise.resolve(0)
    ]);

    const idsToResolve = activeNotifications
        .filter((notification) => {
            if (notification.local_date.getTime() < todayLocalDate.getTime()) {
                return true;
            }

            if (
                notification.type === InAppNotificationType.LOG_WEIGHT_REMINDER &&
                isSameUtcDate(notification.local_date, todayLocalDate) &&
                weightCountToday > 0
            ) {
                return true;
            }

            if (
                notification.type === InAppNotificationType.LOG_FOOD_REMINDER &&
                isSameUtcDate(notification.local_date, todayLocalDate) &&
                foodCountToday > 0
            ) {
                return true;
            }

            return false;
        })
        .map((notification) => notification.id);

    if (idsToResolve.length === 0) {
        return 0;
    }

    const result = await db.inAppNotification.updateMany({
        where: {
            user_id: userId,
            id: { in: idsToResolve },
            dismissed_at: null,
            resolved_at: null
        },
        data: {
            resolved_at: now
        }
    });

    return result.count;
};

/**
 * Fetch active in-app notifications ordered newest-first with an unread count.
 */
export const listActiveInAppNotificationsForUser = async ({
    userId,
    db = prisma
}: ListActiveInAppNotificationsArgs): Promise<InAppNotificationListResponse> => {
    const rows = await db.inAppNotification.findMany({
        where: {
            user_id: userId,
            read_at: null,
            dismissed_at: null,
            resolved_at: null
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            type: true,
            local_date: true,
            created_at: true,
            read_at: true
        }
    });

    return {
        notifications: rows.map(serializeNotification),
        unreadCount: rows.length
    };
};

/**
 * Mark a reminder as read (idempotent).
 */
export const markInAppNotificationRead = async ({
    userId,
    notificationId,
    now = new Date(),
    db = prisma
}: MarkInAppNotificationArgs): Promise<void> => {
    await db.inAppNotification.updateMany({
        where: {
            id: notificationId,
            user_id: userId,
            dismissed_at: null,
            resolved_at: null,
            read_at: null
        },
        data: {
            read_at: now
        }
    });
};

/**
 * Dismiss a reminder from the in-app feed (idempotent).
 */
export const markInAppNotificationDismissed = async ({
    userId,
    notificationId,
    now = new Date(),
    db = prisma
}: MarkInAppNotificationArgs): Promise<void> => {
    await db.inAppNotification.updateMany({
        where: {
            id: notificationId,
            user_id: userId,
            dismissed_at: null,
            resolved_at: null
        },
        data: {
            dismissed_at: now,
            read_at: now
        }
    });
};
