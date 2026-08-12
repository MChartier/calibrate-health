import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { hasFullAccountAccess } from '../auth/accountAccess';
import { IndexedDbOutbox, openBrowserOutboxDatabase } from './indexedDbOutbox.web';
import { OutboxReconciler, type QueuedMutationExecutor, type ReconcileResult } from './reconciler';
import { createOutboxNamespace, type QueuedMutation } from './queuedMutation';

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

type BrowserConnectivity = {
    isOnline: () => boolean;
    subscribe: (listener: () => void) => () => void;
};

type BrowserVisibility = {
    isVisible: () => boolean;
    subscribe: (listener: () => void) => () => void;
};

type OfflineOutboxProviderProps = {
    children: React.ReactNode;
    executeMutation: QueuedMutationExecutor;
    onReplayCompleted?: (result: ReconcileResult) => void | Promise<void>;
    openDatabase?: () => Promise<IDBDatabase>;
    connectivity?: BrowserConnectivity;
    visibility?: BrowserVisibility;
};

const OfflineOutboxContext = createContext<OfflineOutboxContextValue | null>(null);

const DEFAULT_BROWSER_CONNECTIVITY: BrowserConnectivity = {
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
    subscribe: (listener) => {
        if (typeof window === 'undefined') return () => undefined;
        window.addEventListener('online', listener);
        window.addEventListener('offline', listener);
        return () => {
            window.removeEventListener('online', listener);
            window.removeEventListener('offline', listener);
        };
    }
};

const DEFAULT_BROWSER_VISIBILITY: BrowserVisibility = {
    isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    subscribe: (listener) => {
        if (typeof document === 'undefined') return () => undefined;
        document.addEventListener('visibilitychange', listener);
        return () => document.removeEventListener('visibilitychange', listener);
    }
};

function getNamespace(serverUrl: string, userId: number | undefined): { value: string | null; error: string | null } {
    if (userId === undefined) return { value: null, error: null };
    try {
        return { value: createOutboxNamespace(serverUrl, userId), error: null };
    } catch (error) {
        return {
            value: null,
            error: error instanceof Error ? error.message : 'Unable to create the browser offline namespace.'
        };
    }
}

