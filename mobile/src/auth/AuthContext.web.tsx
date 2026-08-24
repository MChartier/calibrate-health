import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, CalibrateApiClient, type UserClientPayload } from '@calibrate/api-client';
import { useQueryClient } from '@tanstack/react-query';
import type { ClientUpgradeRequirement } from '@calibrate/shared';
import type { ClientServerMajorVersionMismatch } from '@calibrate/shared/releaseCompatibility';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '@calibrate/shared/legalVersions';
import {
    getDefaultServerUrl,
    INITIAL_SERVER_CONNECTION_STATE,
    testCalibrateServerConnection,
    type ServerConnectionResult,
    type ServerConnectionState
} from '../config/server';
import { authenticateAgainstConfirmedServer } from './serverSwitch';
import { getSessionRestoreErrorMessage } from './authErrors';
import type { AccountDeletionCleanupNotice } from '../account/accountDeletionNotice';
import { cleanupBrowserPushBeforeSessionChange } from '../notifications/browserPush.web';
import { restoreBrowserDevelopmentSession } from './devAutoLogin';
import { clearBrowserUserScopedCaches } from '../pwa/cacheIsolation.web';
import { requireRegistrationLegalAcceptance, requiresHostedLegalAcceptance, type RegistrationLegalAcceptance } from './accountAccess';

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
    clientServerIncompatibility: ClientServerMajorVersionMismatch | null;
    accountDeletionCleanupNotice: AccountDeletionCleanupNotice | null;
    serverConnection: ServerConnectionState;
    updateCurrentUser: (user: UserClientPayload) => void;
    setServerUrl: (value: string) => Promise<boolean>;
    testServerUrl: (value: string) => Promise<boolean>;
    login: (email: string, password: string, serverCandidate: string) => Promise<boolean>;
    register: (email: string, password: string, serverCandidate: string, acceptance: RegistrationLegalAcceptance) => Promise<boolean>;
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
    const [serverUrl] = useState(getDefaultServerUrl);
    const [user, setUser] = useState<UserClientPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [serverConnection, setServerConnection] = useState<ServerConnectionState>(INITIAL_SERVER_CONNECTION_STATE);
    const requestId = useRef(0);

    const clearSession = useCallback(async () => {
        setUser(null);
        setAuthError(null);
        queryClient.clear();
        await clearBrowserUserScopedCaches();
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
        setIsLoading(true);
        void restoreBrowserDevelopmentSession(api, serverUrl).then(({ user: nextUser }) => {
            if (active) setUser(nextUser);
        }).catch((error: unknown) => {
            if (!active || (error instanceof ApiError && error.status === 401)) return;
            setAuthError(getSessionRestoreErrorMessage(error));
        }).finally(() => {
            if (active) setIsLoading(false);
        });
        return () => { active = false; };
    }, [api, serverUrl]);

    const probeCurrentServer = useCallback(async (): Promise<ServerConnectionResult> => {
        const currentRequest = requestId.current + 1;
        requestId.current = currentRequest;
        setServerConnection({
            status: 'testing',
            testedInput: serverUrl,
            testedUrl: serverUrl,
            message: 'Testing this Calibrate server...'
        });
        const result = await testCalibrateServerConnection(serverUrl);
        if (requestId.current === currentRequest) {
            setServerConnection({
                status: result.ok ? 'connected' : 'error',
                testedInput: serverUrl,
                testedUrl: result.url,
                message: result.message
            });
        }
        return result;
    }, [serverUrl]);

    const confirmCurrentServer = useCallback(async () => {
        const result = await probeCurrentServer();
        setAuthError(result.ok ? null : result.message);
        return result;
    }, [probeCurrentServer]);

    const login = useCallback(async (email: string, password: string, _serverCandidate: string) => {
        const payload = await authenticateAgainstConfirmedServer({
            candidate: serverUrl,
            confirmServer: confirmCurrentServer,
            authenticate: (baseUrl) => new CalibrateApiClient({
                baseUrl,
                requestCredentials: 'include'
            }).loginBrowser({ email, password })
        });
        if (!payload) return false;
        queryClient.clear();
        await clearBrowserUserScopedCaches();
        setUser(payload.user);
        return true;
    }, [confirmCurrentServer, queryClient, serverUrl]);

    const register = useCallback(async (
        email: string,
        password: string,
        _serverCandidate: string,
        acceptance: RegistrationLegalAcceptance
    ) => {
        const payload = await authenticateAgainstConfirmedServer({
            candidate: serverUrl,
            confirmServer: confirmCurrentServer,
            authenticate: (baseUrl) => {
                const legalAcceptance = requiresHostedLegalAcceptance(baseUrl)
                    ? requireRegistrationLegalAcceptance(acceptance)
                    : null;
                return new CalibrateApiClient({
                    baseUrl,
                    requestCredentials: 'include'
                }).registerBrowser({
                    email,
                    password,
                    ...(legalAcceptance ? {
                        terms_version: CURRENT_TERMS_VERSION,
                        privacy_version: CURRENT_PRIVACY_VERSION,
                        accept_terms: legalAcceptance.acceptTerms,
                        accept_privacy: legalAcceptance.acceptPrivacy
                    } : {})
                });
            }
        });
        if (!payload) return false;
        queryClient.clear();
        await clearBrowserUserScopedCaches();
        setUser(payload.user);
        return true;
    }, [confirmCurrentServer, queryClient, serverUrl]);

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
        clientServerIncompatibility: null,
        accountDeletionCleanupNotice: null,
        serverConnection,
        updateCurrentUser: setUser,
        setServerUrl: async () => (await confirmCurrentServer()).ok,
        testServerUrl: async () => (await probeCurrentServer()).ok,
        login,
        register,
        logout,
        clearLocalSession: clearSessionWithBrowserCleanup,
        recheckClientCompatibility,
        persistAccountDeletionCleanupNotice: async () => undefined,
        acknowledgeAccountDeletionCleanupNotice: async () => undefined
    }), [api, authError, clearSessionWithBrowserCleanup, confirmCurrentServer, isLoading, login, logout, probeCurrentServer, recheckClientCompatibility, register, serverConnection, serverUrl, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
