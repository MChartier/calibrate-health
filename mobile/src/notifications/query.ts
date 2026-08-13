import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { InAppNotification } from '@calibrate/api-client';

export const MOBILE_NOTIFICATION_QUERY_KEY = ['mobile-in-app-notifications'] as const;
export const ACTIVE_NOTIFICATION_LIMIT = 5;
export const NOTIFICATION_HISTORY_PAGE_SIZE = 20;

export type NotificationListPage = {
    notifications: InAppNotification[];
    unread_count: number;
    next_cursor?: string | null;
};

export const activeNotificationQueryKey = [
    ...MOBILE_NOTIFICATION_QUERY_KEY,
    'active',
    ACTIVE_NOTIFICATION_LIMIT
] as const;

export const notificationHistoryQueryKey = [
    ...MOBILE_NOTIFICATION_QUERY_KEY,
    'history',
    NOTIFICATION_HISTORY_PAGE_SIZE
] as const;

/** Keep paged history stable when an invalidation returns an item already present in an older page. */
export function dedupeNotificationPages(
    pages: readonly NotificationListPage[] | undefined
): InAppNotification[] {
    const seen = new Set<number>();
    const notifications: InAppNotification[] = [];
    for (const page of pages ?? []) {
        for (const notification of page.notifications) {
            if (seen.has(notification.id)) continue;
            seen.add(notification.id);
            notifications.push(notification);
        }
    }
    return notifications;
}

function updateHistoryNotification(
    data: InfiniteData<NotificationListPage> | undefined,
    notificationId: number,
    update: (notification: InAppNotification) => InAppNotification
): InfiniteData<NotificationListPage> | undefined {
    if (!data) return data;
    return {
        ...data,
        pages: data.pages.map((page) => ({
            ...page,
            notifications: page.notifications.map((notification) =>
                notification.id === notificationId ? update(notification) : notification
            )
        }))
    };
}

export function reconcileNotificationRead(
    queryClient: QueryClient,
    notificationId: number,
    readAt = new Date().toISOString()
): void {
    queryClient.setQueryData<NotificationListPage>(activeNotificationQueryKey, (current) => current ? ({
        ...current,
        notifications: current.notifications.filter(({ id }) => id !== notificationId),
        unread_count: Math.max(0, current.unread_count - (
            current.notifications.some(({ id }) => id === notificationId) ? 1 : 0
        ))
    }) : current);
    queryClient.setQueryData<InfiniteData<NotificationListPage>>(notificationHistoryQueryKey, (current) =>
        updateHistoryNotification(current, notificationId, (notification) => ({
            ...notification,
            read_at: notification.read_at ?? readAt
        }))
    );
}

export function reconcileNotificationDismissed(
    queryClient: QueryClient,
    notificationId: number,
    dismissedAt = new Date().toISOString()
): void {
    reconcileNotificationRead(queryClient, notificationId, dismissedAt);
    queryClient.setQueryData<InfiniteData<NotificationListPage>>(notificationHistoryQueryKey, (current) =>
        updateHistoryNotification(current, notificationId, (notification) => ({
            ...notification,
            dismissed_at: notification.dismissed_at ?? dismissedAt,
            read_at: notification.read_at ?? dismissedAt
        }))
    );
}

export function reconcileAllNotificationsRead(
    queryClient: QueryClient,
    readAt = new Date().toISOString()
): void {
    queryClient.setQueryData<NotificationListPage>(activeNotificationQueryKey, (current) => current ? ({
        ...current,
        notifications: [],
        unread_count: 0
    }) : current);
    queryClient.setQueryData<InfiniteData<NotificationListPage>>(notificationHistoryQueryKey, (current) => current ? ({
        ...current,
        pages: current.pages.map((page) => ({
            ...page,
            unread_count: 0,
            notifications: page.notifications.map((notification) => ({
                ...notification,
                read_at: notification.read_at ?? readAt
            }))
        }))
    }) : current);
}

export function invalidateNotificationQueries(queryClient: QueryClient): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: [...MOBILE_NOTIFICATION_QUERY_KEY] });
}
