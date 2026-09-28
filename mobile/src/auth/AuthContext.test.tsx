import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetClientConfig = jest.fn();
const mockRefreshMobile = jest.fn();
const mockLoginMobile = jest.fn();
const mockLogoutMobile = jest.fn(async () => undefined);

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
            getClientConfig = (...args: unknown[]) => mockGetClientConfig(...args);
            refreshMobile = (...args: unknown[]) => mockRefreshMobile(...args);
            loginMobile = (...args: unknown[]) => mockLoginMobile(...args);
            logoutMobile = () => mockLogoutMobile();
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

import { writeStoredTokens, clearStoredTokens } from './storage';
import { clearOnboardingDraft } from '../onboarding/draftStorage';
import { testCalibrateServerConnection } from '../config/server';
import { AuthProvider, useAuth } from './AuthContext';

const mockWriteStoredTokens = jest.mocked(writeStoredTokens);

describe('AuthProvider client/server compatibility recovery', () => {
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
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
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
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
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
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
        await act(async () => { await result.current.login('person@example.com', 'password', 'https://health.example'); });
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
        mockLoginMobile.mockResolvedValue({ ...AUTH_PAYLOAD, user: { id: 8, email: 'another@example.com' } });
        await act(async () => { await result.current.login('another@example.com', 'password', 'https://health.example'); });
        expect(clearOnboardingDraft).toHaveBeenCalledWith('https://health.example', 7);
        expect(result.current.user?.id).toBe(8);
    });

    it('preserves the draft after a failed server probe and clears it for a confirmed switch', async () => {
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        jest.mocked(testCalibrateServerConnection).mockResolvedValueOnce({ ok: false, url: null, code: 'unreachable', message: 'Offline' });
        await act(async () => { await result.current.setServerUrl('https://other.example'); });
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
        jest.mocked(testCalibrateServerConnection).mockResolvedValueOnce({ ok: true, url: 'https://other.example', config: {} as never, message: 'Connected' });
        await act(async () => { await result.current.setServerUrl('https://other.example'); });
        expect(clearOnboardingDraft).toHaveBeenCalledWith('https://health.example', 7);
        expect(result.current.serverUrl).toBe('https://other.example');
    });

    it('does not clear saved progress for a transient startup network failure', async () => {
        mockGetClientConfig.mockRejectedValueOnce(new Error('Network unavailable'));
        const { result } = renderAuth();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(clearOnboardingDraft).not.toHaveBeenCalled();
        expect(clearStoredTokens).not.toHaveBeenCalled();
    });
});
