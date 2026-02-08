import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { InAppNotificationType } from '../../../shared/inAppNotifications';

export type InAppNotification = {
    id: number;
    type: InAppNotificationType;
    local_date: string;
    created_at: string;
    read_at: string | null;
    title: string | null;
    body: string | null;
    action_url: string;
};

type InAppNotificationsWire = {
    notifications: InAppNotification[];
    unread_count: number;
};

export type InAppNotificationsData = {
    notifications: InAppNotification[];
    unreadCount: number;
};

const DEFAULT_REFETCH_INTERVAL_MS = 60_000; // Keep header badge state fresh while the app shell is open.

export const inAppNotificationsQueryKey = () => ['in-app-notifications'] as const;

export const fetchInAppNotifications = async (): Promise<InAppNotificationsData> => {
    const response = await axios.get<InAppNotificationsWire>('/api/notifications/in-app');
    const notifications = Array.isArray(response.data?.notifications) ? response.data.notifications : [];
    const unreadCount =
        typeof response.data?.unread_count === 'number' && Number.isFinite(response.data.unread_count)
            ? response.data.unread_count
            : 0;

    return {
        notifications,
        unreadCount
    };
};

/**
 * Query active in-app reminders for the header bell and app badge.
 */
export const useInAppNotificationsQuery = ({
    enabled,
    refetchIntervalMs = DEFAULT_REFETCH_INTERVAL_MS
}: {
    enabled: boolean;
    refetchIntervalMs?: number;
}) => {
    return useQuery({
        queryKey: inAppNotificationsQueryKey(),
        queryFn: fetchInAppNotifications,
        enabled,
        refetchInterval: enabled ? refetchIntervalMs : false,
        refetchOnWindowFocus: true
    });
};
