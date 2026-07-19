import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { OfflineOutboxProvider, useOfflineOutbox } from './provider';
import { openOutboxDatabase } from './database';

const mockOutbox = {
    recoverInterrupted: jest.fn(async () => undefined),
    list: jest.fn(async () => []),
    clear: jest.fn(async () => undefined)
};
const mockReconcile = jest.fn(async () => ({ replayed: 0, failedMutation: null }));
const mockRetryFailed = jest.fn(async () => ({ replayed: 1, failedMutation: null }));

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
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <OfflineOutboxProvider executeMutation={jest.fn()}>{children}</OfflineOutboxProvider>
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

        unmount();
        expect(remove).toHaveBeenCalledTimes(1);
    });
});
