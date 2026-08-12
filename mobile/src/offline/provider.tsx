import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { hasFullAccountAccess } from '../auth/accountAccess';
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
    onReplayCompleted?: (result: ReconcileResult) => void | Promise<void>;
};

const OfflineOutboxContext = createContext<OfflineOutboxContextValue | null>(null);

/** Binds SQLite queue access to the currently authenticated server and user. */
export function OfflineOutboxProvider({ children, executeMutation, onReplayCompleted }: OfflineOutboxProviderProps) {
    const { serverUrl, user } = useAuth();
    const userId = hasFullAccountAccess(user) ? user?.id : undefined;
    const [outbox, setOutbox] = useState<SqliteOutbox | null>(null);
    const [mutations, setMutations] = useState<QueuedMutation[]>([]);
    const [initializationError, setInitializationError] = useState<string | null>(null);
    const retrySchedulerRef = useRef<(result: ReconcileResult) => void>(() => undefined);

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

    const notifyAfterReplay = useCallback(async (result: ReconcileResult) => {
        notifyWearAfterReplay(result);
        if (result.replayed === 0 || !onReplayCompleted) return;
        await onReplayCompleted(result);
    }, [notifyWearAfterReplay, onReplayCompleted]);

    const enqueue = useCallback(async (operation: string, payload: unknown, operationId?: string) => {
        const mutation = await requireOutbox().enqueue({ id: operationId, operation, payload });
        await refresh();
        return mutation;
    }, [refresh, requireOutbox]);

    const reconcile = useCallback(async () => {
        if (!reconciler) throw new Error('Offline outbox is unavailable until authentication is ready.');
        const scheduleRetry = retrySchedulerRef.current;
        const result = await reconciler.reconcile();
        scheduleRetry(result);
        await notifyAfterReplay(result);
        await refresh();
        return result;
    }, [notifyAfterReplay, reconciler, refresh]);

    const retryFailed = useCallback(async (id?: string) => {
        if (!reconciler) throw new Error('Offline outbox is unavailable until authentication is ready.');
        const scheduleRetry = retrySchedulerRef.current;
        const result = await reconciler.retryFailed(id);
        scheduleRetry(result);
        await notifyAfterReplay(result);
        await refresh();
        return result;
    }, [notifyAfterReplay, reconciler, refresh]);

    const discardAll = useCallback(async () => {
        await requireOutbox().clear();
        setMutations([]);
    }, [requireOutbox]);

    useEffect(() => {
        if (!reconciler) return;
        let active = true;
        let isForegrounded = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
        let isOnline = onlineManager.isOnline();
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        /** Cancel the single provider-owned deferred replay timer. */
        const clearRetry = () => {
            if (retryTimer !== null) clearTimeout(retryTimer);
            retryTimer = null;
        };
        /** Schedule one eligible retry using the reconciler's bounded backoff. */
        const scheduleRetry = (result: ReconcileResult) => {
            clearRetry();
            if (!active || !isForegrounded || !isOnline || result.retryAfterMs === null) return;
            retryTimer = setTimeout(() => {
                retryTimer = null;
                if (active && isForegrounded && isOnline) void replayPending(false);
            }, result.retryAfterMs);
        };
        /** Reconcile this provider generation and apply retry timing before post-replay work. */
        const replayPending = async (includeFailures: boolean) => {
            try {
                const result = includeFailures
                    ? await reconciler.retryFailed()
                    : await reconciler.reconcile();
                // Apply retry state before any slower invalidation or queue refresh can reorder completions.
                scheduleRetry(result);
                await notifyAfterReplay(result);
                if (active) await refresh();
            } catch {
                if (active) await refresh().catch(() => undefined);
            }
        };
        retrySchedulerRef.current = scheduleRetry;

        // Replay on startup, after backoff, and after foreground or connectivity recovery.
        if (isForegrounded && isOnline) void replayPending(false);
        const appStateSubscription = AppState.addEventListener('change', (state) => {
            isForegrounded = state === 'active';
            if (!isForegrounded) {
                clearRetry();
                return;
            }
            if (isOnline) void replayPending(true);
        });
        const unsubscribeOnline = onlineManager.subscribe(() => {
            isOnline = onlineManager.isOnline();
            if (!isOnline) {
                clearRetry();
                return;
            }
            if (isForegrounded) void replayPending(true);
        });
        return () => {
            active = false;
            clearRetry();
            if (retrySchedulerRef.current === scheduleRetry) {
                retrySchedulerRef.current = () => undefined;
            }
            appStateSubscription.remove();
            unsubscribeOnline();
        };
    }, [notifyAfterReplay, reconciler, refresh]);
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
