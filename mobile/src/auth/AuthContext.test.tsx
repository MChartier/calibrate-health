const mockSecureLogoutStorage = new Map<string, string>();
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async (key: string) => mockSecureLogoutStorage.get(key) ?? null), setItemAsync: jest.fn(async (key: string, value: string) => { mockSecureLogoutStorage.set(key, value); }), deleteItemAsync: jest.fn(async (key: string) => { mockSecureLogoutStorage.delete(key); }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveOfflineWorkspace, restoreOfflineWorkspace } from './offlineWorkspace';
beforeEach(async () => { await AsyncStorage.clear(); mockSecureLogoutStorage.clear(); mockClientOptions.length = 0; mockLogoutClientOptions.length = 0; });
import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockClientOptions: Array<{
    baseUrl?: string; onRequestError?: (error: unknown) => void; fetchImpl?: unknown; clientIdentity?: unknown; getAccessToken?: () => string | null; refreshAccessToken?: () => Promise<boolean> | boolean;
    onUnauthorized?: () => Promise<void> | void;
}> = [];
const mockLogoutClientOptions: Array<typeof mockClientOptions[number]> = [];
const mockGetClientConfig = jest.fn();
const mockRefreshMobile = jest.fn();
const mockLoginMobile = jest.fn();
const mockLogoutMobile = jest.fn(async (_refreshToken?: string) => undefined);

jest.mock('@calibrate/api-client', () => {
    class ApiError extends Error {
        status: number;

        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    }

    return {
        ApiError,
        CalibrateApiClient: class {
            options: typeof mockClientOptions[number];
            constructor(options: typeof mockClientOptions[number]) { this.options = options; mockClientOptions.push(options); }
            getClientConfig = (...args: unknown[]) => mockGetClientConfig(...args);
            refreshMobile = (...args: unknown[]) => mockRefreshMobile(...args);
            loginMobile = (...args: unknown[]) => mockLoginMobile(...args);
            logoutMobile = (refreshToken?: string) => { mockLogoutClientOptions.push(this.options); return mockLogoutMobile(refreshToken); };
        }
    };
});

jest.mock('expo-application', () => ({
    applicationName: 'Calibrate',
    nativeApplicationVersion: '0.2.6'
}));

jest.mock('../config/nativeClient', () => ({
    MOBILE_CLIENT_IDENTITY: { platform: 'android_phone', version: '0.2.6' },
    MOBILE_SERVER_RELEASE_VERSION: '1.2.0'
}));

jest.mock('./storage', () => ({
    clearStoredTokens: jest.fn(async () => undefined),
    getOrCreateDeviceId: jest.fn(async () => 'device-1'),
    readServerUrl: jest.fn(async () => 'https://health.example'),
    readStoredTokens: jest.fn(async () => ({
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh'
    })),
    writeServerUrl: jest.fn(async () => undefined),
    writeStoredTokens: jest.fn(async () => undefined)
}));

jest.mock('../account/accountDeletionNotice', () => ({
    assertAccountDeletionCleanupAcknowledged: jest.fn(),
    clearAccountDeletionCleanupNotice: jest.fn(async () => undefined),
    readAccountDeletionCleanupNotice: jest.fn(async () => null),
    writeAccountDeletionCleanupNotice: jest.fn(async () => undefined)
}));

jest.mock('./devAutoLogin', () => ({
    DEV_TEST_EMAIL: 'test@example.com',
    DEV_TEST_PASSWORD: 'password',
    shouldDevAutoLogin: () => false
}));

jest.mock('../onboarding/draftStorage', () => ({ clearOnboardingDraft: jest.fn(async () => undefined) }));
jest.mock('../config/server', () => ({
    ...jest.requireActual('../config/server'),
    testCalibrateServerConnection: jest.fn()
}));

import { writeStoredTokens, clearStoredTokens, readServerUrl } from './storage';
import { clearOnboardingDraft } from '../onboarding/draftStorage';
import { testCalibrateServerConnection } from '../config/server';
import { AuthProvider, useAuth } from './AuthContext';

const mockWriteStoredTokens = jest.mocked(writeStoredTokens);

