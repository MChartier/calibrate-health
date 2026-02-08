export const IN_APP_NOTIFICATIONS_UPDATED_EVENT = 'IN_APP_NOTIFICATIONS_UPDATED';

type InAppNotificationsUpdatedMessage = {
    type: typeof IN_APP_NOTIFICATIONS_UPDATED_EVENT;
};

/**
 * Build a stable service worker -> page message payload for notification refreshes.
 */
export const buildInAppNotificationsUpdatedMessage = (): InAppNotificationsUpdatedMessage => ({
    type: IN_APP_NOTIFICATIONS_UPDATED_EVENT
});

export const isInAppNotificationsUpdatedMessage = (value: unknown): value is InAppNotificationsUpdatedMessage => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    return (value as { type?: unknown }).type === IN_APP_NOTIFICATIONS_UPDATED_EVENT;
};
