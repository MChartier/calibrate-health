import { withMutationLock } from './mutationLock';
import type { QueuedMutation } from './queuedMutation';

type Enqueue = (operation: string, payload: unknown, operationId?: string) => Promise<unknown>;
export type OutboxDispatch = <T>(work: (enqueue: Enqueue, mustQueue: boolean, pending: readonly QueuedMutation[]) => Promise<T>) => Promise<T>;

/** Read durable state under the same lock used by all direct attempts and enqueue producers. */
export function createOutboxDispatch(namespace: string, list: () => Promise<QueuedMutation[]>, enqueue: Enqueue, isCurrent: () => boolean): OutboxDispatch {
    return work => withMutationLock(namespace, async exclusive => {
        if (!isCurrent()) throw new Error('The tracking account changed. Reopen this action.');
        const pending = await list();
        if (!isCurrent()) throw new Error('The tracking account changed. Reopen this action.');
        return work(enqueue, !exclusive || pending.length > 0, pending);
    });
}
