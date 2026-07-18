import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbOutbox, openIndexedDbOutboxDatabase } from './indexedDbOutbox.web';
import { OfflineOutboxProvider, useOfflineOutbox } from './provider.web';
import { createOutboxNamespace } from './queuedMutation';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'generated-operation-id') }));

let mockAuthState = {
    serverUrl: 'https://health.example',
    user: { id: 7 }
};

jest.mock('../auth/AuthContext', () => ({
    useAuth: () => mockAuthState
}));

function createConnectivity(initialOnline: boolean) {
    let online = initialOnline;
    const listeners = new Set<() => void>();
    return {
        value: {
            isOnline: () => online,
            subscribe: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }
        },
        goOnline: () => {
            online = true;
            listeners.forEach((listener) => listener());
        }
    };
}

describe('browser offline outbox provider', () => {
    let database: IDBDatabase;
    let openDatabase: jest.Mock<Promise<IDBDatabase>, []>;

    beforeEach(async () => {
        mockAuthState = { serverUrl: 'https://health.example', user: { id: 7 } };
        database = await openIndexedDbOutboxDatabase({
            factory: new IDBFactory(),
            databaseName: 'provider-test-outbox'
        });
        openDatabase = jest.fn(async () => database);
    });

    afterEach(() => database.close());

    it('isolates account switches immediately and restores each account queue deterministically', async () => {
        const connectivity = createConnectivity(false);
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <OfflineOutboxProvider
                executeMutation={jest.fn()}
                openDatabase={openDatabase}
                connectivity={connectivity.value}
            >
                {children}
            </OfflineOutboxProvider>
        );
        const { result, rerender } = renderHook(() => useOfflineOutbox(), { wrapper });
        await waitFor(() => expect(result.current.isReady).toBe(true));
        await act(async () => {
            await result.current.enqueue('food.create', { calories: 100 }, 'user-7-operation');
        });
        expect(result.current.mutations).toEqual([
            expect.objectContaining({ id: 'user-7-operation', namespace: createOutboxNamespace('https://health.example', 7) })
        ]);

        mockAuthState = { serverUrl: 'https://health.example', user: { id: 9 } };
        rerender({});
        expect(result.current.isReady).toBe(false);
        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(result.current.mutations).toEqual([]);
        await act(async () => {
            await result.current.enqueue('metric.add', { date: '2026-07-18', weight: 88 }, 'user-9-operation');
        });

        mockAuthState = { serverUrl: 'https://health.example', user: { id: 7 } };
        rerender({});
        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(result.current.mutations).toEqual([expect.objectContaining({ id: 'user-7-operation' })]);
        await act(async () => { await result.current.discardAll(); });

        const userNine = new IndexedDbOutbox(database, createOutboxNamespace('https://health.example', 9));
        await expect(userNine.list()).resolves.toEqual([expect.objectContaining({ id: 'user-9-operation' })]);
    });

    it('replays pending writes on startup when the browser is online', async () => {
        const namespace = createOutboxNamespace(mockAuthState.serverUrl, mockAuthState.user.id);
        await new IndexedDbOutbox(database, namespace).enqueue({
            id: 'startup-operation',
            operation: 'food-day.update',
            payload: { date: '2026-07-18', is_complete: true }
        });
        const executeMutation = jest.fn(async () => undefined);
        const connectivity = createConnectivity(true);
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <OfflineOutboxProvider
                executeMutation={executeMutation}
                openDatabase={openDatabase}
                connectivity={connectivity.value}
            >
                {children}
            </OfflineOutboxProvider>
        );
        const { result } = renderHook(() => useOfflineOutbox(), { wrapper });

        await waitFor(() => expect(executeMutation).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'startup-operation', operation: 'food-day.update' })
        ));
        await waitFor(() => expect(result.current.mutations).toEqual([]));
    });

    it('retries a durable startup failure when the browser comes online', async () => {
        const namespace = createOutboxNamespace(mockAuthState.serverUrl, mockAuthState.user.id);
        await new IndexedDbOutbox(database, namespace).enqueue({
            id: 'retry-operation',
            operation: 'food.delete',
            payload: { id: 3 }
        });
        let shouldFail = true;
        const executeMutation = jest.fn(async () => {
            if (shouldFail) throw new Error('network unavailable');
        });
        const connectivity = createConnectivity(true);
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <OfflineOutboxProvider
                executeMutation={executeMutation}
                openDatabase={openDatabase}
                connectivity={connectivity.value}
            >
                {children}
            </OfflineOutboxProvider>
        );
        const { result } = renderHook(() => useOfflineOutbox(), { wrapper });
        await waitFor(() => expect(result.current.mutations).toEqual([
            expect.objectContaining({ id: 'retry-operation', state: 'failed', attemptCount: 1 })
        ]));

        shouldFail = false;
        act(() => connectivity.goOnline());
        await waitFor(() => expect(result.current.mutations).toEqual([]));
        expect(executeMutation).toHaveBeenCalledTimes(2);
    });

    it('surfaces IndexedDB initialization failures and rejects writes honestly', async () => {
        const connectivity = createConnectivity(false);
        const error = new Error('Browser offline storage is unavailable: site storage is blocked.');
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <OfflineOutboxProvider
                executeMutation={jest.fn()}
                openDatabase={jest.fn(async () => { throw error; })}
                connectivity={connectivity.value}
            >
                {children}
            </OfflineOutboxProvider>
        );
        const { result } = renderHook(() => useOfflineOutbox(), { wrapper });

        await waitFor(() => expect(result.current.initializationError).toBe(error.message));
        expect(result.current.isReady).toBe(false);
        await expect(result.current.enqueue('food.create', { calories: 100 }))
            .rejects.toThrow(error.message);
    });
});
