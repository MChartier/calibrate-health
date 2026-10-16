const mockValues = new Map<string, string>();
let mockHold: Promise<void> | undefined;
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (key: string) => mockValues.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { if (value.includes('old-access')) await mockHold; mockValues.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { mockValues.delete(key); })
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../config/server', () => ({ getDefaultServerUrl: () => 'https://configured.example' }));
jest.mock('./targetTransitionState', () => ({ inspectTargetTransitionState: async () => ({ hasState: false }) }));
import { clearStoredTokens, readStoredTokens, writeStoredTokens, readServerUrl } from './storage';

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
    const oldWrite = writeStoredTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
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
