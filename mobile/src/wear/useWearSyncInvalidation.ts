import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { flushWearSyncInvalidation, queueWearSyncInvalidation } from './syncInvalidation';

function wasQueuedOffline(value: unknown): boolean {
    return Boolean(value && typeof value === 'object' && (value as { disposition?: unknown }).disposition === 'queued');
}

/** Notify only the exact paired node after committed phone mutations and retry durable sends on foreground. */
export function useWearSyncInvalidation(): void {
    const queryClient = useQueryClient();
    const { serverUrl, user } = useAuth();

    useEffect(() => {
        if (!user) return;
        let active = true;
        const notify = () => {
            if (!active) return;
            void queueWearSyncInvalidation({ serverOrigin: serverUrl, userId: user.id });
        };
        const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
            if (
                event.type === 'updated'
                && event.action.type === 'success'
                && !wasQueuedOffline(event.mutation.state.data)
            ) notify();
        });
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void flushWearSyncInvalidation({ serverOrigin: serverUrl, userId: user.id });
            }
        });
        void flushWearSyncInvalidation({ serverOrigin: serverUrl, userId: user.id });
        return () => {
            active = false;
            unsubscribe();
            subscription.remove();
        };
    }, [queryClient, serverUrl, user]);
}
