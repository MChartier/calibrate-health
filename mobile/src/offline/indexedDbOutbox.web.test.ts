import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbOutbox, openIndexedDbOutboxDatabase } from './indexedDbOutbox.web';
import { OUTBOX_MUTATION_STATES } from './queuedMutation';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'generated-operation-id') }));

const FIRST_NAMESPACE = 'https://health.example::user:7';
const SECOND_NAMESPACE = 'https://health.example::user:9';

describe('IndexedDbOutbox', () => {
    let factory: IDBFactory;
    let database: IDBDatabase;

    beforeEach(async () => {
        factory = new IDBFactory();
        database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'test-outbox' });
    });

    afterEach(() => database.close());

    it('persists all supported write shapes in insertion order with stable operation IDs', async () => {
        const outbox = new IndexedDbOutbox(database, FIRST_NAMESPACE, () => 'unused', () => 100);
        const writes = [
            ['food.create', { date: '2026-07-18', calories: 400 }],
            ['food.update', { id: 2, update: { calories: 425 } }],
            ['food.delete', { id: 3 }],
            ['metric.add', { date: '2026-07-18', weight: 88.2 }],
            ['metric.delete', { id: 4 }],
            ['food-day.update', { date: '2026-07-18', is_complete: true }]
        ] as const;

        for (const [index, [operation, payload]] of writes.entries()) {
            const id = `operation-${index + 1}`;
            await outbox.enqueue({ id, operation, payload });
        }

        database.close();
        database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'test-outbox' });
        const restored = await new IndexedDbOutbox(database, FIRST_NAMESPACE).list();
        expect(restored.map(({ id, operation, payload, state }) => ({ id, operation, payload, state }))).toEqual(
            writes.map(([operation, payload], index) => ({
                id: `operation-${index + 1}`,
                operation,
                payload,
                state: OUTBOX_MUTATION_STATES.PENDING
            }))
        );
        expect(restored.map((mutation) => mutation.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('preserves the durable failure barrier and retry attempt state', async () => {
        let now = 100;
        const outbox = new IndexedDbOutbox(database, FIRST_NAMESPACE, () => 'unused', () => now++);
        await outbox.enqueue({ id: 'first', operation: 'food.create', payload: { calories: 100 } });
        await outbox.enqueue({ id: 'second', operation: 'food.delete', payload: { id: 5 } });

        const claimed = await outbox.claimNext();
        expect(claimed).toEqual(expect.objectContaining({ id: 'first', state: 'replaying', attemptCount: 1 }));
        await outbox.fail('first', 'server unavailable');
        await expect(outbox.claimNext()).resolves.toBeNull();
        expect(await outbox.list()).toEqual([
            expect.objectContaining({ id: 'first', state: 'failed', attemptCount: 1, lastError: 'server unavailable' }),
            expect.objectContaining({ id: 'second', state: 'pending', attemptCount: 0 })
        ]);

        await outbox.retryFailed('first');
        await expect(outbox.claimNext()).resolves.toEqual(expect.objectContaining({ id: 'first', attemptCount: 2 }));
        await outbox.complete('first');
        await expect(outbox.claimNext()).resolves.toEqual(expect.objectContaining({ id: 'second', attemptCount: 1 }));
    });

    it('recovers an interrupted replay after restart without changing its operation ID', async () => {
        const outbox = new IndexedDbOutbox(database, FIRST_NAMESPACE, () => 'stable-id', () => 100);
        await outbox.enqueue({ operation: 'metric.add', payload: { date: '2026-07-18', weight: 88 } });
        await outbox.claimNext();

        database.close();
        database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'test-outbox' });
        const restored = new IndexedDbOutbox(database, FIRST_NAMESPACE, () => 'different-id', () => 200);
        await restored.recoverInterrupted();
        await expect(restored.list()).resolves.toEqual([
            expect.objectContaining({ id: 'stable-id', state: 'pending', attemptCount: 1, updatedAt: 200 })
        ]);
    });

    it('isolates account namespaces and clears only the selected account', async () => {
        const first = new IndexedDbOutbox(database, FIRST_NAMESPACE);
        const second = new IndexedDbOutbox(database, SECOND_NAMESPACE);
        await first.enqueue({ id: 'shared-operation-id', operation: 'food.create', payload: { calories: 100 } });
        await second.enqueue({ id: 'shared-operation-id', operation: 'food.create', payload: { calories: 200 } });

        expect((await first.list())[0]).toEqual(expect.objectContaining({ payload: { calories: 100 } }));
        expect((await second.list())[0]).toEqual(expect.objectContaining({ payload: { calories: 200 } }));
        await first.clear();
        await expect(first.list()).resolves.toEqual([]);
        await expect(second.list()).resolves.toHaveLength(1);
    });

    it('returns an honest error when IndexedDB is unavailable', async () => {
        await expect(openIndexedDbOutboxDatabase({ factory: null }))
            .rejects.toThrow('Browser offline storage is unavailable: IndexedDB is not supported.');
    });
});
