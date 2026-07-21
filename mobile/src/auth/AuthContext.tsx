import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    ApiError,
    CalibrateApiClient,
    type MobileAuthResponse,
    type UserClientPayload
} from '@calibrate/api-client';
import { MOBILE_DEVICE_PLATFORMS, type ClientUpgradeRequirement } from '@calibrate/shared';
import * as Application from 'expo-application';
import { useQueryClient } from '@tanstack/react-query';
import {
    INITIAL_SERVER_CONNECTION_STATE,
    normalizeServerUrl,
    testCalibrateServerConnection,
    type ServerConnectionResult,
    type ServerConnectionState
} from '../config/server';
import { authenticateAgainstConfirmedServer, confirmServerSwitch } from './serverSwitch';
import { getSessionRestoreErrorMessage, isExpectedDevAutoLoginMiss } from './authErrors';
import { MOBILE_CLIENT_IDENTITY } from '../config/nativeClient';
import {
    clearStoredTokens,
    getOrCreateDeviceId,
    readServerUrl,
    readStoredTokens,
    writeServerUrl,
    writeStoredTokens
} from './storage';
import {
    clearAccountDeletionCleanupNotice,
    assertAccountDeletionCleanupAcknowledged,
    readAccountDeletionCleanupNotice,
    writeAccountDeletionCleanupNotice,
    type AccountDeletionCleanupNotice
} from '../account/accountDeletionNotice';
import { DEV_TEST_EMAIL, DEV_TEST_PASSWORD, shouldDevAutoLogin } from './devAutoLogin';

