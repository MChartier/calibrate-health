jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'unused') }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { clearOfflineWorkspace, hydrateVerifiedOfflineWorkspace, restoreOfflineWorkspace, saveOfflineWorkspace } from './offlineWorkspace';
const USER = { id: 7, email: 'synthetic@example.test' } as never;
beforeEach(async () => { await AsyncStorage.clear(); });
it('restores allowlisted tracking data across restart without persisting credentials or other-account state', async () => {
    const before = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    before.setQueryData(['mobile-food', '2026-10-05'], [{ id: 1, name: 'Synthetic meal' }]);
    before.setQueryData(['session-secret'], 'must-not-persist');
    await saveOfflineWorkspace('https://one.test', USER, before);
    const after = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    expect(await restoreOfflineWorkspace('https://two.test', after)).toBeNull();
    expect(await restoreOfflineWorkspace('https://one.test', after)).toEqual(USER);
    expect(after.getQueryData(['mobile-food', '2026-10-05'])).toEqual([{ id: 1, name: 'Synthetic meal' }]);
    expect(after.getQueryData(['session-secret'])).toBeUndefined();
});
it('orders logout after queued snapshots so a delayed write cannot revive identity', async () => {
    const save = saveOfflineWorkspace('https://one.test', USER, new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
    const clear = clearOfflineWorkspace('https://one.test');
    await Promise.all([save, clear]);
    expect(await restoreOfflineWorkspace('https://one.test', new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }))).toBeNull();
});

it('retains pending writes through auth-service outage, restart and same-account recovery', async () => {
    const { IDBFactory } = require('fake-indexeddb');
    const { IndexedDbOutbox, openIndexedDbOutboxDatabase } = require('../offline/indexedDbOutbox.web');
    const { OutboxReconciler } = require('../offline/reconciler');
    const { ApiError } = require('@calibrate/api-client');
    const factory = new IDBFactory();
    let database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'offline-recovery' });
    let outbox = new IndexedDbOutbox(database, 'https://one.test::user:7');
    await outbox.enqueue({ id: 'stable-operation', operation: 'metric.add', payload: { weight: 72, date: '2026-10-05' } });
    const unavailable = new OutboxReconciler(outbox, async () => { throw new ApiError('Provider unavailable', 503); });
    expect((await unavailable.reconcile()).deferredMutation.id).toBe('stable-operation');
    database.close();
    database = await openIndexedDbOutboxDatabase({ factory, databaseName: 'offline-recovery' });
    outbox = new IndexedDbOutbox(database, 'https://one.test::user:7');
    expect(await new IndexedDbOutbox(database, 'https://two.test::user:7').list()).toEqual([]);
    expect(await new IndexedDbOutbox(database, 'https://one.test::user:8').list()).toEqual([]);
    const applied: string[] = [];
    await new OutboxReconciler(outbox, async (mutation: { id: string }) => { applied.push(mutation.id); }).reconcile();
    expect(applied).toEqual(['stable-operation']);
    expect(await outbox.list()).toEqual([]);
    database.close();
});

it('preserves cached tracking through successful cold authentication before any tracking endpoint reloads', async () => {
    const original = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    original.setQueryData(['mobile-metrics'], [{ id: 1, weight: 88 }]);
    await saveOfflineWorkspace('https://one.test', USER, original);
    const cold = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    await saveOfflineWorkspace('https://one.test', USER, cold);
    await hydrateVerifiedOfflineWorkspace('https://one.test', 7, cold, () => true);
    expect(cold.getQueryData(['mobile-metrics'])).toEqual([{ id: 1, weight: 88 }]);
    const other = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    await hydrateVerifiedOfflineWorkspace('https://one.test', 8, other, () => true);
    await hydrateVerifiedOfflineWorkspace('https://one.test', 7, other, () => false);
    expect(other.getQueryData(['mobile-metrics'])).toBeUndefined();
});


it('restores the original snapshot when its provider unmounts during a save', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    await saveOfflineWorkspace('https://one.test', USER, client);
    await saveOfflineWorkspace('https://two.test', USER, client);
    const key = '@calibrate/offline-workspace/v1/' + encodeURIComponent('https://one.test');
    const original = await AsyncStorage.getItem(key);
    const set = jest.mocked(AsyncStorage.setItem);
    const originalSet = set.getMockImplementation()!;
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    set.mockImplementationOnce(async (key, value) => { entered(); await hold; return originalSet(key, value); });
    let current = true;
    const stale = saveOfflineWorkspace('https://one.test', { id: 8, email: 'late@example.invalid' } as never, client, () => current);
    await started;
    current = false;
    const restored = restoreOfflineWorkspace('https://one.test', client);
    release();
    await stale;
    await expect(restored).resolves.toEqual(USER);
    expect(await AsyncStorage.getItem(key)).toBe(original);
    expect(await restoreOfflineWorkspace('https://two.test', client)).toEqual(USER);
});


it('blocks snapshot reads until a failed cancelled-save restoration can recover', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    await saveOfflineWorkspace('https://one.test', USER, client);
    const set = jest.mocked(AsyncStorage.setItem);
    const originalSet = set.getMockImplementation()!;
    let current = true;
    set.mockImplementationOnce(async (key, value) => { await originalSet(key, value); current = false; })
        .mockRejectedValueOnce(new Error('Restore unavailable'))
        .mockRejectedValueOnce(new Error('Still unavailable'));
    await expect(saveOfflineWorkspace('https://one.test', { id: 8, email: 'discard@example.invalid' } as never, client, () => current)).rejects.toThrow('Restore unavailable');
    await expect(restoreOfflineWorkspace('https://one.test', client)).rejects.toThrow('Still unavailable');
    await expect(restoreOfflineWorkspace('https://one.test', client)).resolves.toEqual(USER);
});
