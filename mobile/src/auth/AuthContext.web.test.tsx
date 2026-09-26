import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockLoginBrowser = jest.fn();
const mockLogoutBrowser = jest.fn(async () => undefined);
const mockRestoreSession = jest.fn();
jest.mock('@calibrate/api-client', () => ({
    ApiError: class extends Error { status = 401; },
    CalibrateApiClient: class {
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
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
