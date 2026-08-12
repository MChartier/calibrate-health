import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { OfflineOutboxProvider, useOfflineOutbox } from './provider';
import { openOutboxDatabase } from './database';
import type { ReconcileResult } from './reconciler';

const mockOutbox = {
    recoverInterrupted: jest.fn(async () => undefined),
    list: jest.fn(async () => []),
    clear: jest.fn(async () => undefined)
};
const successfulEmptyReplay: ReconcileResult = {
    replayed: 0,
    replayedOperations: [],
    failedMutation: null,
    deferredMutation: null,
    retryAfterMs: null
};
const successfulMetricReplay: ReconcileResult = {
    replayed: 1,
    replayedOperations: ['metric.add'],
    failedMutation: null,
    deferredMutation: null,
    retryAfterMs: null
};
const mockReconcile = jest.fn(async () => successfulEmptyReplay);
const mockRetryFailed = jest.fn(async () => successfulMetricReplay);

jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({ serverUrl: 'https://health.example', user: { id: 7 } })
}));
jest.mock('./database', () => ({ openOutboxDatabase: jest.fn(async () => ({})) }));
jest.mock('./outbox', () => ({ SqliteOutbox: jest.fn(() => mockOutbox) }));
jest.mock('./reconciler', () => ({
    OutboxReconciler: jest.fn(() => ({
        reconcile: mockReconcile,
        retryFailed: mockRetryFailed
    }))
}));
jest.mock('../wear/syncInvalidation', () => ({ queueWearSyncInvalidation: jest.fn() }));

describe('native offline outbox provider recovery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockReconcile.mockReset().mockResolvedValue(successfulEmptyReplay);
        mockRetryFailed.mockReset().mockResolvedValue(successfulMetricReplay);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('preserves the startup barrier and retries failed writes after foreground recovery', async () => {
        let appStateListener: ((state: string) => void) | null = null;
        const remove = jest.fn();
        jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
            appStateListener = listener as (state: string) => void;
            return { remove } as ReturnType<typeof AppState.addEventListener>;
        });
        const onReplayCompleted = jest.fn(async () => undefined);
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <OfflineOutboxProvider executeMutation={jest.fn()} onReplayCompleted={onReplayCompleted}>
                {children}
            </OfflineOutboxProvider>
        );
        const { result, unmount } = renderHook(() => useOfflineOutbox(), { wrapper });

        await waitFor(() => expect(openOutboxDatabase).toHaveBeenCalled());
        await waitFor(() => expect(mockOutbox.list).toHaveBeenCalled());
        expect(result.current.initializationError).toBeNull();
        expect(result.current.isReady).toBe(true);
        await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
        expect(mockRetryFailed).not.toHaveBeenCalled();

        act(() => appStateListener?.('background'));
        expect(mockRetryFailed).not.toHaveBeenCalled();
        act(() => appStateListener?.('active'));
        await waitFor(() => expect(mockRetryFailed).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(onReplayCompleted).toHaveBeenCalledWith({
            replayed: 1,
            replayedOperations: ['metric.add'],
            failedMutation: null,
            deferredMutation: null,
            retryAfterMs: null
        }));

        unmount();
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it('retries a deferred write after backoff while the app remains foregrounded', async () => {
        jest.useFakeTimers();
        try {
            const remove = jest.fn();
            jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove } as ReturnType<typeof AppState.addEventListener>);
            const deferredMutation = {
                id: 'deferred-operation',
                namespace: 'test::user:7',
                sequence: 1,
                operation: 'food.create',
                payload: {},
                state: 'pending' as const,
                attemptCount: 6,
                lastError: 'operation is still settling',
                createdAt: 1,
                updatedAt: 1
            };
            mockReconcile
                .mockResolvedValueOnce({
                    replayed: 0,
                    replayedOperations: [],
                    failedMutation: null,
                    deferredMutation,
                    retryAfterMs: 30_000
                })
                .mockResolvedValueOnce({
                    replayed: 0,
                    replayedOperations: [],
                    failedMutation: null,
                    deferredMutation: { ...deferredMutation, attemptCount: 7 },
                    retryAfterMs: 30_000
                });
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <OfflineOutboxProvider executeMutation={jest.fn()}>{children}</OfflineOutboxProvider>
            );
            const { unmount } = renderHook(() => useOfflineOutbox(), { wrapper });

            await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
            await act(async () => {
                jest.advanceTimersByTime(29_999);
                await Promise.resolve();
            });
            expect(mockReconcile).toHaveBeenCalledTimes(1);
            await act(async () => {
                jest.advanceTimersByTime(1);
                await Promise.resolve();
            });
            await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(2));

            unmount();
            jest.runOnlyPendingTimers();
            expect(mockReconcile).toHaveBeenCalledTimes(2);
            expect(remove).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });
});
