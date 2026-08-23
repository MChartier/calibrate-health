import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetClientConfig = jest.fn();
const mockRefreshMobile = jest.fn();

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

import { writeStoredTokens } from './storage';
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
            .mockResolvedValueOnce({ server_version: '1.2.9' });
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
        expect(result.current.user).toBeNull();
        expect(mockRefreshMobile).not.toHaveBeenCalled();

        let compatible = false;
        await act(async () => {
            compatible = await result.current.recheckClientCompatibility();
        });

        expect(compatible).toBe(true);
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
