jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveOfflineWorkspace, restoreOfflineWorkspace } from './offlineWorkspace';
beforeEach(async () => { await AsyncStorage.clear(); mockClientOptions.length = 0; });
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockClientOptions: Array<{ fetchImpl?: (input: string) => Promise<unknown>; onRequestError?: (error: unknown) => void; onUnauthorized?: () => Promise<void> | void }> = [];
const mockLoginBrowser = jest.fn();
const mockRegisterBrowser = jest.fn();
const mockLogoutBrowser = jest.fn(async () => undefined);
const mockRestoreSession = jest.fn();
const mockGetMe = jest.fn();
jest.mock('@calibrate/api-client', () => ({
    ApiError: class extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } },
    CalibrateApiClient: class {
        constructor(options: typeof mockClientOptions[number]) { mockClientOptions.push(options); }
        getMe = (...args: unknown[]) => mockGetMe(...args);
        loginBrowser = (...args: unknown[]) => mockLoginBrowser(...args);
        registerBrowser = (...args: unknown[]) => mockRegisterBrowser(...args);
        logoutBrowser = () => mockLogoutBrowser();
    }
}));
jest.mock('../config/server', () => ({
    getDefaultServerUrl: () => 'https://health.example',
    normalizeServerUrl: (url: string) => new URL(url).origin,
    HOSTED_SERVER_URL: 'https://calibratehealth.app',
    INITIAL_SERVER_CONNECTION_STATE: { status: 'idle' },
    testCalibrateServerConnection: async () => ({ ok: true, url: 'https://health.example', message: 'Connected' })
}));
jest.mock('./devAutoLogin', () => ({ restoreBrowserDevelopmentSession: (...args: unknown[]) => mockRestoreSession(...args) }));
jest.mock('../notifications/browserPush.web', () => ({ cleanupBrowserPushBeforeSessionChange: jest.fn(async () => undefined) }));
jest.mock('../pwa/cacheIsolation.web', () => ({ clearBrowserUserScopedCaches: jest.fn(async () => undefined) }));
jest.mock('../onboarding/draftStorage', () => ({ clearOnboardingDraft: jest.fn(async () => undefined) }));

import { AuthProvider, useAuth } from './AuthContext.web';
import { clearOnboardingDraft } from '../onboarding/draftStorage';
import { clearBrowserUserScopedCaches } from '../pwa/cacheIsolation.web';

const USER = { id: 7, email: 'person@example.com' };
function renderAuth() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <QueryClientProvider client={queryClient}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
    );
    return renderHook(() => useAuth(), { wrapper });
}

