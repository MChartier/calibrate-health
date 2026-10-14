const mockValues = new Map<string, string>();
const mockInspectState = jest.fn(async (_origin?: string) => ({ hasState: false }));
let mockTarget = 'https://configured.example';
let mockHold: Promise<void> | undefined;
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (key: string) => mockValues.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { if (value.includes('old-access')) await mockHold; mockValues.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { mockValues.delete(key); })
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../config/server', () => ({ ...jest.requireActual('../config/server'), getDefaultServerUrl: () => mockTarget }));
jest.mock('./targetTransitionState', () => ({ inspectTargetTransitionState: (origin?: string) => mockInspectState(origin) }));
import { clearStoredTokens, readStoredTokens, writeStoredTokens, readServerUrl } from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

describe('configured session at the production storage boundary', () => {
    const oldOrigin = 'https://previous.example';
    const bindingKey = 'calibrate.mobile.boundSession.v1';
    const original = { version: 1, origin: oldOrigin, accessToken: 'kept-access', refreshToken: 'kept-refresh' };
    beforeEach(async () => {
        mockValues.clear(); await AsyncStorage.clear();
        mockTarget = 'https://configured.example';
        mockInspectState.mockReset().mockResolvedValue({ hasState: false });
        jest.mocked(SecureStore.setItemAsync).mockReset().mockImplementation(async (key, value) => { mockValues.set(key, value); });
        jest.mocked(SecureStore.getItemAsync).mockReset().mockImplementation(async key => mockValues.get(key) ?? null);
        await AsyncStorage.setItem('calibrate.mobile.serverUrl', oldOrigin);
        mockValues.set('calibrate.mobile.accessToken', original.accessToken);
        mockValues.set('calibrate.mobile.refreshToken', original.refreshToken);
    });
    it('retains matching legacy credentials and local state without inspecting or clearing queues', async () => {
        mockTarget = oldOrigin;
        await readServerUrl();
        expect(JSON.parse(mockValues.get(bindingKey)!)).toEqual(original);
        expect(mockInspectState).not.toHaveBeenCalled();
        expect(await readStoredTokens()).toEqual({ accessToken: original.accessToken, refreshToken: original.refreshToken });
    });
    it.each([false, true])('preserves changed-origin originals and commits signed out (bound: %s)', async bound => {
        if (bound) mockValues.set(bindingKey, JSON.stringify(original));
        await readServerUrl();
        expect(await readStoredTokens()).toEqual({ accessToken: null, refreshToken: null });
        expect(mockInspectState).toHaveBeenCalledWith(oldOrigin);
        expect([...mockValues.entries()].some(([key, value]) => key.startsWith('calibrate.mobile.retainedSession.') && value === JSON.stringify(original))).toBe(true);
        expect(mockValues.get('calibrate.mobile.refreshToken')).toBe(original.refreshToken);
    });
    it.each(['pending', 'failed', 'replaying', 'unreadable', 'unknown'])('blocks %s state and reopens the unchanged original binding in a matching build', async reason => {
        mockValues.set(bindingKey, JSON.stringify(original));
        mockInspectState.mockRejectedValue(new Error(reason));
        await expect(readServerUrl()).rejects.toThrow(reason);
        await expect(readStoredTokens()).rejects.toThrow('incomplete');
        expect(mockValues.get(bindingKey)).toBe(JSON.stringify(original));
        mockTarget = oldOrigin;
        await readServerUrl();
        expect((await readStoredTokens()).refreshToken).toBe(original.refreshToken);
    });
    it.each(['previous.example', 'https://user:secret@previous.example', 'https://previous.example/path', 'not a URL'])('never guesses malformed saved origin %s', async origin => {
        await AsyncStorage.setItem('calibrate.mobile.serverUrl', origin);
        await expect(readServerUrl()).rejects.toThrow();
        expect(mockValues.has(bindingKey)).toBe(false);
    });
    it('blocks missing identity with tokens or scoped data; only a proven empty installation proceeds', async () => {
        await AsyncStorage.removeItem('calibrate.mobile.serverUrl');
        await expect(readServerUrl()).rejects.toThrow('cannot be identified');
        mockValues.clear(); mockInspectState.mockResolvedValue({ hasState: true });
        await expect(readServerUrl()).rejects.toThrow('cannot be identified');
        mockInspectState.mockResolvedValue({ hasState: false });
        await readServerUrl();
        expect(await readStoredTokens()).toEqual({ accessToken: null, refreshToken: null });
    });
    it.each(['read', 'preserve', 'commit'] as const)('fails closed on %s failure and retries without losing originals', async operation => {
        if (operation === 'read') jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('unavailable'));
        else jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => {
            if (operation === 'preserve') throw new Error('unavailable');
            mockValues.set(key, value);
            jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('unavailable'));
        });
        await expect(readServerUrl()).rejects.toThrow('unavailable');
        await expect(readStoredTokens()).rejects.toThrow('incomplete');
        expect(mockValues.get('calibrate.mobile.refreshToken')).toBe(original.refreshToken);
        await readServerUrl();
        expect((await readStoredTokens()).refreshToken).toBeNull();
    });
    it('recognizes a completed binding after an interrupted acknowledgement without importing legacy tokens', async () => {
        const write = jest.mocked(SecureStore.setItemAsync);
        write.mockImplementation(async (key, value) => { mockValues.set(key, value); if (key === bindingKey) throw new Error('interrupted'); });
        await expect(readServerUrl()).rejects.toThrow('interrupted');
        await readServerUrl();
        expect((await readStoredTokens()).refreshToken).toBeNull();
    });
    it('does not fall back to legacy credentials after an unknown bound version', async () => {
        mockValues.set(bindingKey, '{"version":2}');
        await expect(readServerUrl()).rejects.toThrow('unreadable');
        expect(mockValues.get(bindingKey)).toBe('{"version":2}');
    });
});