describe('AuthProvider client/server compatibility recovery', () => {
    it('holds authentication and recovery behind a failed target gate and offers retry without clearing data', async () => {
        jest.mocked(readServerUrl).mockRejectedValueOnce(new Error('unknown origin'));
        mockGetClientConfig.mockResolvedValue({ server_version: '1.2.0' });
        mockRefreshMobile.mockResolvedValue({ user: { id: 7, email: 'synthetic@example.invalid' }, access_token: 'a', refresh_token: 'r' });
        const view = render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Text>Application ready</Text></AuthProvider></QueryClientProvider>);
        await waitFor(() => expect(view.getByText('Saved data needs attention')).toBeTruthy());
        expect(view.queryByText('Application ready')).toBeNull();
        expect(mockGetClientConfig).not.toHaveBeenCalled();
        expect(mockRefreshMobile).not.toHaveBeenCalled();
        expect(clearStoredTokens).not.toHaveBeenCalled();
        fireEvent.press(view.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(mockRefreshMobile).toHaveBeenCalled());
    }, 15000); // First themed-screen render includes cold native UI transforms on CI.
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetClientConfig.mockReset();
        mockRefreshMobile.mockReset();
    });

    it('retains tokens during a startup mismatch and resumes the saved session after recheck', async () => {
        mockGetClientConfig
            .mockResolvedValueOnce({ server_version: '1.1.9' })
            .mockResolvedValueOnce({ server_version: '1.99.9' });
        mockRefreshMobile.mockResolvedValue({
            access_token: 'next-access',
            refresh_token: 'next-refresh',
            user: { id: 7, email: 'person@example.com' }
        });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } }
        });
        const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
            <QueryClientProvider client={queryClient}>
                <AuthProvider>{children}</AuthProvider>
            </QueryClientProvider>
        );
        const { result } = renderHook(() => useAuth(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.clientServerIncompatibility).toEqual(expect.objectContaining({
            status: 'server_behind',
            serverVersion: '1.1.9'
        }));
        expect(mockGetClientConfig).toHaveBeenNthCalledWith(1, { cache: 'no-store' });
        expect(result.current.user).toBeNull();
        expect(mockRefreshMobile).not.toHaveBeenCalled();

        let compatible = false;
        await act(async () => {
            compatible = await result.current.recheckClientCompatibility();
        });

        expect(compatible).toBe(true);
        expect(mockGetClientConfig).toHaveBeenNthCalledWith(2, { cache: 'no-store' });
        expect(mockRefreshMobile).toHaveBeenCalledWith('stored-refresh');
        expect(result.current.clientServerIncompatibility).toBeNull();
        expect(result.current.user).toEqual(expect.objectContaining({ id: 7 }));
        expect(mockWriteStoredTokens).toHaveBeenCalledWith({
            accessToken: 'next-access',
            refreshToken: 'next-refresh'
        });
    });

    it('fails closed without refreshing when the server omits its release version', async () => {
        mockGetClientConfig.mockResolvedValue({});
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } }
        });
        const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
            <QueryClientProvider client={queryClient}>
                <AuthProvider>{children}</AuthProvider>
            </QueryClientProvider>
        );
        const { result } = renderHook(() => useAuth(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.clientServerIncompatibility).toEqual(expect.objectContaining({
            status: 'invalid',
            serverVersion: 'unknown'
        }));
        expect(result.current.user).toBeNull();
        expect(mockRefreshMobile).not.toHaveBeenCalled();
        expect(mockWriteStoredTokens).not.toHaveBeenCalled();
    });
});

const AUTH_PAYLOAD = {
    access_token: 'access', refresh_token: 'refresh', user: { id: 7, email: 'person@example.com' }
};
function renderAuth() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <QueryClientProvider client={queryClient}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
    );
    return renderHook(() => useAuth(), { wrapper });
}

