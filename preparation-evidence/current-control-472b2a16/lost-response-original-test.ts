jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request' }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IDBFactory } from 'fake-indexeddb';
import type { FoodLogDay } from '@calibrate/api-client';
import { IndexedDbOutbox, openIndexedDbOutboxDatabase } from './indexedDbOutbox.web';
import { createOutboxDispatch } from './mutationDispatch';
import { executeOrQueueMutation, createQueuedMutationExecutor } from './operations';
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
        await new OutboxReconciler(store, async () => ({ currentControl: { day: { date, status: operation === 'food-day.set-status' ? 'COMPLETE' : 'PAUSED' } } }), 'account').reconcile();
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

it.each(['food-day.set-status', 'food-tracking-pause.start'])('does not resurrect stale %s state after lost-response replay and a second-client reopen', async operation => {
    const factory = new IDBFactory();
    const database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'lost-response' });
    const store = new IndexedDbOutbox(database, 'account');
    const oldStatus = operation === 'food-day.set-status' ? 'COMPLETE' : 'PAUSED';
    let serverStatus = 'OPEN'; let calls = 0; let writes = 0;
    const ids: string[] = [];
    const apply = async (_payload: unknown, id?: string) => {
        ids.push(id!); calls++;
        if (calls === 1) { writes++; serverStatus = oldStatus; throw new TypeError('Lost response after server commit'); }
        return { date, status: oldStatus, pause: { active: true, starts_on: date } }; // Cached receipt, no second write.
    };
    const api = {
        setFoodDayStatus: apply, startFoodTrackingPause: apply,
        getFoodDay: async () => ({ date, status: serverStatus }),
        getFoodTrackingPause: async () => ({ pause: { active: false, starts_on: null } })
    } as unknown as import('@calibrate/api-client').CalibrateApiClient;
    try {
        await store.enqueue({ id: 'same-original-id', operation, payload: operation === 'food-day.set-status' ? { date, status: 'COMPLETE' } : { starts_on: date, expected_resume_on: null } });
        const execute = createQueuedMutationExecutor(api);
        expect((await new OutboxReconciler(store, execute, 'account').reconcile()).deferredMutation?.id).toBe('same-original-id');
        serverStatus = 'OPEN'; // A second client deliberately reopened/resumed after the first request committed.
        await readAndRecordFoodDay('account', date, () => api.getFoodDay(date));
        const result = await new OutboxReconciler(store, execute, 'account').reconcile();
        expect(result.replayed).toBe(1); expect(result.failedMutation).toBeNull();
        expect(writes).toBe(1); expect(ids).toEqual(['same-original-id', 'same-original-id']);
        expect(await store.list()).toEqual([]);
        expect(queuedFoodDayStatus(await readFoodDayReceipts('account'), date, 'OPEN')).toBe('OPEN');
        const dispatch = createOutboxDispatch('account', () => store.list(), (kind, payload, id) => store.enqueue({ operation: kind, payload, id }), () => true, true);
        await expect(executeOrQueueMutation({ withOutbox: dispatch, forceQueue: true, operation: 'food.create', payload: { date }, execute: async () => undefined, enqueue: async () => undefined })).resolves.toMatchObject({ disposition: 'queued' });
    } finally { database.close(); }
});

it('keeps the original control pending if its post-replay server read is unavailable', async () => {
    const { ApiError } = require('@calibrate/api-client');
    const factory = new IDBFactory(); const database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'verification-outage' });
    const store = new IndexedDbOutbox(database, 'account'); let unavailable = true;
    const api = {
        setFoodDayStatus: jest.fn(async () => ({ date, status: 'COMPLETE' })),
        getFoodDay: jest.fn(async () => { if (unavailable) throw new ApiError('Unavailable', 503, null); return { date, status: 'OPEN' }; })
    } as unknown as import('@calibrate/api-client').CalibrateApiClient;
    try {
        await store.enqueue({ id: 'original', operation: 'food-day.set-status', payload: { date, status: 'COMPLETE' } });
        const execute = createQueuedMutationExecutor(api);
        const first = await new OutboxReconciler(store, execute, 'account').reconcile();
        expect(first.deferredMutation?.id).toBe('original');
        expect((await store.list())[0]).toMatchObject({ id: 'original', state: 'pending' });
        expect(await readFoodDayReceipts('account')).toEqual([]);
        unavailable = false;
        expect((await new OutboxReconciler(store, execute, 'account').reconcile()).replayed).toBe(1);
        expect(api.setFoodDayStatus).toHaveBeenNthCalledWith(1, { date, status: 'COMPLETE' }, 'original');
        expect(api.setFoodDayStatus).toHaveBeenNthCalledWith(2, { date, status: 'COMPLETE' }, 'original');
        expect(queuedFoodDayStatus(await readFoodDayReceipts('account'), date)).toBe('OPEN');
    } finally { database.close(); }
});
