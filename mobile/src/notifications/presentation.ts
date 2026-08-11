import type { InAppNotification } from '@calibrate/api-client';
import { IN_APP_NOTIFICATION_TYPES } from '@calibrate/shared/inAppNotifications';

export function getNotificationText(notification: InAppNotification): { title: string; body: string } {
    const title = notification.title?.trim();
    const body = notification.body?.trim();
    if (title && body) return { title, body };

    switch (notification.type) {
        case IN_APP_NOTIFICATION_TYPES.LOG_WEIGHT_REMINDER:
            return {
                title: title || 'Log weight',
                body: body || 'Add today\'s weigh-in to keep your trend current.'
            };
        case IN_APP_NOTIFICATION_TYPES.LOG_FOOD_REMINDER:
            return {
                title: title || 'Finish food log',
                body: body || 'Review today\'s food log and add anything that is missing.'
            };
        default:
            return {
                title: title || 'calibrate',
                body: body || 'Open Calibrate to review this reminder.'
            };
    }
}

export function formatNotificationDate(value: string): string {
    const [yearString, monthString, dayString] = value.split('-');
    const date = new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

/** Format notification timestamp for stable display or serialization. */
export function formatNotificationTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

/** Resolve the notification state label from the current validated state. */
export function getNotificationStateLabel(
    notification: InAppNotification & { resolved_at?: string | null }
): string {
    if (notification.dismissed_at) return 'Dismissed';
    if ('resolved_at' in notification && notification.resolved_at) return 'Resolved';
    if (notification.read_at) return 'Read';
    return 'Unread';
}
