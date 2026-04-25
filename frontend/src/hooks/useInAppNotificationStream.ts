import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
    NOTIFICATION_REALTIME_EVENT_NAME,
    isNotificationRealtimePayload
} from '../../../shared/notificationRealtime';
import { inAppNotificationsQueryKey } from '../queries/inAppNotifications';

const NOTIFICATION_STREAM_URL = '/api/notifications/stream';
const NOTIFICATION_STREAM_RECONNECT_MS = 5_000; // Retry after transient stream errors without fighting the server.

/**
 * Keep the app shell subscribed to server-side notification changes.
 *
 * The hook only invalidates the existing notification query; polling and service-worker push messages remain as
 * fallback refresh paths when SSE is unavailable.
 */
export const useInAppNotificationStream = ({
    enabled,
    queryClient
}: {
    enabled: boolean;
    queryClient: QueryClient;
}) => {
    const reconnectTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
            return;
        }

        let isActive = true;
        let eventSource: EventSource | null = null;

        const clearReconnectTimeout = () => {
            if (reconnectTimeoutRef.current !== null) {
                window.clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };

        const connect = () => {
            clearReconnectTimeout();
            if (!isActive) {
                return;
            }

            eventSource = new window.EventSource(NOTIFICATION_STREAM_URL, { withCredentials: true });
            eventSource.addEventListener(NOTIFICATION_REALTIME_EVENT_NAME, (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    if (isNotificationRealtimePayload(payload)) {
                        void queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() });
                    }
                } catch {
                    // Ignore malformed realtime payloads; polling remains the source of eventual consistency.
                }
            });
            eventSource.onerror = () => {
                eventSource?.close();
                eventSource = null;
                if (!isActive) {
                    return;
                }
                reconnectTimeoutRef.current = window.setTimeout(connect, NOTIFICATION_STREAM_RECONNECT_MS);
            };
        };

        connect();

        return () => {
            isActive = false;
            clearReconnectTimeout();
            eventSource?.close();
        };
    }, [enabled, queryClient]);
};