describe('native onboarding draft cleanup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetClientConfig.mockReset().mockResolvedValue({ server_version: '1.2.0' });
        mockRefreshMobile.mockReset().mockResolvedValue(AUTH_PAYLOAD);
        mockLoginMobile.mockReset().mockResolvedValue(AUTH_PAYLOAD);
        jest.mocked(testCalibrateServerConnection).mockResolvedValue({
            ok: true, url: 'https://health.example', config: {} as never, message: 'Connected'
        });
    });

    it('revokes the retained native refresh token through an ungated client after a tracking timeout', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.user?.id).toBe(7));
        const trackingClient = mockClientOptions.filter(options => options.onRequestError).at(-1)!;
        act(() => trackingClient.onRequestError!(new TypeError('Network unavailable')));
        expect(result.current.pendingReconnection).toBe(true);
        await act(async () => result.current.logout());
        expect(mockLogoutMobile).toHaveBeenCalledWith('refresh');
        const terminationClient = mockLogoutClientOptions.at(-1)!;
        expect(terminationClient).not.toBe(trackingClient);
        expect(terminationClient.fetchImpl).toBeUndefined();
        expect(terminationClient.baseUrl).toBe('https://health.example');
        expect(terminationClient.clientIdentity).toEqual({ platform: 'android_phone', version: '0.2.6' });
        expect(result.current.user).toBeNull();
    });

    it.each(['logout', 'clearLocalSession'] as const)('clears the captured account draft on %s', async (method) => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => result.current[method]());
        expect(clearOnboardingDraft).toHaveBeenCalledWith('https://health.example', 7);
        expect(clearStoredTokens).toHaveBeenCalled();
        expect(result.current.user).toBeNull();
    });

    it('preserves a same-account session and clears the former account on replacement', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.login('person@example.com', 'password'); });
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
        mockLoginMobile.mockResolvedValue({ ...AUTH_PAYLOAD, user: { id: 8, email: 'another@example.com' } });
        await act(async () => { await result.current.login('another@example.com', 'password'); });
        expect(clearOnboardingDraft).toHaveBeenCalledWith('https://health.example', 7);
        expect(result.current.user?.id).toBe(8);
    });

    it('does not expose a runtime target setter', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current).not.toHaveProperty('setServerUrl');
    });

    it('does not clear saved progress for a transient startup network failure', async () => {
        mockGetClientConfig.mockRejectedValueOnce(new Error('Network unavailable'));
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
        expect(clearStoredTokens).not.toHaveBeenCalled();
    });
    it('revokes a login response that arrives after logout without restoring its session', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        let finish!: (value: typeof AUTH_PAYLOAD) => void;
        mockLoginMobile.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        let login!: Promise<boolean>;
        act(() => { login = result.current.login('late@example.com', 'secret'); });
        await waitFor(() => expect(mockLoginMobile).toHaveBeenCalled());
        await act(async () => result.current.logout());
        await act(async () => { finish({ ...AUTH_PAYLOAD, refresh_token: 'late-login' }); await login; });
        expect(result.current.user).toBeNull();
        expect(result.current.accessToken).toBeNull();
        await waitFor(() => expect(mockLogoutMobile).toHaveBeenCalledWith('late-login'));
    });

    it('old API callbacks cannot read or refresh another account or sign it out', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const oldClient = mockClientOptions.filter((options) => options.getAccessToken).at(-1)!;
        expect(oldClient.getAccessToken!()).toBe('access');
        await act(async () => result.current.clearLocalSession());
        mockLoginMobile.mockResolvedValue({ ...AUTH_PAYLOAD, access_token: 'new-access', refresh_token: 'new-refresh', user: { id: 8, email: 'new@example.com' } });
        await act(async () => { await result.current.login('new@example.com', 'secret'); });
        const calls = mockRefreshMobile.mock.calls.length;
        expect(oldClient.getAccessToken!()).toBeNull();
        await expect(Promise.resolve(oldClient.refreshAccessToken!())).resolves.toBe(false);
        expect(mockRefreshMobile).toHaveBeenCalledTimes(calls);
        await act(async () => oldClient.onUnauthorized!());
        act(() => oldClient.onRequestError!(new TypeError('Late network error')));
        expect(result.current.pendingReconnection).toBe(false);
        expect(result.current.user?.id).toBe(8);
        expect(result.current.accessToken).toBe('new-access');
    });

    it('an already running refresh cannot restore its account after logout and sign-in', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const oldClient = mockClientOptions.filter((options) => options.getAccessToken).at(-1)!;
        let finish!: (payload: typeof AUTH_PAYLOAD) => void;
        mockRefreshMobile.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
        const pending = Promise.resolve(oldClient.refreshAccessToken!());
        await act(async () => result.current.clearLocalSession());
        mockLoginMobile.mockResolvedValue({ ...AUTH_PAYLOAD, access_token: 'new-access', refresh_token: 'new-refresh', user: { id: 8, email: 'new@example.com' } });
        await act(async () => { await result.current.login('new@example.com', 'secret'); });
        await act(async () => { finish({ ...AUTH_PAYLOAD, refresh_token: 'old-rotated-refresh' }); await expect(pending).rejects.toThrow('Authentication scope changed'); });
        expect(result.current.user?.id).toBe(8);
        expect(result.current.accessToken).toBe('new-access');
        expect(mockWriteStoredTokens).toHaveBeenLastCalledWith({ accessToken: 'new-access', refreshToken: 'new-refresh' });
        expect(mockLogoutMobile).toHaveBeenCalledWith('old-rotated-refresh');
    });

    it('normal same-session token refresh remains available', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const client = mockClientOptions.filter((options) => options.getAccessToken).at(-1)!;
        mockRefreshMobile.mockResolvedValueOnce({ ...AUTH_PAYLOAD, access_token: 'rotated-access' });
        await act(async () => { await expect(client.refreshAccessToken!()).resolves.toBe(true); });
        expect(client.getAccessToken!()).toBe('rotated-access');
    });

});

