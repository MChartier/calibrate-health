const mockSecureLogoutStorage = new Map<string, string>();
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async (key: string) => mockSecureLogoutStorage.get(key) ?? null), setItemAsync: jest.fn(async (key: string, value: string) => { mockSecureLogoutStorage.set(key, value); }), deleteItemAsync: jest.fn(async (key: string) => { mockSecureLogoutStorage.delete(key); }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveOfflineWorkspace, restoreOfflineWorkspace } from "C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/auth/offlineWorkspace";
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

jest.mock("C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/config/nativeClient", () => ({
    MOBILE_CLIENT_IDENTITY: { platform: 'android_phone', version: '0.2.6' },
    MOBILE_SERVER_RELEASE_VERSION: '1.2.0'
}));

jest.mock("C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/auth/storage", () => ({
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

jest.mock("C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/account/accountDeletionNotice", () => ({
    assertAccountDeletionCleanupAcknowledged: jest.fn(),
    clearAccountDeletionCleanupNotice: jest.fn(async () => undefined),
    readAccountDeletionCleanupNotice: jest.fn(async () => null),
    writeAccountDeletionCleanupNotice: jest.fn(async () => undefined)
}));

jest.mock("C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/auth/devAutoLogin", () => ({
    DEV_TEST_EMAIL: 'test@example.com',
    DEV_TEST_PASSWORD: 'password',
    shouldDevAutoLogin: () => false
}));

jest.mock("C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/onboarding/draftStorage", () => ({ clearOnboardingDraft: jest.fn(async () => undefined) }));
jest.mock("C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/config/server", () => ({
    ...jest.requireActual("C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/config/server"),
    testCalibrateServerConnection: jest.fn()
}));

import { writeStoredTokens, clearStoredTokens, readServerUrl } from "C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/auth/storage";
import { clearOnboardingDraft } from "C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/onboarding/draftStorage";
import { testCalibrateServerConnection } from "C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/config/server";
import { AuthProvider, useAuth } from "C:/Users/MChar/Documents/Codex/2026-10-08/task-7/calibrate-auth-qa/mobile/src/auth/AuthContext";

const mockWriteStoredTokens = jest.mocked(writeStoredTokens);

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


it('QA late native login after provider remount cannot overwrite replacement credentials', async () => {
 mockGetClientConfig.mockResolvedValue({server_version:'1.2.0'});mockRefreshMobile.mockResolvedValue(AUTH_PAYLOAD);
 jest.mocked(testCalibrateServerConnection).mockResolvedValue({ok:true,url:'https://health.example',config:{} as never,message:'Connected'});
 const first=renderAuth();await waitFor(()=>expect(first.result.current.user?.id).toBe(7));
 let finish!: (v:typeof AUTH_PAYLOAD)=>void;mockLoginMobile.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 let pending!:Promise<boolean>;act(()=>{pending=first.result.current.login('old@example.invalid','synthetic')});await waitFor(()=>expect(finish).toBeDefined());
 first.unmount();const second=renderAuth();await waitFor(()=>expect(second.result.current.isLoading).toBe(false));
 mockLoginMobile.mockResolvedValueOnce({...AUTH_PAYLOAD,user:{id:8,email:'new@example.invalid'},access_token:'replacement-access',refresh_token:'replacement-refresh'});
 await act(async()=>{await second.result.current.login('new@example.invalid','synthetic')});expect(second.result.current.user?.id).toBe(8);
 await act(async()=>{finish({...AUTH_PAYLOAD,access_token:'late-old-access',refresh_token:'late-old-refresh'});await pending});
 expect(mockWriteStoredTokens).toHaveBeenLastCalledWith({accessToken:'replacement-access',refreshToken:'replacement-refresh'});
});