describe('browser onboarding draft cleanup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRestoreSession.mockReset().mockResolvedValue({ user: USER });
        mockLoginBrowser.mockReset().mockResolvedValue({ user: USER });
        mockLogoutBrowser.mockReset().mockResolvedValue(undefined);
        mockRegisterBrowser.mockReset().mockResolvedValue({ user: USER });
    });

    it.each(['logout', 'clearLocalSession'] as const)('clears the current account draft on %s', async (method) => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => result.current[method]());
        expect(clearOnboardingDraft).toHaveBeenCalledWith('https://health.example', 7);
        expect(clearBrowserUserScopedCaches).toHaveBeenCalled();
        expect(result.current.user).toBeNull();
    });

    it('keeps restored and same-account drafts, but clears the former account after a different login', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
        await act(async () => { await result.current.login('person@example.com', 'password'); });
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
        mockLoginBrowser.mockResolvedValue({ user: { ...USER, id: 8 } });
        await act(async () => { await result.current.login('another@example.com', 'password'); });
        expect(clearOnboardingDraft).toHaveBeenCalledWith('https://health.example', 7);
        expect(result.current.user?.id).toBe(8);
    });

    it('retains progress for a network failure during initial session restoration', async () => {
        mockRestoreSession.mockRejectedValueOnce(new Error('Network unavailable'));
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
    });

    it('still ends the session and clears browser caches if draft deletion fails', async () => {
        jest.mocked(clearOnboardingDraft).mockRejectedValueOnce(new Error('Storage unavailable'));
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await expect(result.current.logout()).rejects.toThrow('Storage unavailable'); });
        expect(result.current.user).toBeNull();
        expect(clearBrowserUserScopedCaches).toHaveBeenCalled();
        expect(mockLogoutBrowser).toHaveBeenCalledTimes(1);
    });
    it('a stale browser unauthorized response cannot clear a newer session', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const oldClient = mockClientOptions.filter((options) => options.onUnauthorized).at(-1)!;
        await act(async () => result.current.clearLocalSession());
        mockLoginBrowser.mockResolvedValue({ user: { ...USER, id: 8 } });
        await act(async () => { await result.current.login('new@example.com', 'secret'); });
        await act(async () => oldClient.onUnauthorized!());
        act(() => oldClient.onRequestError!(new TypeError('Late network error')));
        expect(result.current.pendingReconnection).toBe(false);
        expect(result.current.user?.id).toBe(8);
        expect(mockRestoreSession).toHaveBeenCalledTimes(1);
    });

    it.each(['login', 'register'] as const)('revokes the stale %s cookie before sending replacement credentials', async method => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        let finish!: () => void;
        let cookie: number | null = 7;
        const events: string[] = [];
        const pending = new Promise<void>(resolve => { finish = resolve; });
        const first = method === 'login' ? mockLoginBrowser : mockRegisterBrowser;
        first.mockImplementationOnce(async () => { await pending; cookie = 7; events.push('old-cookie'); return { user: USER }; });
        mockLogoutBrowser.mockImplementation(async () => { cookie = null; events.push('revoked'); });
        let old!: Promise<boolean>;
        act(() => { old = method === 'login' ? result.current.login('old@example.invalid', 'password') : result.current.register('old@example.invalid', 'password', { acceptTerms: true, acceptPrivacy: true }); });
        await waitFor(() => expect(first).toHaveBeenCalled());
        mockLoginBrowser.mockImplementationOnce(async () => { expect(cookie).toBeNull(); cookie = 8; events.push('replacement'); return { user: { ...USER, id: 8 } }; });
        let replacement!: Promise<boolean>;
        act(() => { replacement = result.current.login('new@example.invalid', 'password'); });
        const client = mockClientOptions.filter(options => options.fetchImpl).at(-1)!;
        await expect(client.fetchImpl!('/api/v1/user/profile')).rejects.toThrow('scope changed');
        expect(events).toEqual([]);
        await act(async () => { finish(); expect(await old).toBe(false); expect(await replacement).toBe(true); });
        expect(events).toEqual(['old-cookie', 'revoked', 'replacement']);
        expect(cookie).toBe(8);
        expect(result.current.user?.id).toBe(8);
    });

    it('blocks replacement credentials while stale cookie revocation fails, then recovers', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        let finish!: () => void;
        mockLoginBrowser.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { user: USER }; });
        mockLogoutBrowser.mockRejectedValue(new TypeError('Offline'));
        let old!: Promise<boolean>, replacement!: Promise<boolean>;
        act(() => { old = result.current.login('old@example.invalid', 'password'); });
        await waitFor(() => expect(mockLoginBrowser).toHaveBeenCalledTimes(1));
        act(() => { replacement = result.current.login('new@example.invalid', 'password'); });
        const outcomes = Promise.allSettled([old, replacement]);
        await act(async () => { finish(); expect((await outcomes).map(value => value.status)).toEqual(['rejected', 'rejected']); });
        expect(mockLoginBrowser).toHaveBeenCalledTimes(1);
        expect(result.current.user).toBeNull();
        expect((await AsyncStorage.getAllKeys()).some(key => key.startsWith('calibrate.logout.'))).toBe(true);
        mockLogoutBrowser.mockResolvedValue(undefined);
        mockLoginBrowser.mockResolvedValue({ user: { ...USER, id: 8 } });
        await act(async () => { expect(await result.current.login('new@example.invalid', 'password')).toBe(true); });
        expect(result.current.user?.id).toBe(8);
    });

    it('revokes an old provider cookie before a remounted provider restores a session', async () => {
        const first = renderAuth();
        await waitFor(() => expect(first.result.current.isLoading).toBe(false));
        let finish!: () => void;
        mockLoginBrowser.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { user: USER }; });
        let old!: Promise<boolean>;
        act(() => { old = first.result.current.login('old@example.invalid', 'password'); });
        await waitFor(() => expect(mockLoginBrowser).toHaveBeenCalledTimes(1));
        first.unmount();
        mockRestoreSession.mockClear();
        const second = renderAuth();
        expect(mockRestoreSession).not.toHaveBeenCalled();
        await act(async () => { finish(); expect(await old).toBe(false); });
        await waitFor(() => expect(second.result.current.isLoading).toBe(false));
        expect(mockLogoutBrowser).toHaveBeenCalled();
        expect(mockRestoreSession).not.toHaveBeenCalled();
        expect(second.result.current.user).toBeNull();
        second.unmount();
    });

    it('ends a browser cookie delivered after logout instead of restoring it on reload', async () => {
        const first = renderAuth();
        await waitFor(() => expect(first.result.current.isLoading).toBe(false));
        let finish!: () => void;
        let cookie: number | null = 7;
        mockLoginBrowser.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve; }); cookie = 8; return { user: { ...USER, id: 8 } }; });
        mockLogoutBrowser.mockImplementation(async () => { cookie = null; });
        let login!: Promise<boolean>, logout!: Promise<void>;
        act(() => { login = first.result.current.login('late@example.invalid', 'password'); });
        await waitFor(() => expect(mockLoginBrowser).toHaveBeenCalled());
        act(() => { logout = first.result.current.logout(); });
        await act(async () => { finish(); await Promise.all([login, logout]); });
        expect(cookie).toBeNull();
        expect(first.result.current.user).toBeNull();
        first.unmount();
        mockRestoreSession.mockClear();
        const second = renderAuth();
        await waitFor(() => expect(second.result.current.isLoading).toBe(false));
        expect(mockRestoreSession).not.toHaveBeenCalled();
        expect(second.result.current.user).toBeNull();
        second.unmount();
    });

});

