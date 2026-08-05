import type { QueryClient } from '@tanstack/react-query';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';
import { OFFLINE_MUTATION_OPERATIONS } from './operations';
import type { ReconcileResult } from './reconciler';

const METRIC_REPLAY_QUERY_KEYS = [
    ['mobile-metrics'],
    ['mobile-metrics-trend'],
    ['mobile-profile'],
    ['mobile-in-app-notifications'],
    calibrationStatusQueryKey
] as const;

/** Refresh every surface whose server-owned state may change after a queued weigh-in replays. */
export async function invalidateQueriesAfterOfflineReplay(
    queryClient: Pick<QueryClient, 'invalidateQueries'>,
    result: ReconcileResult
): Promise<void> {
    const replayedMetricMutation = result.replayedOperations.some((operation) =>
        operation === OFFLINE_MUTATION_OPERATIONS.ADD_METRIC ||
        operation === OFFLINE_MUTATION_OPERATIONS.DELETE_METRIC
    );
    if (!replayedMetricMutation) return;

    await Promise.all(METRIC_REPLAY_QUERY_KEYS.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey: [...queryKey] })
    ));
}