describe('native offline workspace restoration', () => {
    beforeEach(() => {
        mockGetClientConfig.mockReset().mockResolvedValue({ server_version: '1.2.0' });
        mockRefreshMobile.mockReset().mockResolvedValue(AUTH_PAYLOAD);
    });
    it.each(['network', 'provider'])('restores local tracking after restart during %s outage and reconnects', async (kind) => {
        const cache = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
        cache.setQueryData(['mobile-metrics'], [{ id: 1, weight: 72000 }]);
        await saveOfflineWorkspace('https://health.example', AUTH_PAYLOAD.user as never, cache);
        if (kind === 'network') mockGetClientConfig.mockRejectedValueOnce(new TypeError('Network unavailable'));
        else mockRefreshMobile.mockRejectedValueOnce(new (require('@calibrate/api-client').ApiError)(503, 'Authentication unavailable'));
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.user?.id).toBe(7);
        expect(result.current.pendingReconnection).toBe(true);
        expect(result.current.refreshToken).toBe('stored-refresh');
        await act(async () => { await result.current.recheckClientCompatibility(); });
        expect(result.current.pendingReconnection).toBe(false);
        expect(result.current.user?.id).toBe(7);
    });
    it('does not resurrect a confirmed rejected session on a later offline restart', async () => {
        await saveOfflineWorkspace('https://health.example', AUTH_PAYLOAD.user as never, new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
        mockRefreshMobile.mockRejectedValueOnce(new (require('@calibrate/api-client').ApiError)(401, 'Revoked'));
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.user).toBeNull();
        expect(await restoreOfflineWorkspace('https://health.example', new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }))).toBeNull();
    });
});


