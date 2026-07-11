import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, CalibrateApiClient, type UserClientPayload } from '@calibrate/api-client';
import { MOBILE_DEVICE_PLATFORMS } from '@calibrate/shared';
import * as Application from 'expo-application';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeServerUrl } from '../config/server';
import {
    clearStoredTokens,
    getOrCreateDeviceId,
    readServerUrl,
    readStoredTokens,
    writeServerUrl,
    writeStoredTokens
} from './storage';

type AuthContextValue = {
    api: CalibrateApiClient;
    user: UserClientPayload | null;
    accessToken: string | null;
    refreshToken: string | null;
    deviceId: string | null;
    serverUrl: string;
    isLoading: boolean;
    authError: string | null;
    updateCurrentUser: (user: UserClientPayload) => void;
    setServerUrl: (value: string) => Promise<boolean>;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const DEV_TEST_EMAIL = 'test@calibratehealth.app';
const DEV_TEST_PASSWORD = 'password123';

function isLanOrLoopbackHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '10.0.2.2') {
        return true;
    }

    if (normalized.startsWith('192.168.') || normalized.startsWith('10.')) {
        return true;
    }

    const private172Match = /^172\.(1[6-9]|2\d|3[01])\./.test(normalized);
    return private172Match;
}

/**
 * Native auth cannot inherit the backend's cookie-session dev auto-login, so
 * local Expo builds mint a normal mobile token for the deterministic test user.
 */
function shouldDevAutoLoginMobile(serverUrl: string): boolean {
    if (!__DEV__) {
        return false;
    }

    try {
        const url = new URL(serverUrl);
        return isLanOrLoopbackHost(url.hostname);
    } catch {
        return false;
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const [serverUrl, setServerUrlState] = useState('');
    const [user, setUser] = useState<UserClientPayload | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const accessTokenRef = useRef<string | null>(null);
    const refreshTokenRef = useRef<string | null>(null);

    const clearSession = useCallback(async () => {
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        accessTokenRef.current = null;
        refreshTokenRef.current = null;
        await clearStoredTokens();
        queryClient.clear();
    }, [queryClient]);

    const persistAuthPayload = useCallback(async (payload: {
        user: UserClientPayload;
        access_token: string;
        refresh_token: string;
    }) => {
        setUser(payload.user);
        setAccessToken(payload.access_token);
        setRefreshToken(payload.refresh_token);
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
            baseUrl: serverUrl || 'https://calibratehealth.app'
        });
        try {
            const refreshed = await refreshClient.refreshMobile(currentRefreshToken);
            await persistAuthPayload(refreshed);
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) return false;
            throw error;
        }
    }, [persistAuthPayload, serverUrl]);

    const api = useMemo(
        () =>
            new CalibrateApiClient({
                baseUrl: serverUrl || 'https://calibratehealth.app',
                getAccessToken: () => accessTokenRef.current,
                refreshAccessToken,
                onUnauthorized: clearSession
            }),
        [clearSession, refreshAccessToken, serverUrl]
    );

    const loginDevTestUser = useCallback(async (baseUrl: string, nextDeviceId: string) => {
        const bootstrapClient = new CalibrateApiClient({ baseUrl });
        try {
            // Trigger the backend's existing dev auto-login/seed path when enabled.
            await bootstrapClient.getMe();
        } catch {
            // If cookie auto-login is disabled, the deterministic password path can still work
            // against an already-seeded local database.
        }

        const payload = await bootstrapClient.loginMobile({
            email: DEV_TEST_EMAIL,
            password: DEV_TEST_PASSWORD,
            device_id: nextDeviceId,
            device_platform: MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE,
            device_name: Application.applicationName ?? 'Android device'
        });
        await persistAuthPayload(payload);
    }, [persistAuthPayload]);

    useEffect(() => {
        let isMounted = true;

        async function hydrate() {
            try {
                const [storedServerUrl, tokens, nextDeviceId] = await Promise.all([
                    readServerUrl(),
                    readStoredTokens(),
                    getOrCreateDeviceId()
                ]);
                if (!isMounted) return;

                setServerUrlState(storedServerUrl);
                setDeviceId(nextDeviceId);
                setAccessToken(tokens.accessToken);
                setRefreshToken(tokens.refreshToken);
                accessTokenRef.current = tokens.accessToken;
                refreshTokenRef.current = tokens.refreshToken;

                if (tokens.refreshToken) {
                    const bootstrapClient = new CalibrateApiClient({ baseUrl: storedServerUrl });
                    try {
                        const refreshed = await bootstrapClient.refreshMobile(tokens.refreshToken);
                        if (isMounted) {
                            await persistAuthPayload(refreshed);
                        }
                        return;
                    } catch (refreshError) {
                        if (!shouldDevAutoLoginMobile(storedServerUrl)) {
                            throw refreshError;
                        }
                        await clearStoredTokens();
                    }
                }

                if (shouldDevAutoLoginMobile(storedServerUrl)) {
                    await loginDevTestUser(storedServerUrl, nextDeviceId);
                }
            } catch (error) {
                if (isMounted) {
                    setAuthError(error instanceof Error ? error.message : 'Unable to restore session.');
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
    }, [clearSession, loginDevTestUser, persistAuthPayload]);

    const updateServerUrl = useCallback(async (value: string): Promise<boolean> => {
        const normalized = normalizeServerUrl(value);
        if (!normalized) {
            setAuthError('Enter a valid http or https server URL.');
            return false;
        }

        if (normalized !== serverUrl) {
            // Credentials are scoped to one self-hosted server and must never follow a server switch.
            await clearSession();
        }
        setServerUrlState(normalized);
        await writeServerUrl(normalized);
        setAuthError(null);
        return true;
    }, [clearSession, serverUrl]);

    const updateCurrentUser = useCallback((nextUser: UserClientPayload) => {
        setUser(nextUser);
    }, []);

    const login = useCallback(
        async (email: string, password: string) => {
            const nextDeviceId = deviceId ?? (await getOrCreateDeviceId());
            setDeviceId(nextDeviceId);
            const payload = await api.loginMobile({
                email,
                password,
                device_id: nextDeviceId,
                device_platform: MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE,
                device_name: Application.applicationName ?? 'Android device'
            });
            await persistAuthPayload(payload);
        },
        [api, deviceId, persistAuthPayload]
    );

    const register = useCallback(
        async (email: string, password: string) => {
            const nextDeviceId = deviceId ?? (await getOrCreateDeviceId());
            setDeviceId(nextDeviceId);
            const payload = await api.registerMobile({
                email,
                password,
                device_id: nextDeviceId,
                device_platform: MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE,
                device_name: Application.applicationName ?? 'Android device'
            });
            await persistAuthPayload(payload);
        },
        [api, deviceId, persistAuthPayload]
    );

    const logout = useCallback(async () => {
        try {
            await api.logoutMobile(refreshTokenRef.current ?? undefined);
        } finally {
            await clearSession();
        }
    }, [api, clearSession]);

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
            updateCurrentUser,
            setServerUrl: updateServerUrl,
            login,
            register,
            logout
        }),
        [accessToken, api, authError, deviceId, isLoading, login, logout, refreshToken, register, serverUrl, updateCurrentUser, updateServerUrl, user]
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
