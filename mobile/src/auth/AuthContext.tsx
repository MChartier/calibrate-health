import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CalibrateApiClient, type UserClientPayload } from '@calibrate/api-client';
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

    const api = useMemo(
        () =>
            new CalibrateApiClient({
                baseUrl: serverUrl || 'https://calibratehealth.app',
                getAccessToken: () => accessTokenRef.current,
                onUnauthorized: clearSession
            }),
        [clearSession, serverUrl]
    );

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
                    const refreshed = await bootstrapClient.refreshMobile(tokens.refreshToken);
                    if (isMounted) {
                        await persistAuthPayload(refreshed);
                    }
                }
            } catch (error) {
                if (isMounted) {
                    setAuthError(error instanceof Error ? error.message : 'Unable to restore session.');
                    await clearSession();
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
    }, [clearSession, persistAuthPayload]);

    const updateServerUrl = useCallback(async (value: string): Promise<boolean> => {
        const normalized = normalizeServerUrl(value);
        if (!normalized) {
            setAuthError('Enter a valid http or https server URL.');
            return false;
        }

        setServerUrlState(normalized);
        await writeServerUrl(normalized);
        setAuthError(null);
        return true;
    }, []);

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
