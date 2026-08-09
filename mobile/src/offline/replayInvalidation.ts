import type { QueryClient } from '@tanstack/react-query';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';
import { OFFLINE_MUTATION_OPERATIONS } from './operations';
import { isCalibrationEvidenceMutationOperation } from './pendingCalibrationEvidence';
import type { ReconcileResult } from './reconciler';

const ONBOARDING_REPLAY_QUERY_KEYS = [
    ['mobile-onboarding-draft'],
    ['mobile-profile'],
    ['mobile-goal'],
    ['mobile-metrics'],
    ['mobile-metrics-trend']
] as const;

const METRIC_REPLAY_QUERY_KEYS = [
    ['mobile-metrics'],
    ['mobile-metrics-trend'],
    ['mobile-profile'],
    ['mobile-goal'],
    ['mobile-in-app-notifications'],
    calibrationStatusQueryKey
] as const;

/** Refresh every surface whose server-owned state may change after a queued weigh-in replays. */
export async function invalidateQueriesAfterOfflineReplay(
    queryClient: Pick<QueryClient, 'invalidateQueries'>,
    result: ReconcileResult
): Promise<void> {
    const replayedOnboardingCompletion = result.replayedOperations.includes(
        OFFLINE_MUTATION_OPERATIONS.COMPLETE_ONBOARDING
    );
    const replayedMetricMutation = result.replayedOperations.some((operation) =>
        operation === OFFLINE_MUTATION_OPERATIONS.ADD_METRIC ||
        operation === OFFLINE_MUTATION_OPERATIONS.DELETE_METRIC
    );
    const replayedEvidenceMutation = result.replayedOperations.some(isCalibrationEvidenceMutationOperation);
    const queryKeys: Array<readonly unknown[]> = [];
    if (replayedOnboardingCompletion) queryKeys.push(...ONBOARDING_REPLAY_QUERY_KEYS);
    if (replayedEvidenceMutation) {
        queryKeys.push(...(replayedMetricMutation
            ? METRIC_REPLAY_QUERY_KEYS
            : [calibrationStatusQueryKey]));
    }
    if (queryKeys.length === 0) return;

    await Promise.all(queryKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey: [...queryKey] })
    ));
}
