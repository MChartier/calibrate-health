const storage = (): typeof import('@react-native-async-storage/async-storage').default => {
    const module = require('@react-native-async-storage/async-storage');
    return module.default ?? module;
};
import type { FoodLogDay } from '@calibrate/api-client';
import type { QueuedMutation } from './queuedMutation';
import { withMutationLock } from './mutationLock';

const PREFIX = '@calibrate/food-day-receipts/v1/';
const key = (namespace: string) => PREFIX + encodeURIComponent(namespace);
type Journal = { version: 1; sequence: number; rows: (QueuedMutation & { receiptOperationId: string })[] };
async function read(namespace: string): Promise<Journal> {
    const raw = await storage().getItem(key(namespace));
    if (!raw) return { version: 1, sequence: 0, rows: [] };
    const parsed = JSON.parse(raw) as Journal;
    if (parsed.version !== 1 || !Number.isSafeInteger(parsed.sequence) || !Array.isArray(parsed.rows) || parsed.rows.some(row => row.namespace !== namespace)) throw new Error('Saved tracking state is invalid. Reconnect before changing food.');
    return parsed;
}
export async function readFoodDayReceipts(namespace: string): Promise<QueuedMutation[]> { return (await read(namespace)).rows; }

/** Call under the namespace lock, before acknowledging a control or removing its queued row. */
export async function recordFoodDayReceipt(namespace: string, operation: string, payload: unknown, id: string): Promise<void> {
    const p = payload as Record<string, unknown>;
    if (!p || typeof p !== 'object') return;
    const date = operation === 'food-tracking-pause.start' ? p.starts_on : operation === 'food-tracking-pause.resume' ? p.resumed_on : p.date;
    if (typeof date !== 'string' || !['food-day.set-status', 'food-day.update', 'food-tracking-pause.start', 'food-tracking-pause.resume'].includes(operation)) return;
    const journal = await read(namespace);
    const receiptKey = operation.startsWith('food-day.') ? 'day:' + date : operation + ':' + date;
    const receiptId = 'receipt:' + receiptKey;
    const prior = journal.rows.find(row => row.id === receiptId);
    if (prior?.receiptOperationId === id && !id.startsWith('server-read:')) return;
    const sequence = journal.sequence + 1;
    const next: QueuedMutation & { receiptOperationId: string } = { sequence, id: receiptId, namespace, operation, payload: payload as QueuedMutation['payload'], state: 'pending', attemptCount: 0, lastError: null, receiptOperationId: id, createdAt: sequence, updatedAt: sequence };
    await storage().setItem(key(namespace), JSON.stringify({ version: 1, sequence, rows: [...journal.rows.filter(row => row.id !== receiptId), next] }));
}

/** Serialize the authoritative read with controls so an older response cannot erase a later acknowledgement. */
export function readAndRecordFoodDay(namespace: string, date: string, fetch: () => Promise<FoodLogDay>): Promise<FoodLogDay> {
    return withMutationLock(namespace, async exclusive => {
        const day = await fetch();
        if (exclusive) await recordFoodDayReceipt(namespace, 'food-day.set-status', { date, status: day.status }, 'server-read:' + Date.now() + ':' + day.status);
        return day;
    });
}
