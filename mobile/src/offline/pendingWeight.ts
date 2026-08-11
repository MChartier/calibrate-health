/**
 * Provides Expo client behavior for pending weight.
 */
import { OFFLINE_MUTATION_OPERATIONS } from './operations';
import type { QueuedMutation } from './queuedMutation';

/** Check whether the current state has pending weight mutation. */
export function hasPendingWeightMutation(
    mutations: ReadonlyArray<Pick<QueuedMutation, 'operation'>>
): boolean {
    return mutations.some(({ operation }) =>
        operation === OFFLINE_MUTATION_OPERATIONS.ADD_METRIC ||
        operation === OFFLINE_MUTATION_OPERATIONS.DELETE_METRIC
    );
}
