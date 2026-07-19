import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, CalibrateApiClient, type UserClientPayload } from '@calibrate/api-client';
import { useQueryClient } from '@tanstack/react-query';
import type { ClientUpgradeRequirement } from '@calibrate/shared';
import {
    INITIAL_SERVER_CONNECTION_STATE,
    normalizeServerUrl,
    testCalibrateServerConnection,
    type ServerConnectionResult,
    type ServerConnectionState
} from '../config/server';
import { authenticateAgainstConfirmedServer, confirmServerSwitch } from './serverSwitch';
import { getSessionRestoreErrorMessage } from './authErrors';
import { readBrowserServerUrl, writeBrowserServerUrl } from './browserServerStorage';
import type { AccountDeletionCleanupNotice } from '../account/accountDeletionNotice';
import { cleanupBrowserPushBeforeSessionChange } from '../notifications/browserPush.web';

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

/** Browser auth intentionally relies only on the server's HttpOnly cookie session. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const [serverUrl, setServerUrlState] = useState(readBrowserServerUrl);
    const [user, setUser] = useState<UserClientPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [serverConnection, setServerConnection] = useState<ServerConnectionState>(INITIAL_SERVER_CONNECTION_STATE);
    const requestId = useRef(0);

    const clearSession = useCallback(async () => {
        setUser(null);
        setAuthError(null);
        queryClient.clear();
    }, [queryClient]);

    const clearSessionWithBrowserCleanup = useCallback(async () => {
        await cleanupBrowserPushBeforeSessionChange();
        await clearSession();
    }, [clearSession]);

    const api = useMemo(() => new CalibrateApiClient({
        baseUrl: serverUrl,
        requestCredentials: 'include',
        onUnauthorized: clearSession
    }), [clearSession, serverUrl]);

    useEffect(() => {
        let active = true;
        void api.getMe().then(({ user: nextUser }) => {
            if (active) setUser(nextUser);
        }).catch((error: unknown) => {
            if (!active || (error instanceof ApiError && error.status === 401)) return;
            setAuthError(getSessionRestoreErrorMessage(error));
        }).finally(() => {
            if (active) setIsLoading(false);
        });
        return () => { active = false; };
    }, [api]);

    const probeServerUrl = useCallback(async (value: string): Promise<ServerConnectionResult> => {
        const currentRequest = requestId.current + 1;
        requestId.current = currentRequest;
        const normalized = normalizeServerUrl(value);
        setServerConnection({
            status: 'testing',
            testedInput: value.trim(),
            testedUrl: normalized,
            message: 'Testing this Calibrate server...'
        });
        const result = await testCalibrateServerConnection(value);
        if (requestId.current === currentRequest) {
            setServerConnection({
                status: result.ok ? 'connected' : 'error',
                testedInput: value.trim(),
                testedUrl: result.url,
                message: result.message
            });
        }
        return result;
    }, []);

    const confirmSelectedServerUrl = useCallback(async (value: string) => {
        const result = await confirmServerSwitch({
            candidate: value,
            currentServerUrl: serverUrl,
            testConnection: probeServerUrl,
            clearCurrentSession: clearSessionWithBrowserCleanup,
            persistServerUrl: writeBrowserServerUrl
        });
        if (result.ok) {
            setServerUrlState(result.url);
            setAuthError(null);
        } else {
            setAuthError(result.message);
        }
        return result;
    }, [clearSessionWithBrowserCleanup, probeServerUrl, serverUrl]);

    const login = useCallback(async (email: string, password: string, serverCandidate: string) => {
        const payload = await authenticateAgainstConfirmedServer({
            candidate: serverCandidate,
            confirmServer: confirmSelectedServerUrl,
            authenticate: (baseUrl) => new CalibrateApiClient({
                baseUrl,
                requestCredentials: 'include'
            }).loginBrowser({ email, password })
        });
        if (!payload) return false;
        setUser(payload.user);
        return true;
    }, [confirmSelectedServerUrl]);

    const register = useCallback(async (email: string, password: string, serverCandidate: string) => {
        const payload = await authenticateAgainstConfirmedServer({
            candidate: serverCandidate,
            confirmServer: confirmSelectedServerUrl,
            authenticate: (baseUrl) => new CalibrateApiClient({
                baseUrl,
                requestCredentials: 'include'
            }).registerBrowser({ email, password })
        });
        if (!payload) return false;
        setUser(payload.user);
        return true;
    }, [confirmSelectedServerUrl]);

    const logout = useCallback(async () => {
        try {
            await cleanupBrowserPushBeforeSessionChange();
            await api.logoutBrowser();
        } finally {
            await clearSession();
        }
    }, [api, clearSession]);

    const recheckClientCompatibility = useCallback(async () => {
        await api.getClientConfig();
        return true;
    }, [api]);

    const value = useMemo<AuthContextValue>(() => ({
        api,
        user,
        accessToken: null,
        refreshToken: null,
        deviceId: null,
        serverUrl,
        isLoading,
        authError,
        clientUpgradeRequired: null,
        accountDeletionCleanupNotice: null,
        serverConnection,
        updateCurrentUser: setUser,
        setServerUrl: async (value) => (await confirmSelectedServerUrl(value)).ok,
        testServerUrl: async (value) => (await probeServerUrl(value)).ok,
        login,
        register,
        logout,
        clearLocalSession: clearSessionWithBrowserCleanup,
        recheckClientCompatibility,
        persistAccountDeletionCleanupNotice: async () => undefined,
        acknowledgeAccountDeletionCleanupNotice: async () => undefined
    }), [api, authError, clearSessionWithBrowserCleanup, confirmSelectedServerUrl, isLoading, login, logout, probeServerUrl, recheckClientCompatibility, register, serverConnection, serverUrl, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
