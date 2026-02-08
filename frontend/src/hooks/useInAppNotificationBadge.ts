import { useEffect } from 'react';
import { clearAppBadge, isBadgingSupported, setAppBadge } from '../utils/badging';

/**
 * Mirror unread in-app notification count onto the app icon badge when supported.
 */
export const useInAppNotificationBadge = ({
    enabled,
    unreadCount,
    hasLoadedCount
}: {
    enabled: boolean;
    unreadCount: number;
    hasLoadedCount: boolean;
}): void => {
    useEffect(() => {
        if (!enabled || !isBadgingSupported()) {
            void clearAppBadge();
            return;
        }

        if (!hasLoadedCount) {
            return;
        }

        if (unreadCount <= 0) {
            void clearAppBadge();
            return;
        }

        void setAppBadge(unreadCount);
    }, [enabled, hasLoadedCount, unreadCount]);
};
