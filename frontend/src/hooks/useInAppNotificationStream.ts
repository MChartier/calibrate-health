import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
    NOTIFICATION_REALTIME_EVENT_NAME,
    isNotificationRealtimePayload
} from '../../../shared/notificationRealtime';
import { inAppNotificationsQueryKey } from '../queries/inAppNotifications';

const NOTIFICATION_STREAM_URL = '/api/notifications/stream';
const NOTIFICATION_STREAM_RECONNECT_MS = 5_000; // Retry after transient stream errors without fighting the server.

type StreamEvent = { data: string };
type StreamSource = {
    addEventListener: (name: string, listener: (event: StreamEvent) => void) => void;
    close: () => void;
    onerror: ((event: Event) => unknown) | null;
};

type NotificationStreamDependencies = {
    createSource: () => StreamSource;
    invalidate: () => void;
    scheduleReconnect: (callback: () => void, delayMs: number) => number;
    cancelReconnect: (timerId: number) => void;
};

/** Own one reconnecting notification stream and return an idempotent teardown callback. */
export function connectInAppNotificationStream(dependencies: NotificationStreamDependencies): () => void {
    let isActive = true;
    let source: StreamSource | null = null;
    let reconnectTimer: number | null = null;

    const cancelPendingReconnect = () => {
        if (reconnectTimer === null) return;
        dependencies.cancelReconnect(reconnectTimer);
        reconnectTimer = null;
    };

    const connect = () => {
        cancelPendingReconnect();
        if (!isActive) return;

        source = dependencies.createSource();
        source.addEventListener(NOTIFICATION_REALTIME_EVENT_NAME, (event) => {
            try {
                if (isNotificationRealtimePayload(JSON.parse(event.data))) dependencies.invalidate();
            } catch {
                // Polling remains the eventual-consistency path for malformed stream events.
            }
        });
        source.onerror = () => {
            source?.close();
            source = null;
            if (!isActive) return;
            reconnectTimer = dependencies.scheduleReconnect(connect, NOTIFICATION_STREAM_RECONNECT_MS);
        };
    };

    connect();
    return () => {
        if (!isActive) return;
        isActive = false;
        cancelPendingReconnect();
        source?.close();
        source = null;
    };
}

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
    useEffect(() => {
        if (!enabled || typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
            return;
        }
        return connectInAppNotificationStream({
            createSource: () => new window.EventSource(NOTIFICATION_STREAM_URL, { withCredentials: true }),
            invalidate: () => void queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() }),
            scheduleReconnect: (callback, delayMs) => window.setTimeout(callback, delayMs),
            cancelReconnect: (timerId) => window.clearTimeout(timerId)
        });
    }, [enabled, queryClient]);
};
