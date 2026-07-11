import type { OutboxStore } from './outbox';
import type { QueuedMutation } from './queuedMutation';

export type QueuedMutationExecutor = (mutation: QueuedMutation) => Promise<void>;

export type ReconcileResult = {
    replayed: number;
    failedMutation: QueuedMutation | null;
};

function describeReplayError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    return 'Mutation replay failed without an error message.';
}

/** Replays one namespace in insertion order and never runs two reconciliation loops at once. */
export class OutboxReconciler {
    private activeReconciliation: Promise<ReconcileResult> | null = null;

    constructor(
        private readonly outbox: OutboxStore,
        private readonly executeMutation: QueuedMutationExecutor
    ) {}

    reconcile(): Promise<ReconcileResult> {
        if (this.activeReconciliation) return this.activeReconciliation;

        const reconciliation = this.runReconciliation().finally(() => {
            if (this.activeReconciliation === reconciliation) {
                this.activeReconciliation = null;
            }
        });
        this.activeReconciliation = reconciliation;
        return reconciliation;
    }

    async retryFailed(id?: string): Promise<ReconcileResult> {
        await this.outbox.retryFailed(id);
        return this.reconcile();
    }

    private async runReconciliation(): Promise<ReconcileResult> {
        await this.outbox.recoverInterrupted();
        let replayed = 0;

        while (true) {
            const mutation = await this.outbox.claimNext();
            if (!mutation) return { replayed, failedMutation: null };

            try {
                await this.executeMutation(mutation);
                await this.outbox.complete(mutation.id);
                replayed += 1;
            } catch (error) {
                const failedMutation = await this.outbox.fail(mutation.id, describeReplayError(error));
                return { replayed, failedMutation };
            }
        }
    }
}