it('accepts an existing empty installation with only a device ID', async () => {
    mockValues.clear();
    mockValues.set('calibrate.mobile.deviceId', 'existing-device');
    await expect(readServerUrl()).resolves.toBe('https://configured.example');
    await expect(readStoredTokens()).resolves.toEqual({ accessToken: null, refreshToken: null });
    expect(mockValues.get('calibrate.mobile.deviceId')).toBe('existing-device');
});

it('orders an in-flight old token write before logout clearing and replacement-account persistence', async () => {
    await readServerUrl();
    let release!: () => void;
    mockHold = new Promise(resolve => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => {
        entered(); await mockHold; mockValues.set(key, value);
    });
    const oldWrite = writeStoredTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    await started;
    const logout = clearStoredTokens();
    const replacement = writeStoredTokens({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    const read = readStoredTokens();
    release();
    await Promise.all([oldWrite, logout, replacement]);
    await expect(read).resolves.toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    await clearStoredTokens();
    await expect(readStoredTokens()).resolves.toEqual({ accessToken: null, refreshToken: null });
});


it('rejects a cancelled write before it enters the storage queue', async () => {
    await readServerUrl();
    await writeStoredTokens({ accessToken: 'kept-access', refreshToken: 'kept-refresh' });
    let current = true;
    const stale = writeStoredTokens({ accessToken: 'discard-access', refreshToken: 'discard-refresh' }, () => current);
    current = false;
    await expect(stale).rejects.toThrow('scope changed');
    await expect(readStoredTokens()).resolves.toEqual({ accessToken: 'kept-access', refreshToken: 'kept-refresh' });
});

it.each([false, true])('restores an in-flight cancelled write before replacement reads (storage failure: %s)', async failRestore => {
    await readServerUrl();
    await writeStoredTokens({ accessToken: 'kept-access', refreshToken: 'kept-refresh' });
    const store = jest.mocked(require('expo-secure-store').setItemAsync);
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    store.mockImplementationOnce(async (key: string, value: string) => { entered(); await hold; mockValues.set(key, value); });
    let current = true;
    const stale = writeStoredTokens({ accessToken: 'discard-access', refreshToken: 'discard-refresh' }, () => current);
    const rejected = expect(stale).rejects.toThrow();
    await started;
    current = false;
    if (failRestore) store.mockRejectedValueOnce(new Error('Storage unavailable')).mockRejectedValueOnce(new Error('Still unavailable'));
    release();
    await rejected;
    if (failRestore) await expect(readStoredTokens()).rejects.toThrow('Still unavailable');
    await expect(readStoredTokens()).resolves.toEqual({ accessToken: 'kept-access', refreshToken: 'kept-refresh' });
    await writeStoredTokens({ accessToken: 'replacement-access', refreshToken: 'replacement-refresh' });
    await expect(readStoredTokens()).resolves.toEqual({ accessToken: 'replacement-access', refreshToken: 'replacement-refresh' });
});
