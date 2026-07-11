import { ApiError, type CalibrateApiClient, type FoodLogCreatePayload } from '@calibrate/api-client';
import * as Crypto from 'expo-crypto';
import type { QueuedMutationExecutor } from './reconciler';

export const OFFLINE_MUTATION_OPERATIONS = {
    CREATE_FOOD_LOG: 'food.create',
    ADD_METRIC: 'metric.add',
    UPDATE_FOOD_DAY: 'food-day.update'
} as const;

export type OfflineMutationOperation =
    typeof OFFLINE_MUTATION_OPERATIONS[keyof typeof OFFLINE_MUTATION_OPERATIONS];

export type OutboxMutationResult<T> =
    | { disposition: 'synced'; operationId: string; value: T }
    | { disposition: 'queued'; operationId: string };

type ExecuteOrQueueOptions<T> = {
    operation: OfflineMutationOperation;
    payload: unknown;
    execute: (operationId: string) => Promise<T>;
    enqueue: (operation: string, payload: unknown, operationId?: string) => Promise<unknown>;
    createOperationId?: () => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecordPayload(value: unknown, operation: string): Record<string, unknown> {
    if (!isRecord(value)) throw new Error(`Queued ${operation} payload is invalid.`);
    return value;
}

/** HTTP validation/auth failures must return to the caller instead of masquerading as offline writes. */
export function isRetryableMutationError(error: unknown): boolean {
    if (error instanceof ApiError) {
        return error.status === 408 || error.status === 429 || error.status >= 500;
    }
    if (error instanceof TypeError) return true;
    if (!(error instanceof Error)) return false;
    return error.message.startsWith('Request timed out while connecting to ');
}

/** Uses one operation ID for the uncertain direct attempt and every later replay. */
export async function executeOrQueueMutation<T>({
    operation,
    payload,
    execute,
    enqueue,
    createOperationId = Crypto.randomUUID
}: ExecuteOrQueueOptions<T>): Promise<OutboxMutationResult<T>> {
    const operationId = createOperationId();
    try {
        return { disposition: 'synced', operationId, value: await execute(operationId) };
    } catch (error) {
        if (!isRetryableMutationError(error)) throw error;
        await enqueue(operation, payload, operationId);
        return { disposition: 'queued', operationId };
    }
}

/** Maps durable operation names back to the idempotent API methods used for replay. */
export function createQueuedMutationExecutor(api: CalibrateApiClient): QueuedMutationExecutor {
    return async (mutation) => {
        const payload = requireRecordPayload(mutation.payload, mutation.operation);
        switch (mutation.operation) {
            case OFFLINE_MUTATION_OPERATIONS.CREATE_FOOD_LOG:
                await api.createFoodLog(payload as FoodLogCreatePayload, mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.ADD_METRIC:
                if (typeof payload.weight !== 'number' || typeof payload.date !== 'string') {
                    throw new Error('Queued metric.add payload is invalid.');
                }
                await api.addMetric({ weight: payload.weight, date: payload.date }, mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_DAY:
                if (typeof payload.date !== 'string' || typeof payload.is_complete !== 'boolean') {
                    throw new Error('Queued food-day.update payload is invalid.');
                }
                await api.updateFoodDay({ date: payload.date, is_complete: payload.is_complete }, mutation.id);
                return;
            default:
                throw new Error(`Unsupported queued mutation operation: ${mutation.operation}`);
        }
    };
}
