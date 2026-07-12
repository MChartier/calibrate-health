import { describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_REALTIME_EVENT_NAME, NOTIFICATION_REALTIME_REASONS } from '../../../shared/notificationRealtime';
import { connectInAppNotificationStream } from './useInAppNotificationStream';

type Listener = (event: { data: string }) => void;

function createHarness() {
    const sources: Array<{
        listener: Listener | null;
        close: ReturnType<typeof vi.fn>;
        onerror: ((event: Event) => unknown) | null;
    }> = [];
    const reconnectCallbacks = new Map<number, () => void>();
    const invalidate = vi.fn();
    const cancelReconnect = vi.fn((timerId: number) => reconnectCallbacks.delete(timerId));

    const disconnect = connectInAppNotificationStream({
        createSource: () => {
            const source = { listener: null as Listener | null, close: vi.fn(), onerror: null as ((event: Event) => unknown) | null };
            sources.push(source);
            return {
                addEventListener: (name, listener) => {
                    expect(name).toBe(NOTIFICATION_REALTIME_EVENT_NAME);
                    source.listener = listener;
                },
                close: source.close,
                get onerror() { return source.onerror; },
                set onerror(value) { source.onerror = value; }
            };
        },
        invalidate,
        scheduleReconnect: (callback, delayMs) => {
            expect(delayMs).toBe(5_000);
            reconnectCallbacks.set(1, callback);
            return 1;
        },
        cancelReconnect
    });

    return { cancelReconnect, disconnect, invalidate, reconnectCallbacks, sources };
}

describe('notification realtime stream', () => {
    it('invalidates only for a valid shared notification event', () => {
        const harness = createHarness();
        const listener = harness.sources[0].listener!;

        listener({ data: JSON.stringify({ reason: NOTIFICATION_REALTIME_REASONS.CREATED, updated_at: '2026-07-12T00:00:00.000Z' }) });
        listener({ data: '{malformed' });
        listener({ data: JSON.stringify({ reason: 'unknown', updated_at: '2026-07-12T00:00:00.000Z' }) });

        expect(harness.invalidate).toHaveBeenCalledTimes(1);
        harness.disconnect();
    });

    it('closes a failed source and reconnects once through the scheduler', () => {
        const harness = createHarness();
        harness.sources[0].onerror?.(new Event('error'));

        expect(harness.sources[0].close).toHaveBeenCalledTimes(1);
        expect(harness.reconnectCallbacks.size).toBe(1);
        harness.reconnectCallbacks.get(1)?.();
        expect(harness.sources).toHaveLength(2);
        harness.disconnect();
        expect(harness.sources[1].close).toHaveBeenCalledTimes(1);
    });

    it('cancels pending reconnect and remains closed after teardown', () => {
        const harness = createHarness();
        harness.sources[0].onerror?.(new Event('error'));
        const reconnect = harness.reconnectCallbacks.get(1)!;

        harness.disconnect();
        reconnect();
        harness.disconnect();

        expect(harness.cancelReconnect).toHaveBeenCalledWith(1);
        expect(harness.sources).toHaveLength(1);
    });
});
