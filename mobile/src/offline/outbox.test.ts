import type { OutboxDatabase } from './database';
import { SqliteOutbox } from './outbox';
import { OUTBOX_MUTATION_STATES, type OutboxMutationState } from './queuedMutation';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'mock-operation-id') }));

type TestRow = {
    sequence: number;
    id: string;
    namespace: string;
    operation: string;
    payload_json: string;
    state: OutboxMutationState;
    attempt_count: number;
    last_error: string | null;
    created_at: number;
    updated_at: number;
};

function row(overrides: Partial<TestRow> = {}): TestRow {
    return {
        sequence: 1,
        id: 'operation-1',
        namespace: 'https://health.example::user:7',
        operation: 'food.create',
        payload_json: '{"calories":400}',
        state: OUTBOX_MUTATION_STATES.PENDING,
        attempt_count: 0,
        last_error: null,
        created_at: 100,
        updated_at: 100,
        ...overrides
    };
}

function databaseMock(overrides: Partial<OutboxDatabase> = {}): OutboxDatabase {
    return {
        execAsync: jest.fn(async () => undefined),
        getAllAsync: jest.fn(async () => []),
        getFirstAsync: jest.fn(async () => null),
        runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
        withExclusiveTransactionAsync: jest.fn(async () => undefined),
        ...overrides
    } as OutboxDatabase;
}

describe('SqliteOutbox', () => {
    const namespace = 'https://health.example::user:7';

    it('persists the authenticated namespace with the serialized payload', async () => {
        const createdRow = row();
        const database = databaseMock({
            getFirstAsync: jest.fn(async () => createdRow)
        });
        const outbox = new SqliteOutbox(database, namespace, () => createdRow.id, () => 100);

        await expect(outbox.enqueue({
            operation: 'food.create',
            payload: { calories: 400 }
        })).resolves.toEqual(expect.objectContaining({
            id: createdRow.id,
            namespace,
            payload: { calories: 400 }
        }));

        expect(database.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO queued_mutations'), [
            createdRow.id,
            namespace,
            'food.create',
            '{"calories":400}',
            OUTBOX_MUTATION_STATES.PENDING,
            100,
            100
        ]);
    });

    it('claims the oldest pending mutation and records its replay attempt atomically', async () => {
        const transaction = databaseMock({
            getFirstAsync: jest.fn(async () => row()),
            runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 }))
        });
        const database = databaseMock({
            withExclusiveTransactionAsync: jest.fn(async (task) => task(transaction as never))
        });
        const outbox = new SqliteOutbox(database, namespace, () => 'unused', () => 200);

        await expect(outbox.claimNext()).resolves.toEqual(expect.objectContaining({
            id: 'operation-1',
            state: OUTBOX_MUTATION_STATES.REPLAYING,
            attemptCount: 1,
            updatedAt: 200
        }));
        expect(transaction.runAsync).toHaveBeenCalledWith(expect.stringContaining('attempt_count = attempt_count + 1'), [
            OUTBOX_MUTATION_STATES.REPLAYING,
            200,
            'operation-1',
            namespace,
            OUTBOX_MUTATION_STATES.PENDING
        ]);
    });

    it('treats the oldest durable failure as a barrier to later pending writes', async () => {
        const transaction = databaseMock({
            getFirstAsync: jest.fn(async () => row({ state: OUTBOX_MUTATION_STATES.FAILED }))
        });
        const database = databaseMock({
            withExclusiveTransactionAsync: jest.fn(async (task) => task(transaction as never))
        });
        const outbox = new SqliteOutbox(database, namespace);

        await expect(outbox.claimNext()).resolves.toBeNull();
        expect(transaction.runAsync).not.toHaveBeenCalled();
    });

    it('clears only the authenticated namespace during account deletion', async () => {
        const database = databaseMock();
        const outbox = new SqliteOutbox(database, namespace);

        await outbox.clear();

        expect(database.runAsync).toHaveBeenCalledWith(
            'DELETE FROM queued_mutations WHERE namespace = ?',
            [namespace]
        );
    });
});
