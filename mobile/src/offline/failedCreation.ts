import type { QueuedMutation } from './queuedMutation';

/** Discard only an explicitly selected failed local creation and its dependent local edits. */
export function failedCreationDiscardIds(rows: readonly QueuedMutation[], id: string): string[] {
    const parent = rows.find(row => row.id === id);
    if (!parent || parent.operation !== 'food.create' || parent.state !== 'failed') {
        throw new Error('The failed entry changed. Refresh and review it again.');
    }
    const affected = rows.filter(row => {
        const payload = row.payload as { localCreation?: { operationId?: string } } | null;
        return row.id === id || payload?.localCreation?.operationId === id;
    });
    if (affected.some(row => row.state === 'replaying')) throw new Error('This entry is currently syncing. Try again when it finishes.');
    return affected.map(row => row.id);
}
