jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request' }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IDBFactory } from 'fake-indexeddb';
import type { FoodLogDay } from '@calibrate/api-client';
import { IndexedDbOutbox, openIndexedDbOutboxDatabase } from './indexedDbOutbox.web';
import { createOutboxDispatch } from './mutationDispatch';
import { executeOrQueueMutation } from './operations';
import { OutboxReconciler } from './reconciler';
import { readAndRecordFoodDay, readFoodDayReceipts } from './foodDayReceipts';
import { queuedFoodDayStatus } from './foodDayIntent';

beforeEach(async () => { await AsyncStorage.clear(); });
const date = '2026-08-08';

it.each(['food-day.set-status', 'food-tracking-pause.start'])('retains applied %s after queue deletion and persisted reopen, without crossing accounts', async operation => {
    const factory = new IDBFactory();
    let database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'receipts' });
    let store = new IndexedDbOutbox(database, 'account');
    try {
        await store.enqueue({ id: 'control', operation, payload: operation === 'food-day.set-status' ? { date, status: 'COMPLETE' } : { starts_on: date } });
        await new OutboxReconciler(store, async () => undefined, 'account').reconcile();
        expect(await store.list()).toEqual([]);
        database.close(); database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'receipts' });
        store = new IndexedDbOutbox(database, 'account');
        const dispatch = createOutboxDispatch('account', () => store.list(), (kind, payload, id) => store.enqueue({ operation: kind, payload, id }), () => true, true);
        const execute = jest.fn(async () => undefined);
        for (const kind of ['food.create', 'food.update', 'food.delete'] as const) {
            await expect(executeOrQueueMutation({ withOutbox: dispatch, forceQueue: true, operation: kind, payload: { date }, execute, enqueue: async () => undefined })).rejects.toThrow(/Reopen or resume/);
        }
        expect(execute).not.toHaveBeenCalled(); expect(await store.list()).toEqual([]);
        expect(queuedFoodDayStatus(await readFoodDayReceipts('account'), date, 'OPEN')).toBe(operation === 'food-day.set-status' ? 'COMPLETE' : 'PAUSED');
        expect(await readFoodDayReceipts('other-account')).toEqual([]);
        // A verified newer server read reconciles acknowledged state; an old cached OPEN value did not.
        await readAndRecordFoodDay('account', date, async () => ({ date, status: 'OPEN' } as FoodLogDay));
        await expect(executeOrQueueMutation({ withOutbox: dispatch, forceQueue: true, operation: 'food.create', payload: { date }, execute, enqueue: async () => undefined })).resolves.toMatchObject({ disposition: 'queued' });
        expect(await store.list()).toHaveLength(1);
    } finally { database.close(); }
});

it('serializes a slow authoritative read before a newer direct completion receipt', async () => {
    let release!: () => void; let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const read = readAndRecordFoodDay('account', date, async () => { started(); await gate; return { date, status: 'OPEN' } as FoodLogDay; });
    await entered;
    const dispatch = createOutboxDispatch('account', async () => [], async () => undefined, () => true, true);
    const complete = executeOrQueueMutation({ withOutbox: dispatch, operation: 'food-day.set-status', payload: { date, status: 'COMPLETE' }, execute: async () => undefined, enqueue: async () => undefined });
    release(); await Promise.all([read, complete]);
    expect(queuedFoodDayStatus(await readFoodDayReceipts('account'), date, 'OPEN')).toBe('COMPLETE');
});

it('retains an acknowledged control under its original request ID if receipt persistence fails', async () => {
    const enqueue = jest.fn(async () => undefined);
    const dispatch = createOutboxDispatch('account', async () => [], enqueue, () => true, true);
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(executeOrQueueMutation({ withOutbox: dispatch, operation: 'food-day.set-status', payload: { date, status: 'COMPLETE' }, execute: async () => undefined, enqueue, createOperationId: () => 'original-control' })).resolves.toMatchObject({ disposition: 'queued', operationId: 'original-control' });
    expect(enqueue).toHaveBeenCalledWith('food-day.set-status', { date, status: 'COMPLETE' }, 'original-control');
});
