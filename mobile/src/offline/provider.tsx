import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { openOutboxDatabase } from './database';
import { SqliteOutbox } from './outbox';
import { OutboxReconciler, type QueuedMutationExecutor, type ReconcileResult } from './reconciler';
import { createOutboxNamespace, type QueuedMutation } from './queuedMutation';
import { queueWearSyncInvalidation } from '../wear/syncInvalidation';

type OfflineOutboxContextValue = {
    isReady: boolean;
    initializationError: string | null;
    mutations: QueuedMutation[];
    enqueue: (operation: string, payload: unknown, operationId?: string) => Promise<QueuedMutation>;
    reconcile: () => Promise<ReconcileResult>;
    retryFailed: (id?: string) => Promise<ReconcileResult>;
    discardAll: () => Promise<void>;
    refresh: () => Promise<void>;
};

type OfflineOutboxProviderProps = {
    children: React.ReactNode;
    executeMutation: QueuedMutationExecutor;
};

const OfflineOutboxContext = createContext<OfflineOutboxContextValue | null>(null);

/** Binds SQLite queue access to the currently authenticated server and user. */
export function OfflineOutboxProvider({ children, executeMutation }: OfflineOutboxProviderProps) {
    const { serverUrl, user } = useAuth();
    const userId = user?.id;
    const [outbox, setOutbox] = useState<SqliteOutbox | null>(null);
    const [mutations, setMutations] = useState<QueuedMutation[]>([]);
    const [initializationError, setInitializationError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setOutbox(null);
        setMutations([]);
        setInitializationError(null);
        if (userId === undefined) return () => { active = false; };

        const namespace = createOutboxNamespace(serverUrl, userId);
        void openOutboxDatabase().then(async (database) => {
            const nextOutbox = new SqliteOutbox(database, namespace);
            await nextOutbox.recoverInterrupted();
            const nextMutations = await nextOutbox.list();
            if (active) {
                setOutbox(nextOutbox);
                setMutations(nextMutations);
            }
        }).catch((error: unknown) => {
            if (active) {
                setInitializationError(error instanceof Error ? error.message : 'Unable to open the offline outbox.');
            }
        });

        return () => { active = false; };
    }, [serverUrl, userId]);

    const reconciler = useMemo(
        () => outbox ? new OutboxReconciler(outbox, executeMutation) : null,
        [executeMutation, outbox]
    );

    const requireOutbox = useCallback(() => {
        if (!outbox) throw new Error('Offline outbox is unavailable until authentication is ready.');
        return outbox;
    }, [outbox]);

    const refresh = useCallback(async () => {
        setMutations(await requireOutbox().list());
    }, [requireOutbox]);

    const notifyWearAfterReplay = useCallback((result: ReconcileResult) => {
        if (result.replayed > 0 && userId !== undefined) {
            void queueWearSyncInvalidation({ serverOrigin: serverUrl, userId });
        }
    }, [serverUrl, userId]);

    const enqueue = useCallback(async (operation: string, payload: unknown, operationId?: string) => {
        const mutation = await requireOutbox().enqueue({ id: operationId, operation, payload });
        await refresh();
        return mutation;
    }, [refresh, requireOutbox]);

    const reconcile = useCallback(async () => {
        if (!reconciler) throw new Error('Offline outbox is unavailable until authentication is ready.');
        const result = await reconciler.reconcile();
        notifyWearAfterReplay(result);
        await refresh();
        return result;
    }, [notifyWearAfterReplay, reconciler, refresh]);

    const retryFailed = useCallback(async (id?: string) => {
        if (!reconciler) throw new Error('Offline outbox is unavailable until authentication is ready.');
        const result = await reconciler.retryFailed(id);
        notifyWearAfterReplay(result);
        await refresh();
        return result;
    }, [notifyWearAfterReplay, reconciler, refresh]);

    const discardAll = useCallback(async () => {
        await requireOutbox().clear();
        setMutations([]);
    }, [requireOutbox]);

    const replayPending = useCallback(async (includeFailures: boolean) => {
        if (!reconciler) return;
        try {
            const result = includeFailures
                ? await reconciler.retryFailed()
                : await reconciler.reconcile();
            notifyWearAfterReplay(result);
            await refresh();
        } catch {
            await refresh().catch(() => undefined);
        }
    }, [notifyWearAfterReplay, reconciler, refresh]);

    useEffect(() => {
        if (!reconciler) return;
        // Replay on startup and whenever the app returns to the foreground after a connection change.
        void replayPending(false);
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void replayPending(true);
        });
        return () => subscription.remove();
    }, [reconciler, replayPending]);

    const value = useMemo<OfflineOutboxContextValue>(() => ({
        isReady: outbox !== null,
        initializationError,
        mutations,
        enqueue,
        reconcile,
        retryFailed,
        discardAll,
        refresh
    }), [discardAll, enqueue, initializationError, mutations, outbox, reconcile, refresh, retryFailed]);

    return <OfflineOutboxContext.Provider value={value}>{children}</OfflineOutboxContext.Provider>;
}

export function useOfflineOutbox(): OfflineOutboxContextValue {
    const context = useContext(OfflineOutboxContext);
    if (!context) throw new Error('useOfflineOutbox must be used within OfflineOutboxProvider.');
    return context;
}
