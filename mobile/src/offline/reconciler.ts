import type { OutboxStore } from './outbox';
import type { QueuedMutation } from './queuedMutation';
import { isRetryableMutationError } from './retryability';

export type QueuedMutationExecutor = (mutation: QueuedMutation) => Promise<void>;

export const OUTBOX_RETRY_BASE_DELAY_MS = 1_000;
export const OUTBOX_RETRY_MAX_DELAY_MS = 30_000;

export type ReconcileResult = {
    replayed: number;
    replayedOperations: string[];
    failedMutation: QueuedMutation | null;
    deferredMutation: QueuedMutation | null;
    retryAfterMs: number | null;
};

/** Calculate a capped exponential delay for a retryable replay attempt. */
export function getOutboxRetryDelayMs(attemptCount: number): number {
    const normalizedAttemptCount = Number.isSafeInteger(attemptCount) && attemptCount > 0 ? attemptCount : 1;
    const exponent = Math.min(normalizedAttemptCount - 1, 10);
    return Math.min(OUTBOX_RETRY_MAX_DELAY_MS, OUTBOX_RETRY_BASE_DELAY_MS * (2 ** exponent));
}

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
        const replayedOperations: string[] = [];

        while (true) {
            const mutation = await this.outbox.claimNext();
            if (!mutation) {
                return {
                    replayed,
                    replayedOperations,
                    failedMutation: null,
                    deferredMutation: null,
                    retryAfterMs: null
                };
            }

            try {
                await this.executeMutation(mutation);
                await this.outbox.complete(mutation.id);
                replayed += 1;
                replayedOperations.push(mutation.operation);
            } catch (error) {
                if (isRetryableMutationError(error)) {
                    const deferredMutation = await this.outbox.defer(mutation.id, describeReplayError(error));
                    return {
                        replayed,
                        replayedOperations,
                        failedMutation: null,
                        deferredMutation,
                        retryAfterMs: getOutboxRetryDelayMs(deferredMutation.attemptCount)
                    };
                }
                const failedMutation = await this.outbox.fail(mutation.id, describeReplayError(error));
                return {
                    replayed,
                    replayedOperations,
                    failedMutation,
                    deferredMutation: null,
                    retryAfterMs: null
                };
            }
        }
    }
}
