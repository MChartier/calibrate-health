import {
    ApiError,
    type CalibrateApiClient,
    type FoodLogCreatePayload,
    type FoodLogUpdatePayload
} from '@calibrate/api-client';
import * as Crypto from 'expo-crypto';
import type { QueuedMutationExecutor } from './reconciler';

export const OFFLINE_MUTATION_OPERATIONS = {
    CREATE_FOOD_LOG: 'food.create',
    UPDATE_FOOD_LOG: 'food.update',
    DELETE_FOOD_LOG: 'food.delete',
    ADD_METRIC: 'metric.add',
    DELETE_METRIC: 'metric.delete',
    UPDATE_FOOD_DAY: 'food-day.update',
    SET_FOOD_DAY_STATUS: 'food-day.set-status',
    START_FOOD_TRACKING_PAUSE: 'food-tracking-pause.start',
    UPDATE_FOOD_TRACKING_PAUSE: 'food-tracking-pause.update',
    RESUME_FOOD_TRACKING: 'food-tracking-pause.resume'
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

function requirePositiveInteger(value: unknown, operation: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new Error(`Queued ${operation} payload is invalid.`);
    }
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
            case OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_LOG: {
                const id = requirePositiveInteger(payload.id, mutation.operation);
                const update = requireRecordPayload(payload.update, mutation.operation) as FoodLogUpdatePayload;
                await api.updateFoodLog(id, update, mutation.id);
                return;
            }
            case OFFLINE_MUTATION_OPERATIONS.DELETE_FOOD_LOG:
                await api.deleteFoodLog(requirePositiveInteger(payload.id, mutation.operation), mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.ADD_METRIC:
                if (typeof payload.weight !== 'number' || typeof payload.date !== 'string') {
                    throw new Error('Queued metric.add payload is invalid.');
                }
                await api.addMetric({ weight: payload.weight, date: payload.date }, mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.DELETE_METRIC:
                await api.deleteMetric(requirePositiveInteger(payload.id, mutation.operation), mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_DAY:
                if (typeof payload.date !== 'string' || typeof payload.is_complete !== 'boolean') {
                    throw new Error('Queued food-day.update payload is invalid.');
                }
                await api.updateFoodDay({ date: payload.date, is_complete: payload.is_complete }, mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.SET_FOOD_DAY_STATUS:
                if (
                    typeof payload.date !== 'string' ||
                    (payload.status !== 'OPEN' && payload.status !== 'COMPLETE' && payload.status !== 'INCOMPLETE')
                ) {
                    throw new Error('Queued food-day.set-status payload is invalid.');
                }
                await api.setFoodDayStatus({ date: payload.date, status: payload.status }, mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.START_FOOD_TRACKING_PAUSE:
                if (
                    typeof payload.starts_on !== 'string' ||
                    !(payload.expected_resume_on === null || typeof payload.expected_resume_on === 'string')
                ) {
                    throw new Error('Queued food-tracking-pause.start payload is invalid.');
                }
                await api.startFoodTrackingPause({
                    starts_on: payload.starts_on,
                    expected_resume_on: payload.expected_resume_on
                }, mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_TRACKING_PAUSE:
                if (!(payload.expected_resume_on === null || typeof payload.expected_resume_on === 'string')) {
                    throw new Error('Queued food-tracking-pause.update payload is invalid.');
                }
                await api.updateFoodTrackingPause({
                    expected_resume_on: payload.expected_resume_on
                }, mutation.id);
                return;
            case OFFLINE_MUTATION_OPERATIONS.RESUME_FOOD_TRACKING:
                if (typeof payload.resumed_on !== 'string') {
                    throw new Error('Queued food-tracking-pause.resume payload is invalid.');
                }
                await api.resumeFoodTracking({ resumed_on: payload.resumed_on }, mutation.id);
                return;
            default:
                throw new Error(`Unsupported queued mutation operation: ${mutation.operation}`);
        }
    };
}