describe('browser offline workspace restoration', () => {
    it.each(['network', 'provider'])('keeps scoped local identity across %s outage and restart', async (kind) => {
        await saveOfflineWorkspace('https://health.example', USER as never, new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
        const error = kind === 'network' ? new TypeError('Network unavailable') : new (require('@calibrate/api-client').ApiError)(503, 'Provider unavailable');
        mockRestoreSession.mockRejectedValueOnce(error);
        mockGetMe.mockResolvedValue({ user: USER });
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.user?.id).toBe(7);
        expect(result.current.pendingReconnection).toBe(true);
        await act(async () => { await result.current.recheckClientCompatibility(); });
        expect(result.current.pendingReconnection).toBe(false);
        expect(result.current.user?.id).toBe(7);
    });
    it('refuses to attach an offline workspace to a different recovered cookie account', async () => {
        await saveOfflineWorkspace('https://health.example', USER as never, new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
        mockRestoreSession.mockRejectedValueOnce(new TypeError('Offline'));
        mockGetMe.mockResolvedValue({ user: { ...USER, id: 8 } });
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.pendingReconnection).toBe(true));
        await act(async () => { expect(await result.current.recheckClientCompatibility()).toBe(false); });
        expect(result.current.user).toBeNull();
        expect(await restoreOfflineWorkspace('https://health.example', new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }))).toBeNull();
    });
});


it('persists a verified user access update without waiting for another tracking query', async () => {
    mockRestoreSession.mockResolvedValue({ user: USER });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    const updated = { ...result.current.user!, account_access: { state: 'full' } } as never;
    act(() => result.current.updateCurrentUser(updated));
    const restored = await restoreOfflineWorkspace('https://health.example', new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
    expect(restored?.account_access?.state).toBe('full');
});

it('keeps the established identity and enters reconnection after a completed timeout', async () => {
    mockRestoreSession.mockResolvedValue({ user: USER });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    const observer = mockClientOptions.filter((options) => options.onRequestError).at(-1)?.onRequestError;
    expect(observer).toBeDefined();
    act(() => observer!(new Error('Request timed out while connecting to https://health.example')));
    expect(result.current.pendingReconnection).toBe(true);
    expect(result.current.user?.id).toBe(7);
});

it('ignores a successful reconnection response that arrives after explicit logout', async () => {
    mockRestoreSession.mockResolvedValue({ user: USER });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    let finish!: (value: unknown) => void;
    mockGetMe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let reconnect!: Promise<boolean>;
    act(() => { reconnect = result.current.recheckClientCompatibility(); });
    await act(async () => result.current.logout());
    await act(async () => { finish({ user: USER }); expect(await reconnect).toBe(false); });
    expect(result.current.user).toBeNull();
    expect(await restoreOfflineWorkspace('https://health.example', new QueryClient())).toBeNull();
});

it('stays explicitly signed out across failed invalidation, restart, recovery and another-account login', async () => {
    mockRestoreSession.mockResolvedValue({ user: USER });
    const first = renderAuth();
    await waitFor(() => expect(first.result.current.user?.id).toBe(7));
    mockLogoutBrowser.mockRejectedValueOnce(new TypeError('Offline'));
    await act(async () => first.result.current.logout());
    expect(first.result.current.user).toBeNull();
    first.unmount();
    mockLogoutBrowser.mockRejectedValueOnce(new TypeError('Still offline'));
    mockRestoreSession.mockClear();
    const second = renderAuth();
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.user).toBeNull();
    expect(mockRestoreSession).not.toHaveBeenCalled();
    mockLogoutBrowser.mockResolvedValue(undefined);
    mockLoginBrowser.mockResolvedValue({ user: { ...USER, id: 8 } });
    await act(async () => { expect(await second.result.current.login('other@example.com', 'password')).toBe(true); });
    expect(second.result.current.user?.id).toBe(8);
    expect(mockLogoutBrowser).toHaveBeenCalled();
    second.unmount();
    mockRestoreSession.mockResolvedValue({ user: { ...USER, id: 8 } });
    const third = renderAuth();
    await waitFor(() => expect(third.result.current.user?.id).toBe(8));
});


it('clears UI and revokes the cookie session when writing logout intent fails', async () => {
    mockRestoreSession.mockResolvedValue({ user: USER });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    mockLogoutBrowser.mockClear();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Storage full'));
    await act(async () => result.current.logout());
    expect(result.current.user).toBeNull();
    expect(mockLogoutBrowser).toHaveBeenCalledTimes(1);
});
