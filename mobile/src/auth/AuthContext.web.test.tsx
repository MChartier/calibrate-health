jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveOfflineWorkspace, restoreOfflineWorkspace } from './offlineWorkspace';
beforeEach(async () => { await AsyncStorage.clear(); });
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockLoginBrowser = jest.fn();
const mockLogoutBrowser = jest.fn(async () => undefined);
const mockRestoreSession = jest.fn();
const mockGetMe = jest.fn();
jest.mock('@calibrate/api-client', () => ({
    ApiError: class extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } },
    CalibrateApiClient: class {
        getMe = (...args: unknown[]) => mockGetMe(...args);
        loginBrowser = (...args: unknown[]) => mockLoginBrowser(...args);
        logoutBrowser = () => mockLogoutBrowser();
    }
}));
jest.mock('../config/server', () => ({
    getDefaultServerUrl: () => 'https://health.example',
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
        await act(async () => { await result.current.login('person@example.com', 'password', 'https://health.example'); });
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
        mockLoginBrowser.mockResolvedValue({ user: { ...USER, id: 8 } });
        await act(async () => { await result.current.login('another@example.com', 'password', 'https://health.example'); });
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
