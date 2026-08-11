/**
 * Exercises query behavior and regression boundaries.
 */
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import type { InAppNotification } from '@calibrate/api-client';
import { IN_APP_NOTIFICATION_TYPES } from '@calibrate/shared/inAppNotifications';
import {
    activeNotificationQueryKey,
    dedupeNotificationPages,
    notificationHistoryQueryKey,
    reconcileAllNotificationsRead,
    reconcileNotificationDismissed,
    reconcileNotificationRead,
    type NotificationListPage
} from './query';

/** Build deterministic notification for regression coverage. */
function notification(id: number, overrides: Partial<InAppNotification> = {}): InAppNotification {
    return {
        id,
        type: IN_APP_NOTIFICATION_TYPES.GENERIC,
        local_date: '2026-08-09',
        title: `Notification ${id}`,
        body: 'Body',
        action_url: '/today',
        read_at: null,
        dismissed_at: null,
        created_at: `2026-08-09T12:0${id}:00.000Z`,
        ...overrides
    };
}

/** Build deterministic history data for regression coverage. */
function historyData(pages: NotificationListPage[]): InfiniteData<NotificationListPage> {
    return { pages, pageParams: pages.map((_, index) => index || undefined) };
}

describe('notification query reconciliation', () => {
    it('deduplicates cursor pages in first-seen order when a realtime refresh overlaps an older page', () => {
        expect(dedupeNotificationPages([
            { notifications: [notification(3), notification(2)], unread_count: 3 },
            { notifications: [notification(2), notification(1)], unread_count: 3 }
        ]).map(({ id }) => id)).toEqual([3, 2, 1]);
    });

    it('reconciles one read notification across badge, drawer, and history caches', () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(activeNotificationQueryKey, {
            notifications: [notification(2), notification(1)],
            unread_count: 2,
            next_cursor: null
        });
        queryClient.setQueryData(notificationHistoryQueryKey, historyData([{
            notifications: [notification(2), notification(1)],
            unread_count: 2,
            next_cursor: null
        }]));

        reconcileNotificationRead(queryClient, 2, '2026-08-09T13:00:00.000Z');

        expect(queryClient.getQueryData<NotificationListPage>(activeNotificationQueryKey)).toMatchObject({
            unread_count: 1,
            notifications: [{ id: 1 }]
        });
        const history = queryClient.getQueryData<InfiniteData<NotificationListPage>>(notificationHistoryQueryKey);
        expect(history?.pages[0].notifications[0]).toMatchObject({
            id: 2,
            read_at: '2026-08-09T13:00:00.000Z'
        });
        queryClient.clear();
    });

    it('marks dismissal and read-all without rebuilding infinite-query pages', () => {
        const queryClient = new QueryClient();
        const pages = historyData([
            { notifications: [notification(2)], unread_count: 2, next_cursor: 'cursor' },
            { notifications: [notification(1)], unread_count: 2, next_cursor: null }
        ]);
        queryClient.setQueryData(activeNotificationQueryKey, {
            notifications: [notification(2), notification(1)],
            unread_count: 2,
            next_cursor: null
        });
        queryClient.setQueryData(notificationHistoryQueryKey, pages);

        reconcileNotificationDismissed(queryClient, 2, '2026-08-09T13:00:00.000Z');
        let history = queryClient.getQueryData<InfiniteData<NotificationListPage>>(notificationHistoryQueryKey)!;
        expect(history.pages).toHaveLength(2);
        expect(history.pageParams).toEqual(pages.pageParams);
        expect(history.pages[0].notifications[0]).toMatchObject({
            dismissed_at: '2026-08-09T13:00:00.000Z',
            read_at: '2026-08-09T13:00:00.000Z'
        });

        reconcileAllNotificationsRead(queryClient, '2026-08-09T14:00:00.000Z');
        expect(queryClient.getQueryData<NotificationListPage>(activeNotificationQueryKey)).toMatchObject({
            unread_count: 0,
            notifications: []
        });
        history = queryClient.getQueryData<InfiniteData<NotificationListPage>>(notificationHistoryQueryKey)!;
        expect(history.pages).toHaveLength(2);
        expect(history.pages.every((page) => page.unread_count === 0)).toBe(true);
        expect(history.pages[1].notifications[0].read_at).toBe('2026-08-09T14:00:00.000Z');
        queryClient.clear();
    });
});
