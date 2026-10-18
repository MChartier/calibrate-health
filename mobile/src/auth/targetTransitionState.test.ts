jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null) }));
const mockRows = jest.fn(async (): Promise<unknown[]> => []);
jest.mock('../offline/database', () => ({ openOutboxDatabase: async () => ({ getAllAsync: mockRows }) }));
const mockInbox = jest.fn((): unknown[] => []);
jest.mock('@calibrate/wear-pairing', () => ({ default: { listMessages: mockInbox } }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { inspectTargetTransitionState } from './targetTransitionState';
import { ACTIVITY_RECORD_TYPES } from '@calibrate/shared';

const origin = 'https://previous.example';
const encoded = encodeURIComponent(origin);
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); mockRows.mockResolvedValue([]); mockInbox.mockReturnValue([]); });

it.each(Object.values(ACTIVITY_RECORD_TYPES))('preserves a completed Health Connect %s checkpoint', async recordType => {
    const key = '@calibrate/health-connect/token/v1/' + encoded + '/7/' + recordType;
    const checkpoint = JSON.stringify({ token: 'synthetic-checkpoint', timeZone: 'UTC' });
    await AsyncStorage.setItem(key, checkpoint);
    await expect(inspectTargetTransitionState(origin)).resolves.toEqual({ hasState: true });
    expect(await AsyncStorage.getItem(key)).toBe(checkpoint);
});

it('blocks unknown Health Connect record types', async () => {
    await AsyncStorage.setItem('@calibrate/health-connect/token/v1/' + encoded + '/7/Unknown', '{}');
    await expect(inspectTargetTransitionState(origin)).rejects.toThrow('Unknown Health Connect');
});

it.each(['pending', 'failed', 'replaying', 'unknown'])('blocks every outbox state, including another account: %s', async state => {
    mockRows.mockResolvedValue([{ namespace: 'https://other.example::user:99', state }]);
    await expect(inspectTargetTransitionState(origin)).rejects.toThrow('offline changes');
    expect(mockRows).toHaveBeenCalledWith('SELECT namespace FROM queued_mutations');
});

it.each(['@calibrate/health-connect/pending/v1/', '@calibrate/wear/pending/v1/', '@calibrate/wear/handoffs/v1/', '@calibrate/wear/sync-invalidation/v1/'])('preserves and blocks pending device work %s', async prefix => {
    const key = prefix + encoded + '/99';
    await AsyncStorage.setItem(key, '{"pending":true}');
    await expect(inspectTargetTransitionState(origin)).rejects.toThrow('pending device sync');
    expect(await AsyncStorage.getItem(key)).toBe('{"pending":true}');
});

it('preserves a known workspace and valid sync checkpoint without reassigning their namespaces', async () => {
    const workspace = JSON.stringify({ version: 1, origin, user: { id: 7 }, cache: { queries: [] } });
    await AsyncStorage.setItem('@calibrate/offline-workspace/v1/' + encoded, workspace);
    await AsyncStorage.setItem('@calibrate/health-connect/last-success/v1/' + encoded + '/7', '2026-10-08T00:00:00Z');
    await expect(inspectTargetTransitionState(origin)).resolves.toEqual({ hasState: true });
    expect(await AsyncStorage.getItem('@calibrate/offline-workspace/v1/' + encoded)).toBe(workspace);
});

it.each(['broken', '{}', 'null'])('blocks unreadable or unknown workspace content: %s', async raw => {
    const key = '@calibrate/offline-workspace/v1/' + encoded;
    await AsyncStorage.setItem(key, raw);
    await expect(inspectTargetTransitionState(origin)).rejects.toThrow();
    expect(await AsyncStorage.getItem(key)).toBe(raw);
});

it('blocks enumeration and database read failures', async () => {
    jest.mocked(AsyncStorage.getAllKeys).mockRejectedValueOnce(new Error('storage offline'));
    await expect(inspectTargetTransitionState(origin)).rejects.toThrow('storage offline');
    mockRows.mockRejectedValueOnce(new Error('database offline'));
    await expect(inspectTargetTransitionState(origin)).rejects.toThrow('database offline');
});

it('preserves pending native revocation instead of sending it to the new target', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify({ signedOut: true, pending: true, refreshTokens: ['old'] }));
    await expect(inspectTargetTransitionState(origin)).rejects.toThrow('sign-out');
});

it('blocks an unread or queued Android Wear inbox without acknowledging messages', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
        mockInbox.mockReturnValue([{ id: 'retained-message' }]);
        await expect(inspectTargetTransitionState(origin)).rejects.toThrow('Wear inbox');
        mockInbox.mockImplementationOnce(() => { throw new Error('bridge unavailable'); });
        await expect(inspectTargetTransitionState(origin)).rejects.toThrow('bridge unavailable');
    } finally { platform.restore(); }
});
