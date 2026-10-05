import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FoodLogEntry, MetricEntry } from '@calibrate/api-client';
import { useAuth } from '../auth/AuthContext';
import { useOfflineOutbox } from './provider';
import { createOutboxNamespace, type QueuedMutation } from './queuedMutation';
const EMPTY: QueuedMutation[] = [];
export function useScopedTrackingMutations() {
    const { serverUrl, user } = useAuth();
    const { mutations = EMPTY } = useOfflineOutbox();
    const namespace = serverUrl && user ? createOutboxNamespace(serverUrl, user.id) : null;
    return useMemo(() => mutations.filter(mutation => mutation.namespace === namespace), [mutations, namespace]);
}
import { projectFood, projectMetrics } from './trackingProjection';

export function useTrackingFood(date: string) {
    const { api } = useAuth();
    const mutations = useScopedTrackingMutations();
    const pending = mutations.some(m => m.operation.startsWith('food.'));
    const queryClient = useQueryClient();
    useEffect(() => { if (pending) void queryClient.cancelQueries({ queryKey: ['mobile-food', date] }); }, [pending, queryClient, date]);
    const query = useQuery({ queryKey: ['mobile-food', date], queryFn: () => pending ? Promise.resolve(queryClient.getQueryData<FoodLogEntry[]>(['mobile-food', date]) ?? []) : api.getFoodLog(date), enabled: !pending });
    const data = useMemo(() => projectFood(query.data, mutations, date), [query.data, mutations, date]);
    return { ...query, data, ...(data ? { isPending: false, isLoading: false, dataUpdatedAt: Math.max(1, query.dataUpdatedAt) } : {}) };
}

export function useTrackingMetrics(enabled = true) {
    const { api } = useAuth();
    const mutations = useScopedTrackingMutations();
    const pending = mutations.some(m => m.operation.startsWith('metric.'));
    const queryClient = useQueryClient();
    useEffect(() => { if (pending) void queryClient.cancelQueries({ queryKey: ['mobile-metrics'] }); }, [pending, queryClient]);
    const query = useQuery({ queryKey: ['mobile-metrics'], queryFn: () => pending ? Promise.resolve(queryClient.getQueryData<MetricEntry[]>(['mobile-metrics']) ?? []) : api.getMetrics(), enabled: enabled && !pending });
    const data = useMemo(() => projectMetrics(query.data, mutations), [query.data, mutations]);
    return { ...query, data, ...(data ? { isPending: false, isLoading: false, dataUpdatedAt: Math.max(1, query.dataUpdatedAt) } : {}) };
}