/** Binds a durable IndexedDB queue to the current browser server and authenticated user. */
export function OfflineOutboxProvider({
    children,
    executeMutation,
    onReplayCompleted,
    openDatabase = openBrowserOutboxDatabase,
    connectivity = DEFAULT_BROWSER_CONNECTIVITY,
    visibility = DEFAULT_BROWSER_VISIBILITY
}: OfflineOutboxProviderProps) {
    const { serverUrl, user } = useAuth();
    const userId = hasFullAccountAccess(user) ? user?.id : undefined;
    const namespace = useMemo(() => getNamespace(serverUrl, userId), [serverUrl, userId]);
    const [binding, setBinding] = useState<{ namespace: string; outbox: IndexedDbOutbox } | null>(null);
    const [mutations, setMutations] = useState<QueuedMutation[]>([]);
    const [initializationError, setInitializationError] = useState<string | null>(null);
    const retrySchedulerRef = useRef<(result: ReconcileResult) => void>(() => undefined);
    const outbox = binding?.namespace === namespace.value ? binding.outbox : null;

    useEffect(() => {
        let active = true;
        setBinding(null);
        setMutations([]);
        setInitializationError(namespace.error);
        if (!namespace.value) return () => { active = false; };

        void openDatabase().then(async (database) => {
            const nextOutbox = new IndexedDbOutbox(database, namespace.value!);
            await nextOutbox.recoverInterrupted();
            const nextMutations = await nextOutbox.list();
            if (active) {
                setBinding({ namespace: namespace.value!, outbox: nextOutbox });
                setMutations(nextMutations);
            }
        }).catch((error: unknown) => {
            if (active) {
                setInitializationError(
                    error instanceof Error ? error.message : 'Browser offline storage could not be opened.'
                );
            }
        });

        return () => { active = false; };
    }, [namespace.error, namespace.value, openDatabase]);

    const reconciler = useMemo(
        () => outbox ? new OutboxReconciler(outbox, executeMutation) : null,
        [executeMutation, outbox]
    );

    const requireOutbox = useCallback(() => {
        if (outbox) return outbox;
        if (initializationError) throw new Error(initializationError);
        throw new Error('Browser offline storage is unavailable until authentication is ready.');
    }, [initializationError, outbox]);

    const refresh = useCallback(async () => {
        setMutations(await requireOutbox().list());
    }, [requireOutbox]);

    const notifyAfterReplay = useCallback(async (result: ReconcileResult) => {
        if (result.replayed === 0 || !onReplayCompleted) return;
        await onReplayCompleted(result);
    }, [onReplayCompleted]);

    const enqueue = useCallback(async (operation: string, payload: unknown, operationId?: string) => {
        const mutation = await requireOutbox().enqueue({ id: operationId, operation, payload });
        await refresh();
        return mutation;
    }, [refresh, requireOutbox]);

    const reconcile = useCallback(async () => {
        if (!reconciler) throw new Error(initializationError ?? 'Browser offline storage is unavailable until authentication is ready.');
        const scheduleRetry = retrySchedulerRef.current;
        const result = await reconciler.reconcile();
        scheduleRetry(result);
        await notifyAfterReplay(result);
        await refresh();
        return result;
    }, [initializationError, notifyAfterReplay, reconciler, refresh]);

    const retryFailed = useCallback(async (id?: string) => {
        if (!reconciler) throw new Error(initializationError ?? 'Browser offline storage is unavailable until authentication is ready.');
        const scheduleRetry = retrySchedulerRef.current;
        const result = await reconciler.retryFailed(id);
        scheduleRetry(result);
        await notifyAfterReplay(result);
        await refresh();
        return result;
    }, [initializationError, notifyAfterReplay, reconciler, refresh]);

    const discardAll = useCallback(async () => {
        await requireOutbox().clear();
        setMutations([]);
    }, [requireOutbox]);

    useEffect(() => {
        if (!reconciler) return;
        let active = true;
        let isOnline = connectivity.isOnline();
        let isVisible = visibility.isVisible();
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        /** Cancel the single provider-owned deferred replay timer. */
        const clearRetry = () => {
            if (retryTimer !== null) clearTimeout(retryTimer);
            retryTimer = null;
        };
        /** Schedule one eligible retry using the reconciler's bounded backoff. */
        const scheduleRetry = (result: ReconcileResult) => {
            clearRetry();
            if (!active || !isOnline || !isVisible || result.retryAfterMs === null) return;
            retryTimer = setTimeout(() => {
                retryTimer = null;
                if (active && isOnline && isVisible) void replay(false);
            }, result.retryAfterMs);
        };
        /** Reconcile this provider generation and apply retry timing before post-replay work. */
        const replay = async (includeFailures: boolean) => {
            try {
                const result = includeFailures
                    ? await reconciler.retryFailed()
                    : await reconciler.reconcile();
                // Apply retry state before any slower invalidation or queue refresh can reorder completions.
                scheduleRetry(result);
                await notifyAfterReplay(result);
                if (active) setMutations(await requireOutbox().list());
                return result;
            } catch {
                if (active) await refresh().catch(() => undefined);
                return null;
            }
        };
        /** Resume durable failures only while the current tab is both visible and online. */
        const replayIfEligible = () => {
            if (!isOnline || !isVisible) {
                clearRetry();
                return;
            }
            void replay(true);
        };
        retrySchedulerRef.current = scheduleRetry;

        if (isOnline && isVisible) void replay(false);
        const unsubscribeConnectivity = connectivity.subscribe(() => {
            isOnline = connectivity.isOnline();
            replayIfEligible();
        });
        const unsubscribeVisibility = visibility.subscribe(() => {
            isVisible = visibility.isVisible();
            replayIfEligible();
        });
        return () => {
            active = false;
            clearRetry();
            if (retrySchedulerRef.current === scheduleRetry) {
                retrySchedulerRef.current = () => undefined;
            }
            unsubscribeConnectivity();
            unsubscribeVisibility();
        };
    }, [connectivity, notifyAfterReplay, reconciler, refresh, requireOutbox, visibility]);
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
