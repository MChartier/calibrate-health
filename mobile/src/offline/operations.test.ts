import { ApiError, type CalibrateApiClient } from '@calibrate/api-client';
import {
    createQueuedMutationExecutor,
    executeOrQueueMutation,
    isRetryableMutationError,
    OFFLINE_MUTATION_OPERATIONS
} from './operations';
import { OUTBOX_MUTATION_STATES, type QueuedMutation } from './queuedMutation';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'generated-operation-id') }));

function queuedMutation(operation: string, payload: QueuedMutation['payload']): QueuedMutation {
    return {
        sequence: 1,
        id: 'stable-operation-id',
        namespace: 'https://health.example::user:1',
        operation,
        payload,
        state: OUTBOX_MUTATION_STATES.REPLAYING,
        attemptCount: 1,
        lastError: null,
        createdAt: 1,
        updatedAt: 2
    };
}

describe('retryable mutation classification', () => {
    it.each([408, 429, 500, 503])('retries transient HTTP status %i', (status) => {
        expect(isRetryableMutationError(new ApiError('temporary', status, null))).toBe(true);
    });

    it.each([400, 401, 403, 404, 409, 422])('does not queue validation/auth HTTP status %i', (status) => {
        expect(isRetryableMutationError(new ApiError('request rejected', status, null))).toBe(false);
    });

    it('retries fetch transport failures and API timeouts only', () => {
        expect(isRetryableMutationError(new TypeError('Network request failed'))).toBe(true);
        expect(isRetryableMutationError(new Error(
            'Request timed out while connecting to https://health.example. Check the server URL and network access.'
        ))).toBe(true);
        expect(isRetryableMutationError(new Error('Invalid local state'))).toBe(false);
        expect(isRetryableMutationError(Object.assign(new Error('cancelled'), { name: 'AbortError' }))).toBe(false);
    });
});

describe('executeOrQueueMutation', () => {
    it('uses the same operation ID for the uncertain direct attempt and queued replay', async () => {
        const execute = jest.fn(async () => { throw new TypeError('Network request failed'); });
        const enqueue = jest.fn(async () => undefined);
        const payload = { date: '2026-07-11', weight: 82.5 };

        await expect(executeOrQueueMutation({
            operation: OFFLINE_MUTATION_OPERATIONS.ADD_METRIC,
            payload,
            execute,
            enqueue,
            createOperationId: () => 'stable-operation-id'
        })).resolves.toEqual({ disposition: 'queued', operationId: 'stable-operation-id' });

        expect(execute).toHaveBeenCalledWith('stable-operation-id');
        expect(enqueue).toHaveBeenCalledWith(
            OFFLINE_MUTATION_OPERATIONS.ADD_METRIC,
            payload,
            'stable-operation-id'
        );
    });

    it('does not queue successful or rejected validation requests', async () => {
        const enqueue = jest.fn(async () => undefined);
        await expect(executeOrQueueMutation({
            operation: OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_DAY,
            payload: { date: '2026-07-11', is_complete: true },
            execute: async () => 'saved',
            enqueue,
            createOperationId: () => 'success-id'
        })).resolves.toEqual({ disposition: 'synced', operationId: 'success-id', value: 'saved' });

        const validationError = new ApiError('invalid', 422, null);
        await expect(executeOrQueueMutation({
            operation: OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_DAY,
            payload: {},
            execute: async () => { throw validationError; },
            enqueue,
            createOperationId: () => 'validation-id'
        })).rejects.toBe(validationError);
        expect(enqueue).not.toHaveBeenCalled();
    });
});

describe('createQueuedMutationExecutor', () => {
    it('replays all supported operations with the persisted operation ID', async () => {
        const api = {
            createFoodLog: jest.fn(async () => undefined),
            addMetric: jest.fn(async () => undefined),
            updateFoodDay: jest.fn(async () => undefined)
        } as unknown as CalibrateApiClient;
        const execute = createQueuedMutationExecutor(api);

        await execute(queuedMutation(OFFLINE_MUTATION_OPERATIONS.CREATE_FOOD_LOG, {
            date: '2026-07-11', meal_period: 'DINNER', name: 'Dinner', calories: 600
        }));
        await execute(queuedMutation(OFFLINE_MUTATION_OPERATIONS.ADD_METRIC, {
            date: '2026-07-11', weight: 82.5
        }));
        await execute(queuedMutation(OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_DAY, {
            date: '2026-07-11', is_complete: true
        }));

        expect(api.createFoodLog).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dinner' }), 'stable-operation-id');
        expect(api.addMetric).toHaveBeenCalledWith({ date: '2026-07-11', weight: 82.5 }, 'stable-operation-id');
        expect(api.updateFoodDay).toHaveBeenCalledWith(
            { date: '2026-07-11', is_complete: true },
            'stable-operation-id'
        );
    });

    it('fails unsupported or corrupt durable operations instead of dropping them', async () => {
        const execute = createQueuedMutationExecutor({} as CalibrateApiClient);
        await expect(execute(queuedMutation('unknown.operation', {}))).rejects.toThrow('Unsupported');
        await expect(execute(queuedMutation(OFFLINE_MUTATION_OPERATIONS.ADD_METRIC, { weight: 'bad' })))
            .rejects.toThrow('metric.add payload is invalid');
    });
});