it('persists a verified user access update without waiting for another tracking query', async () => {
    mockGetClientConfig.mockResolvedValue({ server_version: '1.2.0' }); mockRefreshMobile.mockResolvedValue(AUTH_PAYLOAD);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    const updated = { ...result.current.user!, account_access: { state: 'full' } } as never;
    act(() => result.current.updateCurrentUser(updated));
    const restored = await restoreOfflineWorkspace('https://health.example', new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
    expect(restored?.account_access?.state).toBe('full');
});

it('keeps the established identity and enters reconnection after a completed timeout', async () => {
    mockGetClientConfig.mockResolvedValue({ server_version: '1.2.0' }); mockRefreshMobile.mockResolvedValue(AUTH_PAYLOAD);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    const observer = mockClientOptions.filter((options) => options.onRequestError).at(-1)?.onRequestError;
    expect(observer).toBeDefined();
    act(() => observer!(new Error('Request timed out while connecting to https://health.example')));
    expect(result.current.pendingReconnection).toBe(true);
    expect(result.current.user?.id).toBe(7);
});

it('does not restore native tokens from a refresh that finishes after logout', async () => {
    mockGetClientConfig.mockResolvedValue({ server_version: '1.2.0' });
    mockRefreshMobile.mockResolvedValue(AUTH_PAYLOAD);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    act(() => mockClientOptions.filter(options => options.onRequestError).at(-1)!.onRequestError!(new TypeError('Network unavailable')));
    let finish!: (value: unknown) => void;
    mockRefreshMobile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let reconnect!: Promise<boolean>;
    act(() => { reconnect = result.current.recheckClientCompatibility(); void reconnect.catch(() => undefined); });
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => result.current.logout());
    await act(async () => { finish({ ...AUTH_PAYLOAD, refresh_token: 'rotated-after-logout' }); await expect(reconnect).rejects.toThrow('Authentication scope changed'); });
    expect(result.current.user).toBeNull();
    expect(result.current.refreshToken).toBeNull();
    expect(mockLogoutMobile).toHaveBeenCalledWith('rotated-after-logout');
});

it('keeps native logout intent across offline restart and drains the old token before another account signs in', async () => {
    mockGetClientConfig.mockResolvedValue({ server_version: '1.2.0' });
    mockRefreshMobile.mockResolvedValue(AUTH_PAYLOAD);
    const first = renderAuth();
    await waitFor(() => expect(first.result.current.user?.id).toBe(7));
    mockLogoutMobile.mockRejectedValueOnce(new TypeError('Offline'));
    await act(async () => first.result.current.logout());
    expect(first.result.current.user).toBeNull();
    expect([...mockSecureLogoutStorage.values()].some(value => value.includes('refresh'))).toBe(true);
    first.unmount();
    mockRefreshMobile.mockClear();
    mockLogoutMobile.mockRejectedValueOnce(new TypeError('Still offline'));
    const second = renderAuth();
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.user).toBeNull();
    expect(mockRefreshMobile).not.toHaveBeenCalled();
    mockLogoutMobile.mockResolvedValue(undefined);
    mockLoginMobile.mockResolvedValue({ ...AUTH_PAYLOAD, user: { ...AUTH_PAYLOAD.user, id: 8 } });
    jest.mocked(testCalibrateServerConnection).mockResolvedValue({ ok: true, url: 'https://health.example', config: {} as never, message: 'Connected' });
    await act(async () => { expect(await second.result.current.login('other@example.com', 'password')).toBe(true); });
    expect(second.result.current.user?.id).toBe(8);
    expect(mockLogoutMobile).toHaveBeenLastCalledWith('refresh');
    expect([...mockSecureLogoutStorage.values()]).toEqual([]);
});


it('revokes the native session even when local draft cleanup fails', async () => {
    mockGetClientConfig.mockResolvedValue({ server_version: '1.2.0' });
    mockRefreshMobile.mockResolvedValue(AUTH_PAYLOAD);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    mockLogoutMobile.mockClear();
    jest.mocked(clearOnboardingDraft).mockRejectedValueOnce(new Error('Storage unavailable'));
    await act(async () => { await expect(result.current.logout()).rejects.toThrow('Storage unavailable'); });
    expect(result.current.user).toBeNull();
    expect(mockLogoutMobile).toHaveBeenCalledWith('refresh');
    expect([...mockSecureLogoutStorage.values()]).toEqual(['{"signedOut":true,"pending":false}']);
});


it('clears UI and revokes the native token when writing logout intent fails', async () => {
    mockGetClientConfig.mockResolvedValue({ server_version: '1.2.0' });
    mockRefreshMobile.mockResolvedValue(AUTH_PAYLOAD);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe(7));
    mockLogoutMobile.mockClear();
    jest.mocked(require('expo-secure-store').setItemAsync).mockRejectedValueOnce(new Error('Storage full'));
    await act(async () => result.current.logout());
    expect(result.current.user).toBeNull();
    expect(mockLogoutMobile).toHaveBeenCalledWith('refresh');
});
