import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
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

type OfflineOutboxProviderProps = {
    children: React.ReactNode;
    executeMutation: QueuedMutationExecutor;
    openDatabase?: () => Promise<IDBDatabase>;
    connectivity?: BrowserConnectivity;
};

const OfflineOutboxContext = createContext<OfflineOutboxContextValue | null>(null);

const DEFAULT_BROWSER_CONNECTIVITY: BrowserConnectivity = {
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
    subscribe: (listener) => {
        if (typeof window === 'undefined') return () => undefined;
        window.addEventListener('online', listener);
        return () => window.removeEventListener('online', listener);
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
    openDatabase = openBrowserOutboxDatabase,
    connectivity = DEFAULT_BROWSER_CONNECTIVITY
}: OfflineOutboxProviderProps) {
    const { serverUrl, user } = useAuth();
    const namespace = useMemo(() => getNamespace(serverUrl, user?.id), [serverUrl, user?.id]);
    const [binding, setBinding] = useState<{ namespace: string; outbox: IndexedDbOutbox } | null>(null);
    const [mutations, setMutations] = useState<QueuedMutation[]>([]);
    const [initializationError, setInitializationError] = useState<string | null>(null);
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

    const enqueue = useCallback(async (operation: string, payload: unknown, operationId?: string) => {
        const mutation = await requireOutbox().enqueue({ id: operationId, operation, payload });
        await refresh();
        return mutation;
    }, [refresh, requireOutbox]);

    const reconcile = useCallback(async () => {
        if (!reconciler) throw new Error(initializationError ?? 'Browser offline storage is unavailable until authentication is ready.');
        const result = await reconciler.reconcile();
        await refresh();
        return result;
    }, [initializationError, reconciler, refresh]);

    const retryFailed = useCallback(async (id?: string) => {
        if (!reconciler) throw new Error(initializationError ?? 'Browser offline storage is unavailable until authentication is ready.');
        const result = await reconciler.retryFailed(id);
        await refresh();
        return result;
    }, [initializationError, reconciler, refresh]);

    const discardAll = useCallback(async () => {
        await requireOutbox().clear();
        setMutations([]);
    }, [requireOutbox]);

    useEffect(() => {
        if (!reconciler) return;
        let active = true;
        const replay = async (includeFailures: boolean) => {
            try {
                const result = includeFailures
                    ? await reconciler.retryFailed()
                    : await reconciler.reconcile();
                if (active) setMutations(await requireOutbox().list());
                return result;
            } catch {
                if (active) await refresh().catch(() => undefined);
                return null;
            }
        };

        if (connectivity.isOnline()) void replay(false);
        const unsubscribe = connectivity.subscribe(() => { void replay(true); });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [connectivity, reconciler, refresh, requireOutbox]);

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
