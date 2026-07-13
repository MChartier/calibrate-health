import type { OutboxStore } from './outbox';
import { OutboxReconciler } from './reconciler';
import {
    OUTBOX_MUTATION_STATES,
    parseMutationPayload,
    serializeMutationPayload,
    type NewQueuedMutation,
    type QueuedMutation
} from './queuedMutation';

class MemoryOutbox implements OutboxStore {
    mutations: QueuedMutation[] = [];
    private nextSequence = 1;

    async enqueue(mutation: NewQueuedMutation): Promise<QueuedMutation> {
        const sequence = this.nextSequence++;
        const queued: QueuedMutation = {
            ...mutation,
            payload: parseMutationPayload(serializeMutationPayload(mutation.payload)),
            sequence,
            id: `mutation-${sequence}`,
            namespace: 'test::user:1',
            state: OUTBOX_MUTATION_STATES.PENDING,
            attemptCount: 0,
            lastError: null,
            createdAt: sequence,
            updatedAt: sequence
        };
        this.mutations.push(queued);
        return queued;
    }

    async list(): Promise<QueuedMutation[]> {
        return [...this.mutations];
    }

    async claimNext(): Promise<QueuedMutation | null> {
        const next = this.mutations[0];
        if (!next || next.state !== OUTBOX_MUTATION_STATES.PENDING) return null;
        next.state = OUTBOX_MUTATION_STATES.REPLAYING;
        next.attemptCount += 1;
        next.lastError = null;
        return { ...next };
    }

    async complete(id: string): Promise<void> {
        this.mutations = this.mutations.filter((mutation) => mutation.id !== id);
    }

    async fail(id: string, error: string): Promise<QueuedMutation> {
        const mutation = this.requireMutation(id);
        mutation.state = OUTBOX_MUTATION_STATES.FAILED;
        mutation.lastError = error;
        return { ...mutation };
    }

    async recoverInterrupted(): Promise<void> {
        this.mutations.forEach((mutation) => {
            if (mutation.state === OUTBOX_MUTATION_STATES.REPLAYING) {
                mutation.state = OUTBOX_MUTATION_STATES.PENDING;
            }
        });
    }

    async retryFailed(id?: string): Promise<void> {
        this.mutations.forEach((mutation) => {
            if (mutation.state === OUTBOX_MUTATION_STATES.FAILED && (!id || mutation.id === id)) {
                mutation.state = OUTBOX_MUTATION_STATES.PENDING;
                mutation.lastError = null;
            }
        });
    }

    async clear(): Promise<void> {
        this.mutations = [];
    }

    private requireMutation(id: string): QueuedMutation {
        const mutation = this.mutations.find((candidate) => candidate.id === id);
        if (!mutation) throw new Error(`Unknown mutation ${id}`);
        return mutation;
    }
}

describe('OutboxReconciler', () => {
    it('replays queued writes serially in insertion order', async () => {
        const outbox = new MemoryOutbox();
        await outbox.enqueue({ operation: 'food.create', payload: { value: 1 } });
        await outbox.enqueue({ operation: 'weight.create', payload: { value: 2 } });
        const events: string[] = [];
        let activeExecutions = 0;

        const reconciler = new OutboxReconciler(outbox, async (mutation) => {
            activeExecutions += 1;
            expect(activeExecutions).toBe(1);
            events.push(mutation.operation);
            await Promise.resolve();
            activeExecutions -= 1;
        });

        await expect(reconciler.reconcile()).resolves.toEqual({ replayed: 2, failedMutation: null });
        expect(events).toEqual(['food.create', 'weight.create']);
        expect(outbox.mutations).toEqual([]);
    });

    it('persists the first failure and does not reorder later writes past it', async () => {
        const outbox = new MemoryOutbox();
        const failed = await outbox.enqueue({ operation: 'food.create', payload: {} });
        const later = await outbox.enqueue({ operation: 'food.delete', payload: { id: 3 } });
        const reconciler = new OutboxReconciler(outbox, async () => {
            throw new Error('server unavailable');
        });

        const result = await reconciler.reconcile();

        expect(result.replayed).toBe(0);
        expect(result.failedMutation).toEqual(expect.objectContaining({
            id: failed.id,
            state: 'failed',
            attemptCount: 1,
            lastError: 'server unavailable'
        }));
        expect(outbox.mutations).toEqual([
            expect.objectContaining({ id: failed.id, state: 'failed', lastError: 'server unavailable' }),
            expect.objectContaining({ id: later.id, state: 'pending', attemptCount: 0 })
        ]);

        await reconciler.reconcile();
        expect(outbox.mutations[1]).toEqual(expect.objectContaining({ id: later.id, state: 'pending' }));
    });

    it('coalesces concurrent reconciliation requests into one replay loop', async () => {
        const outbox = new MemoryOutbox();
        await outbox.enqueue({ operation: 'weight.create', payload: { weight: 80 } });
        let releaseExecution!: () => void;
        const executionGate = new Promise<void>((resolve) => { releaseExecution = resolve; });
        const executor = jest.fn(async () => executionGate);
        const reconciler = new OutboxReconciler(outbox, executor);

        const first = reconciler.reconcile();
        const second = reconciler.reconcile();
        expect(second).toBe(first);
        releaseExecution();

        await expect(first).resolves.toEqual({ replayed: 1, failedMutation: null });
        expect(executor).toHaveBeenCalledTimes(1);
    });

    it('retries durable failures explicitly before continuing the queue', async () => {
        const outbox = new MemoryOutbox();
        const first = await outbox.enqueue({ operation: 'food.create', payload: {} });
        await outbox.enqueue({ operation: 'food.delete', payload: {} });
        let shouldFail = true;
        const executor = jest.fn(async () => {
            if (shouldFail) throw new Error('offline');
        });
        const reconciler = new OutboxReconciler(outbox, executor);
        await reconciler.reconcile();

        shouldFail = false;
        await expect(reconciler.retryFailed(first.id)).resolves.toEqual({ replayed: 2, failedMutation: null });
        expect(outbox.mutations).toEqual([]);
    });
});