type AuthContextValue = {
    api: CalibrateApiClient;
    user: UserClientPayload | null;
    accessToken: string | null;
    refreshToken: string | null;
    deviceId: string | null;
    serverUrl: string;
    isLoading: boolean;
    authError: string | null;
    clientUpgradeRequired: ClientUpgradeRequirement | null;
    accountDeletionCleanupNotice: AccountDeletionCleanupNotice | null;
    serverConnection: ServerConnectionState;
    updateCurrentUser: (user: UserClientPayload) => void;
    setServerUrl: (value: string) => Promise<boolean>;
    testServerUrl: (value: string) => Promise<boolean>;
    login: (email: string, password: string, serverCandidate: string) => Promise<boolean>;
    register: (email: string, password: string, serverCandidate: string) => Promise<boolean>;
    logout: () => Promise<void>;
    clearLocalSession: () => Promise<void>;
    recheckClientCompatibility: () => Promise<boolean>;
    persistAccountDeletionCleanupNotice: (notice: AccountDeletionCleanupNotice) => Promise<void>;
    acknowledgeAccountDeletionCleanupNotice: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const [serverUrl, setServerUrlState] = useState('');
    const [user, setUser] = useState<UserClientPayload | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [clientUpgradeRequired, setClientUpgradeRequired] = useState<ClientUpgradeRequirement | null>(null);
    const [accountDeletionCleanupNotice, setAccountDeletionCleanupNotice] =
        useState<AccountDeletionCleanupNotice | null>(null);
    const [serverConnection, setServerConnection] = useState<ServerConnectionState>(INITIAL_SERVER_CONNECTION_STATE);
    const accessTokenRef = useRef<string | null>(null);
    const refreshTokenRef = useRef<string | null>(null);
    const serverTestRequestRef = useRef(0);

    const clearSession = useCallback(async () => {
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        accessTokenRef.current = null;
        refreshTokenRef.current = null;
        setClientUpgradeRequired(null);
        await clearStoredTokens();
        queryClient.clear();
    }, [queryClient]);

    const handleClientUpgradeRequired = useCallback((requirement: ClientUpgradeRequirement) => {
        // Keep credentials and offline state intact so an in-place app update can resume the same session.
        setClientUpgradeRequired(requirement);
    }, []);

    const persistAuthPayload = useCallback(async (payload: {
        user: UserClientPayload;
        access_token: string;
        refresh_token: string;
    }) => {
        setUser(payload.user);
        setAccessToken(payload.access_token);
        setRefreshToken(payload.refresh_token);
        setClientUpgradeRequired(null);
        accessTokenRef.current = payload.access_token;
        refreshTokenRef.current = payload.refresh_token;
        await writeStoredTokens({
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token
        });
    }, []);

    const refreshAccessToken = useCallback(async (): Promise<boolean> => {
        const currentRefreshToken = refreshTokenRef.current;
        if (!currentRefreshToken) return false;

        const refreshClient = new CalibrateApiClient({
            baseUrl: serverUrl || 'https://calibratehealth.app',
            clientIdentity: MOBILE_CLIENT_IDENTITY,
            onClientUpgradeRequired: handleClientUpgradeRequired
        });
        try {
            const refreshed = await refreshClient.refreshMobile<MobileAuthResponse>(currentRefreshToken);
            await persistAuthPayload(refreshed);
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) return false;
            throw error;
        }
    }, [handleClientUpgradeRequired, persistAuthPayload, serverUrl]);

    const api = useMemo(
        () =>
            new CalibrateApiClient({
                baseUrl: serverUrl || 'https://calibratehealth.app',
                clientIdentity: MOBILE_CLIENT_IDENTITY,
                onClientUpgradeRequired: handleClientUpgradeRequired,
                getAccessToken: () => accessTokenRef.current,
                refreshAccessToken,
                onUnauthorized: clearSession
            }),
        [clearSession, handleClientUpgradeRequired, refreshAccessToken, serverUrl]
    );

    const getDevTestUserAuthPayload = useCallback(async (
        baseUrl: string,
        nextDeviceId: string
    ): Promise<MobileAuthResponse | null> => {
        const bootstrapClient = new CalibrateApiClient({
            baseUrl,
            clientIdentity: MOBILE_CLIENT_IDENTITY,
            onClientUpgradeRequired: handleClientUpgradeRequired
        });
        try {
            // Trigger the backend's existing dev auto-login/seed path when enabled.
            await bootstrapClient.getMe();
        } catch {
            // If cookie auto-login is disabled, the deterministic password path can still work
            // against an already-seeded local database.
        }

        let payload: MobileAuthResponse;
        try {
            payload = await bootstrapClient.loginMobile({
                email: DEV_TEST_EMAIL,
                password: DEV_TEST_PASSWORD,
                device_id: nextDeviceId,
                device_platform: MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE,
                device_name: Application.applicationName ?? 'Android device'
            });
        } catch (error) {
            if (isExpectedDevAutoLoginMiss(error)) return null;
            throw error;
        }
        return payload;
    }, [handleClientUpgradeRequired]);

    useEffect(() => {
        let isMounted = true;

        async function hydrate() {
            try {
                const [storedServerUrl, tokens, nextDeviceId, storedCleanupNotice] = await Promise.all([
                    readServerUrl(),
                    readStoredTokens(),
                    getOrCreateDeviceId(),
                    readAccountDeletionCleanupNotice().catch(() => null)
                ]);
                if (!isMounted) return;

                setServerUrlState(storedServerUrl);
                setDeviceId(nextDeviceId);
                setAccountDeletionCleanupNotice(storedCleanupNotice);
                if (storedCleanupNotice) {
                    setAccessToken(null);
                    setRefreshToken(null);
                    accessTokenRef.current = null;
                    refreshTokenRef.current = null;
                    await clearStoredTokens().catch(() => undefined);
                    return;
                }
                setAccessToken(tokens.accessToken);
                setRefreshToken(tokens.refreshToken);
                accessTokenRef.current = tokens.accessToken;
                refreshTokenRef.current = tokens.refreshToken;

                if (tokens.refreshToken) {
                    const bootstrapClient = new CalibrateApiClient({
                        baseUrl: storedServerUrl,
                        clientIdentity: MOBILE_CLIENT_IDENTITY,
                        onClientUpgradeRequired: handleClientUpgradeRequired
                    });
                    try {
                        const refreshed = await bootstrapClient.refreshMobile<MobileAuthResponse>(tokens.refreshToken);
                        if (isMounted) {
                            await persistAuthPayload(refreshed);
                        }
                        return;
                    } catch (refreshError) {
                        if (!shouldDevAutoLogin(storedServerUrl)) {
                            throw refreshError;
                        }
                        await clearStoredTokens();
                    }
                }

                if (shouldDevAutoLogin(storedServerUrl)) {
                    const devAuthPayload = await getDevTestUserAuthPayload(storedServerUrl, nextDeviceId);
                    if (isMounted && devAuthPayload) {
                        await persistAuthPayload(devAuthPayload);
                    }
                }
            } catch (error) {
                if (isMounted) {
                    setAuthError(getSessionRestoreErrorMessage(error));
                    // Only a rejected refresh invalidates stored credentials; offline startup should be retryable.
                    if (error instanceof ApiError && error.status === 401) {
                        await clearSession();
                    }
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void hydrate();

        return () => {
            isMounted = false;
        };
    }, [clearSession, getDevTestUserAuthPayload, handleClientUpgradeRequired, persistAuthPayload]);

    const recheckClientCompatibility = useCallback(async (): Promise<boolean> => {
        try {
            await api.getClientConfig();
            setClientUpgradeRequired(null);
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 426) return false;
            throw error;
        }
    }, [api]);

    const probeServerUrl = useCallback(async (value: string): Promise<ServerConnectionResult> => {
        const requestId = serverTestRequestRef.current + 1;
        serverTestRequestRef.current = requestId;
        const normalized = normalizeServerUrl(value);
        setServerConnection({
            status: 'testing',
            testedInput: value.trim(),
            testedUrl: normalized,
            message: 'Testing this Calibrate server...'
        });

        const result = await testCalibrateServerConnection(value, {
            mobileVersion: Application.nativeApplicationVersion
        });
        if (serverTestRequestRef.current === requestId) {
            setServerConnection({
                status: result.ok ? 'connected' : 'error',
                testedInput: value.trim(),
                testedUrl: result.url,
                message: result.message
            });
        }
        return result;
    }, []);

    const testServerUrl = useCallback(async (value: string): Promise<boolean> => {
        const result = await probeServerUrl(value);
        if (result.ok) setAuthError(null);
        return result.ok;
    }, [probeServerUrl]);

    const confirmSelectedServerUrl = useCallback(async (value: string): Promise<ServerConnectionResult> => {
        const result = await confirmServerSwitch({
            candidate: value,
            currentServerUrl: serverUrl,
            testConnection: probeServerUrl,
            clearCurrentSession: clearSession,
            persistServerUrl: writeServerUrl
        });
        if (!result.ok) {
            setAuthError(result.message);
            return result;
        }

        setServerUrlState(result.url);
        setAuthError(null);
        return result;
    }, [clearSession, probeServerUrl, serverUrl]);

    const updateServerUrl = useCallback(async (value: string): Promise<boolean> => {
        const result = await confirmSelectedServerUrl(value);
        return result.ok;
    }, [confirmSelectedServerUrl]);

    const updateCurrentUser = useCallback((nextUser: UserClientPayload) => {
        setUser(nextUser);
    }, []);

    const login = useCallback(
        async (email: string, password: string, serverCandidate: string): Promise<boolean> => {
            assertAccountDeletionCleanupAcknowledged(accountDeletionCleanupNotice);
            const nextDeviceId = deviceId ?? (await getOrCreateDeviceId());
            setDeviceId(nextDeviceId);
            const payload = await authenticateAgainstConfirmedServer({
                candidate: serverCandidate,
                confirmServer: confirmSelectedServerUrl,
                authenticate: (confirmedServerUrl) => {
                    const authClient = new CalibrateApiClient({
                        baseUrl: confirmedServerUrl,
                        clientIdentity: MOBILE_CLIENT_IDENTITY,
                        onClientUpgradeRequired: handleClientUpgradeRequired
                    });
                    return authClient.loginMobile({
                        email,
                        password,
                        device_id: nextDeviceId,
                        device_platform: MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE,
                        device_name: Application.applicationName ?? 'Android device'
                    });
                }
            });
            if (!payload) return false;

            await persistAuthPayload(payload);
            return true;
        },
        [accountDeletionCleanupNotice, confirmSelectedServerUrl, deviceId, handleClientUpgradeRequired, persistAuthPayload]
    );

    const register = useCallback(
        async (email: string, password: string, serverCandidate: string): Promise<boolean> => {
            assertAccountDeletionCleanupAcknowledged(accountDeletionCleanupNotice);
            const nextDeviceId = deviceId ?? (await getOrCreateDeviceId());
            setDeviceId(nextDeviceId);
            const payload = await authenticateAgainstConfirmedServer({
                candidate: serverCandidate,
                confirmServer: confirmSelectedServerUrl,
                authenticate: (confirmedServerUrl) => {
                    const authClient = new CalibrateApiClient({
                        baseUrl: confirmedServerUrl,
                        clientIdentity: MOBILE_CLIENT_IDENTITY,
                        onClientUpgradeRequired: handleClientUpgradeRequired
                    });
                    return authClient.registerMobile({
                        email,
                        password,
                        device_id: nextDeviceId,
                        device_platform: MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE,
                        device_name: Application.applicationName ?? 'Android device'
                    });
                }
            });
            if (!payload) return false;

            await persistAuthPayload(payload);
            return true;
        },
        [accountDeletionCleanupNotice, confirmSelectedServerUrl, deviceId, handleClientUpgradeRequired, persistAuthPayload]
    );

    const logout = useCallback(async () => {
        try {
            await api.logoutMobile(refreshTokenRef.current ?? undefined);
        } finally {
            await clearSession();
        }
    }, [api, clearSession]);

    const persistAccountDeletionCleanupNotice = useCallback(async (notice: AccountDeletionCleanupNotice) => {
        // Update the mounted auth shell first so guidance remains visible even if durable storage is unavailable.
        setAccountDeletionCleanupNotice(notice);
        await writeAccountDeletionCleanupNotice(notice);
    }, []);

    const acknowledgeAccountDeletionCleanupNotice = useCallback(async () => {
        await clearAccountDeletionCleanupNotice();
        setAccountDeletionCleanupNotice(null);
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            api,
            user,
            accessToken,
            refreshToken,
            deviceId,
            serverUrl,
            isLoading,
            authError,
            clientUpgradeRequired,
            accountDeletionCleanupNotice,
            serverConnection,
            updateCurrentUser,
            setServerUrl: updateServerUrl,
            testServerUrl,
            login,
            register,
            logout,
            clearLocalSession: clearSession,
            recheckClientCompatibility,
            persistAccountDeletionCleanupNotice,
            acknowledgeAccountDeletionCleanupNotice
        }),
        [accessToken, accountDeletionCleanupNotice, acknowledgeAccountDeletionCleanupNotice, api, authError, clearSession, clientUpgradeRequired, deviceId, isLoading, login, logout, persistAccountDeletionCleanupNotice, recheckClientCompatibility, refreshToken, register, serverConnection, serverUrl, testServerUrl, updateCurrentUser, updateServerUrl, user]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
