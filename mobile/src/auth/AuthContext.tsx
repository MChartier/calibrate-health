import { hasExplicitLogout, beginExplicitLogout, flushExplicitLogout, finishExplicitLogin, queueNativeRevocation } from './logoutIntent';
import { usePendingLogoutRetry } from './usePendingLogoutRetry';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    ApiError,
    CalibrateApiClient,
    type MobileAuthResponse,
    type UserClientPayload
} from '@calibrate/api-client';
import type { ClientUpgradeRequirement } from '@calibrate/shared';
import {
    getClientServerCompatibilityMismatch,
    type ClientServerCompatibilityMismatch
} from '@calibrate/shared/releaseCompatibility';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '@calibrate/shared/legalVersions';
import * as Application from 'expo-application';
import { useQueryClient } from '@tanstack/react-query';
import {
    HOSTED_SERVER_URL,
    INITIAL_SERVER_CONNECTION_STATE,
    normalizeServerUrl,
    testCalibrateServerConnection,
    type ServerConnectionResult,
    type ServerConnectionState
} from '../config/server';
import { authenticateAgainstConfirmedServer } from './serverSwitch';
import { getSessionRestoreErrorMessage, isExpectedDevAutoLoginMiss } from './authErrors';
import { MOBILE_CLIENT_IDENTITY, MOBILE_SERVER_RELEASE_VERSION } from '../config/nativeClient';
import { getNativeDeviceName } from '../platform/nativePlatform';
import {
    clearStoredTokens,
    getOrCreateDeviceId,
    readServerUrl,
    readStoredTokens,
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
import { requireRegistrationLegalAcceptance, requiresHostedLegalAcceptance, type RegistrationLegalAcceptance } from './accountAccess';
import { clearOnboardingDraft } from '../onboarding/draftStorage';
import { clearOfflineWorkspace, hydrateVerifiedOfflineWorkspace, restoreOfflineWorkspace, saveOfflineWorkspace } from './offlineWorkspace';
import { isRetryableMutationError } from '../offline/retryability';
import { TARGET_RECOVERY_GUIDANCE } from './targetTransition';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';

type AuthContextValue = {
    api: CalibrateApiClient;
    user: UserClientPayload | null;
    accessToken: string | null;
    refreshToken: string | null;
    deviceId: string | null;
    serverUrl: string;
    isLoading: boolean;
    authError: string | null;
    pendingReconnection: boolean;
    clientUpgradeRequired: ClientUpgradeRequirement | null;
    clientServerIncompatibility: ClientServerCompatibilityMismatch | null;
    accountDeletionCleanupNotice: AccountDeletionCleanupNotice | null;
    serverConnection: ServerConnectionState;
    updateCurrentUser: (user: UserClientPayload) => void;
    login: (email: string, password: string) => Promise<boolean>;
    register: (email: string, password: string, acceptance: RegistrationLegalAcceptance) => Promise<boolean>;
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
    const targetReady = useRef(false);
    const [targetError, setTargetError] = useState<string | null>(null);
    const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
    const [user, setUser] = useState<UserClientPayload | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [clientUpgradeRequired, setClientUpgradeRequired] = useState<ClientUpgradeRequirement | null>(null);
    const [clientServerIncompatibility, setClientServerIncompatibility] =
        useState<ClientServerCompatibilityMismatch | null>(null);
    const [accountDeletionCleanupNotice, setAccountDeletionCleanupNotice] =
        useState<AccountDeletionCleanupNotice | null>(null);
    const [serverConnection, setServerConnection] = useState<ServerConnectionState>(INITIAL_SERVER_CONNECTION_STATE);
    const accessTokenRef = useRef<string | null>(null);
    const refreshTokenRef = useRef<string | null>(null);
    const serverTestRequestRef = useRef(0);
    const serverUrlRef = useRef('');
    usePendingLogoutRetry(serverUrl, flushExplicitLogout, () => { if (!accountScopeRef.current) setAuthError(null); });
    const [pendingReconnection, setPendingReconnection] = useState(false);
    const localOnlyRef = useRef(false);
    const accountScopeRef = useRef<{ serverUrl: string; userId: number } | null>(null);
    const sessionEpochRef = useRef(0);
    const providerActive = useRef(false);
    useEffect(() => {
        providerActive.current = true;
        return () => {
            providerActive.current = false;
            sessionEpochRef.current += 1;
            targetReady.current = false;
            accountScopeRef.current = null;
            accessTokenRef.current = null;
            refreshTokenRef.current = null;
        };
    }, []);
    const [sessionEpoch, setSessionEpoch] = useState(0);
    const advanceSessionEpoch = useCallback(() => {
        sessionEpochRef.current += 1;
        setSessionEpoch(sessionEpochRef.current);
    }, []);

    const clearSession = useCallback(async () => {
        if (!providerActive.current) return;
        // Invalidate old API callbacks synchronously, before React unmounts their callers.
        advanceSessionEpoch();
        const clearEpoch = sessionEpochRef.current;
        const scope = accountScopeRef.current;
        accountScopeRef.current = null;
        localOnlyRef.current = false;
        setPendingReconnection(false);
        const workspaceCleanup = serverUrlRef.current ? clearOfflineWorkspace(scope?.serverUrl ?? serverUrlRef.current) : Promise.resolve();
        const draftCleanup = scope ? clearOnboardingDraft(scope.serverUrl, scope.userId) : Promise.resolve();
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        accessTokenRef.current = null;
        refreshTokenRef.current = null;
        setClientUpgradeRequired(null);
        setClientServerIncompatibility(null);
        queryClient.clear();
        await Promise.all([clearStoredTokens(() => providerActive.current && sessionEpochRef.current === clearEpoch), draftCleanup, workspaceCleanup]);
    }, [advanceSessionEpoch, queryClient]);

    const handleClientUpgradeRequired = useCallback((requirement: ClientUpgradeRequirement) => {
        // Keep credentials and offline state intact so an in-place app update can resume the same session.
        if (providerActive.current) setClientUpgradeRequired(requirement);
    }, []);

    const persistAuthPayload = useCallback(async (payload: {
        user: UserClientPayload;
        access_token: string;
        refresh_token: string;
    }, newSession = false) => {
        const origin = serverUrlRef.current;
        const discard = async () => {
            await queueNativeRevocation(origin, payload.refresh_token);
            await flushExplicitLogout(origin).catch(() => undefined);
            return false;
        };
        if (!providerActive.current) return discard();
        const previousScope = accountScopeRef.current;
        const nextScope = { serverUrl: origin, userId: payload.user.id };
        if (newSession || !previousScope || previousScope.serverUrl !== origin || previousScope.userId !== payload.user.id) advanceSessionEpoch();
        const persistEpoch = sessionEpochRef.current;
        accountScopeRef.current = nextScope;
        const isCurrent = () => providerActive.current && sessionEpochRef.current === persistEpoch && accountScopeRef.current === nextScope;
        if (previousScope && (previousScope.userId !== payload.user.id || previousScope.serverUrl !== origin)) {
            await clearOnboardingDraft(previousScope.serverUrl, previousScope.userId).catch(() => undefined);
        }
        if (!isCurrent()) return discard();
        if (previousScope && (previousScope.userId !== payload.user.id || previousScope.serverUrl !== origin)) queryClient.clear();
        await hydrateVerifiedOfflineWorkspace(origin, payload.user.id, queryClient, isCurrent);
        if (!isCurrent()) return discard();
        try {
            await writeStoredTokens({ accessToken: payload.access_token, refreshToken: payload.refresh_token }, isCurrent);
        } catch (error) {
            if (!isCurrent()) return discard();
            throw error;
        }
        if (!isCurrent()) return discard();
        localOnlyRef.current = false;
        setPendingReconnection(false);
        setAuthError(null);
        setUser(payload.user);
        setAccessToken(payload.access_token);
        setRefreshToken(payload.refresh_token);
        setClientUpgradeRequired(null);
        setClientServerIncompatibility(null);
        accessTokenRef.current = payload.access_token;
        refreshTokenRef.current = payload.refresh_token;
        await saveOfflineWorkspace(origin, payload.user, queryClient, isCurrent).catch(() => undefined);
        // Durable authentication committed while current. A later unmount must not revoke
        // that valid session while another provider is restoring it.
        return true;
    }, [advanceSessionEpoch, queryClient]);

    const refreshAccessToken = useCallback(async (): Promise<boolean> => {
        const refreshEpoch = sessionEpochRef.current;
        const refreshServer = serverUrl || HOSTED_SERVER_URL;
        if (serverUrlRef.current !== refreshServer) return false;
        const currentRefreshToken = refreshTokenRef.current;
        const scope = accountScopeRef.current;
        const isCurrent = () => providerActive.current && sessionEpochRef.current === refreshEpoch
            && serverUrlRef.current === refreshServer
            && accountScopeRef.current === scope && refreshTokenRef.current === currentRefreshToken;
        if (!isCurrent() || !currentRefreshToken) return false;

        const refreshClient = new CalibrateApiClient({
            baseUrl: serverUrl || HOSTED_SERVER_URL,
            clientIdentity: MOBILE_CLIENT_IDENTITY,
            onClientUpgradeRequired: (requirement) => {
                if (isCurrent()) handleClientUpgradeRequired(requirement);
            }
        });
        try {
            const refreshed = await refreshClient.refreshMobile<MobileAuthResponse>(currentRefreshToken);
            if (!isCurrent()) {
                await queueNativeRevocation(serverUrl || HOSTED_SERVER_URL, refreshed.refresh_token);
                await flushExplicitLogout(serverUrl || HOSTED_SERVER_URL).catch(() => undefined);
                throw new Error('Authentication scope changed during refresh.');
            }
            if (accountScopeRef.current && refreshed.user.id !== accountScopeRef.current.userId) return false;
            if (!await persistAuthPayload(refreshed)) {
                await queueNativeRevocation(serverUrl || HOSTED_SERVER_URL, refreshed.refresh_token);
                await flushExplicitLogout(serverUrl || HOSTED_SERVER_URL).catch(() => undefined);
                throw new Error('Authentication scope changed during refresh.');
            }
            return true;
        } catch (error) {
            if (!isCurrent()) throw new Error('Authentication scope changed during refresh.');
            if (error instanceof ApiError && error.status === 401) return false;
            if (isRetryableMutationError(error)) {
                localOnlyRef.current = true;
                setPendingReconnection(true);
            }
            throw error;
        }
    }, [handleClientUpgradeRequired, persistAuthPayload, serverUrl]);

    const api = useMemo(() => {
        const requestServer = serverUrl || HOSTED_SERVER_URL;
        const isCurrentSession = () => providerActive.current && targetReady.current && sessionEpochRef.current === sessionEpoch
            && serverUrlRef.current === requestServer;
        return new CalibrateApiClient({
            baseUrl: requestServer,
            clientIdentity: MOBILE_CLIENT_IDENTITY,
            onClientUpgradeRequired: (requirement) => {
                if (isCurrentSession()) handleClientUpgradeRequired(requirement);
            },
            getAccessToken: () => isCurrentSession() ? accessTokenRef.current : null,
            fetchImpl: (input, init) => {
                if (!isCurrentSession()) return Promise.reject(new Error('Authentication scope changed.'));
                if (localOnlyRef.current) return Promise.reject(new TypeError('Pending reconnection; changes remain on this device.'));
                return globalThis.fetch(input, init);
            },
            onRequestError: (error) => {
                if (isCurrentSession() && isRetryableMutationError(error)) {
                    if (accountScopeRef.current) localOnlyRef.current = true;
                    setPendingReconnection(true);
                }
            },
            refreshAccessToken: () => isCurrentSession() ? refreshAccessToken() : false,
            onUnauthorized: () => {
                if (isCurrentSession()) return clearSession();
            }
        });
    }, [clearSession, handleClientUpgradeRequired, refreshAccessToken, serverUrl, sessionEpoch]);

    const getDevTestUserAuthPayload = useCallback(async (
        baseUrl: string,
        nextDeviceId: string
    ): Promise<MobileAuthResponse | null> => {
        const epoch = sessionEpochRef.current;
        const isCurrent = () => providerActive.current && sessionEpochRef.current === epoch;
        if (!isCurrent()) return null;
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

        if (!isCurrent()) return null;
        let payload: MobileAuthResponse;
        try {
            payload = await bootstrapClient.loginMobile({
                email: DEV_TEST_EMAIL,
                password: DEV_TEST_PASSWORD,
                device_id: nextDeviceId,
                device_platform: MOBILE_CLIENT_IDENTITY.platform,
                device_name: getNativeDeviceName()
            });
        } catch (error) {
            if (isExpectedDevAutoLoginMiss(error)) return null;
            throw error;
        }
        return payload;
    }, [handleClientUpgradeRequired]);

    useEffect(() => {
        let isMounted = true;
        const restoreEpoch = sessionEpochRef.current;

        async function hydrate() {
            try {
                targetReady.current = false;
                setTargetError(null);
                const storedServerUrl = await readServerUrl();
                const [tokens, nextDeviceId, storedCleanupNotice] = await Promise.all([
                    readStoredTokens(),
                    getOrCreateDeviceId(),
                    readAccountDeletionCleanupNotice().catch(() => null)
                ]);
                if (!isMounted) return;

                targetReady.current = true;
                serverUrlRef.current = storedServerUrl;
                setServerUrlState(storedServerUrl);
                setDeviceId(nextDeviceId);
                const signedOut = await hasExplicitLogout(storedServerUrl);
                if (!isMounted || sessionEpochRef.current !== restoreEpoch) return;
                if (signedOut) {
                    await clearSession();
                    await flushExplicitLogout(storedServerUrl).catch(() => { if (isMounted) setAuthError('Signed out on this device. Server sign-out is pending connection.'); });
                    return;
                }
                // A late rotated token can require revocation without signing out the current account.
                void flushExplicitLogout(storedServerUrl).catch(() => undefined);
                setAccountDeletionCleanupNotice(storedCleanupNotice);
                if (storedCleanupNotice) {
                    setAccessToken(null);
                    setRefreshToken(null);
                    accessTokenRef.current = null;
                    refreshTokenRef.current = null;
                    await clearStoredTokens(() => isMounted && providerActive.current && sessionEpochRef.current === restoreEpoch).catch(() => undefined);
                    return;
                }
                setAccessToken(tokens.accessToken);
                setRefreshToken(tokens.refreshToken);
                accessTokenRef.current = tokens.accessToken;
                refreshTokenRef.current = tokens.refreshToken;

                const compatibilityClient = new CalibrateApiClient({
                    baseUrl: storedServerUrl,
                    clientIdentity: MOBILE_CLIENT_IDENTITY,
                    onClientUpgradeRequired: handleClientUpgradeRequired
                });
                const config = await compatibilityClient.getClientConfig({ cache: 'no-store' });
                if (!isMounted) return;
                const compatibilityMismatch = getClientServerCompatibilityMismatch(
                    MOBILE_SERVER_RELEASE_VERSION,
                    config.server_version
                );
                if (compatibilityMismatch) {
                    setClientServerIncompatibility(compatibilityMismatch);
                    return;
                }

                if (tokens.refreshToken) {
                    try {
                        const refreshed = await compatibilityClient.refreshMobile<MobileAuthResponse>(tokens.refreshToken);
                        if (isMounted && sessionEpochRef.current === restoreEpoch) {
                            await persistAuthPayload(refreshed);
                        } else {
                            await queueNativeRevocation(storedServerUrl, refreshed.refresh_token);
                        }
                        return;
                    } catch (refreshError) {
                        if (!shouldDevAutoLogin(storedServerUrl) || !(refreshError instanceof ApiError) || refreshError.status !== 401) {
                            throw refreshError;
                        }
                        if (!isMounted || sessionEpochRef.current !== restoreEpoch) return;
                        await clearStoredTokens(() => isMounted && providerActive.current && sessionEpochRef.current === restoreEpoch);
                    }
                }

                if (shouldDevAutoLogin(storedServerUrl)) {
                    const devAuthPayload = await getDevTestUserAuthPayload(storedServerUrl, nextDeviceId);
                    if (isMounted && sessionEpochRef.current === restoreEpoch && devAuthPayload) {
                        await persistAuthPayload(devAuthPayload);
                    } else if (devAuthPayload) {
                        await queueNativeRevocation(storedServerUrl, devAuthPayload.refresh_token);
                    }
                }
            } catch (error) {
                if (isMounted) {
                    if (!targetReady.current) { setTargetError(TARGET_RECOVERY_GUIDANCE); return; }
                    if (sessionEpochRef.current !== restoreEpoch) return;
                    if (isRetryableMutationError(error) && refreshTokenRef.current) {
                        const cached = await restoreOfflineWorkspace(serverUrlRef.current, queryClient).catch(() => null);
                        if (!isMounted || sessionEpochRef.current !== restoreEpoch) return;
                        if (cached) {
                            accountScopeRef.current = { serverUrl: serverUrlRef.current, userId: cached.id };
                            localOnlyRef.current = true;
                            setPendingReconnection(true);
                            setUser(cached);
                        }
                    }
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
    }, [bootstrapAttempt, clearSession, getDevTestUserAuthPayload, handleClientUpgradeRequired, persistAuthPayload]);

    const recheckClientCompatibility = useCallback(async (): Promise<boolean> => {
        const epoch = sessionEpochRef.current;
        const isCurrent = () => providerActive.current && sessionEpochRef.current === epoch;
        if (!isCurrent()) return false;
        try {
            const recovery = new CalibrateApiClient({ baseUrl: serverUrlRef.current, clientIdentity: MOBILE_CLIENT_IDENTITY });
            const config = await recovery.getClientConfig({ cache: 'no-store' });
            if (!isCurrent()) return false;
            const compatibilityMismatch = getClientServerCompatibilityMismatch(
                MOBILE_SERVER_RELEASE_VERSION,
                config.server_version
            );
            if (compatibilityMismatch) {
                setClientServerIncompatibility(compatibilityMismatch);
                return false;
            }
            if ((!user || pendingReconnection || localOnlyRef.current) && refreshTokenRef.current) {
                const restored = await refreshAccessToken();
                if (!restored) {
                    await clearSession();
                    return false;
                }
            } else {
                setClientServerIncompatibility(null);
            }
            setClientUpgradeRequired(null);
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 426) return false;
            throw error;
        }
    }, [clearSession, pendingReconnection, refreshAccessToken, user]);

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
            mobileVersion: Application.nativeApplicationVersion,
            clientServerVersion: MOBILE_SERVER_RELEASE_VERSION
        });
        if (providerActive.current && serverTestRequestRef.current === requestId) {
            setServerConnection({
                status: result.ok ? 'connected' : 'error',
                testedInput: value.trim(),
                testedUrl: result.url,
                message: result.message
            });
        }
        return result;
    }, []);

    const confirmCurrentServer = useCallback(async (): Promise<ServerConnectionResult> => {
        if (!targetReady.current || !serverUrlRef.current) throw new Error(TARGET_RECOVERY_GUIDANCE);
        const result = await probeServerUrl(serverUrlRef.current);
        if (!result.ok) setAuthError(result.message);
        return result;
    }, [probeServerUrl]);

    const updateCurrentUser = useCallback((nextUser: UserClientPayload) => {
        if (!providerActive.current) return;
        const scope = accountScopeRef.current;
        if (scope?.userId !== nextUser.id) return;
        setUser(nextUser);
        void saveOfflineWorkspace(scope.serverUrl, nextUser, queryClient, () => providerActive.current && accountScopeRef.current === scope).catch(() => undefined);
    }, [queryClient]);

    const login = useCallback(
        async (email: string, password: string): Promise<boolean> => {
            if (!providerActive.current) return false;
            advanceSessionEpoch();
            const authEpoch = sessionEpochRef.current;
            const authServer = serverUrlRef.current;
            assertAccountDeletionCleanupAcknowledged(accountDeletionCleanupNotice);
            const nextDeviceId = deviceId ?? (await getOrCreateDeviceId());
            setDeviceId(nextDeviceId);
            const payload = await authenticateAgainstConfirmedServer({
                candidate: authServer,
                confirmServer: confirmCurrentServer,
                authenticate: async (confirmedServerUrl) => {
                    if (!providerActive.current || sessionEpochRef.current !== authEpoch) throw new Error('Authentication was cancelled.');
                    await flushExplicitLogout(confirmedServerUrl);
                    if (!providerActive.current || sessionEpochRef.current !== authEpoch) throw new Error('Authentication was cancelled.');
                    const authClient = new CalibrateApiClient({
                        baseUrl: confirmedServerUrl,
                        clientIdentity: MOBILE_CLIENT_IDENTITY,
                        onClientUpgradeRequired: handleClientUpgradeRequired
                    });
                    return authClient.loginMobile({
                        email,
                        password,
                        device_id: nextDeviceId,
                        device_platform: MOBILE_CLIENT_IDENTITY.platform,
                        device_name: getNativeDeviceName()
                    });
                }
            });
            if (!payload) return false;
            if (!providerActive.current || sessionEpochRef.current !== authEpoch) {
                await queueNativeRevocation(authServer, payload.refresh_token);
                void flushExplicitLogout(authServer).catch(() => undefined);
                return false;
            }
            await finishExplicitLogin(authServer);
            if (!providerActive.current || sessionEpochRef.current !== authEpoch) {
                await queueNativeRevocation(authServer, payload.refresh_token);
                return false;
            }
            return persistAuthPayload(payload, true);
        },
        [accountDeletionCleanupNotice, confirmCurrentServer, deviceId, handleClientUpgradeRequired, persistAuthPayload]
    );

    const register = useCallback(
        async (
            email: string,
            password: string,
            acceptance: RegistrationLegalAcceptance
        ): Promise<boolean> => {
            if (!providerActive.current) return false;
            advanceSessionEpoch();
            const authEpoch = sessionEpochRef.current;
            const authServer = serverUrlRef.current;
            assertAccountDeletionCleanupAcknowledged(accountDeletionCleanupNotice);
            const nextDeviceId = deviceId ?? (await getOrCreateDeviceId());
            setDeviceId(nextDeviceId);
            const payload = await authenticateAgainstConfirmedServer({
                candidate: authServer,
                confirmServer: confirmCurrentServer,
                authenticate: async (confirmedServerUrl) => {
                    if (!providerActive.current || sessionEpochRef.current !== authEpoch) throw new Error('Authentication was cancelled.');
                    await flushExplicitLogout(confirmedServerUrl);
                    if (!providerActive.current || sessionEpochRef.current !== authEpoch) throw new Error('Authentication was cancelled.');
                    const legalAcceptance = requiresHostedLegalAcceptance(confirmedServerUrl)
                        ? requireRegistrationLegalAcceptance(acceptance)
                        : null;
                    const authClient = new CalibrateApiClient({
                        baseUrl: confirmedServerUrl,
                        clientIdentity: MOBILE_CLIENT_IDENTITY,
                        onClientUpgradeRequired: handleClientUpgradeRequired
                    });
                    return authClient.registerMobile({
                        email,
                        password,
                        ...(legalAcceptance ? {
                            terms_version: CURRENT_TERMS_VERSION,
                            privacy_version: CURRENT_PRIVACY_VERSION,
                            accept_terms: legalAcceptance.acceptTerms,
                            accept_privacy: legalAcceptance.acceptPrivacy
                        } : {}),
                        device_id: nextDeviceId,
                        device_platform: MOBILE_CLIENT_IDENTITY.platform,
                        device_name: getNativeDeviceName()
                    });
                }
            });
            if (!payload) return false;
            if (!providerActive.current || sessionEpochRef.current !== authEpoch) {
                await queueNativeRevocation(authServer, payload.refresh_token);
                void flushExplicitLogout(authServer).catch(() => undefined);
                return false;
            }
            await finishExplicitLogin(authServer);
            if (!providerActive.current || sessionEpochRef.current !== authEpoch) {
                await queueNativeRevocation(authServer, payload.refresh_token);
                return false;
            }
            return persistAuthPayload(payload, true);
        },
        [accountDeletionCleanupNotice, confirmCurrentServer, deviceId, handleClientUpgradeRequired, persistAuthPayload]
    );

    const logout = useCallback(async () => {
        if (!providerActive.current) return;
        advanceSessionEpoch();
        const logoutEpoch = sessionEpochRef.current;
        const target = serverUrl || HOSTED_SERVER_URL;
        let intentPersisted = true;
        await beginExplicitLogout(target, refreshTokenRef.current ?? undefined).catch(() => { intentPersisted = false; });
        try {
            if (providerActive.current && sessionEpochRef.current === logoutEpoch) await clearSession();
        } finally {
            // Local cleanup failure must not suppress server session revocation.
            await flushExplicitLogout(target).catch(() => setAuthError(intentPersisted
                ? 'Signed out on this device. Server sign-out is pending connection.'
                : 'Signed out in this app. Device storage is unavailable and server sign-out is pending. Reconnect before closing this app.'));
        }
    }, [clearSession, serverUrl]);

    const persistAccountDeletionCleanupNotice = useCallback(async (notice: AccountDeletionCleanupNotice) => {
        // Update the mounted auth shell first so guidance remains visible even if durable storage is unavailable.
        setAccountDeletionCleanupNotice(notice);
        await writeAccountDeletionCleanupNotice(notice);
    }, []);

    const acknowledgeAccountDeletionCleanupNotice = useCallback(async () => {
        await clearAccountDeletionCleanupNotice();
        setAccountDeletionCleanupNotice(null);
    }, []);

    useEffect(() => {
        if (!user || !serverUrl) return;
        return queryClient.getQueryCache().subscribe((event) => {
            if (event.type !== 'updated' || event.action.type !== 'success') return;
            const scope = accountScopeRef.current;
            if (scope?.userId === user.id && scope.serverUrl === serverUrl) {
                void saveOfflineWorkspace(serverUrl, user, queryClient).catch(() => undefined);
            }
        });
    }, [queryClient, serverUrl, user]);

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
            pendingReconnection,
            clientUpgradeRequired,
            clientServerIncompatibility,
            accountDeletionCleanupNotice,
            serverConnection,
            updateCurrentUser,
            login,
            register,
            logout,
            clearLocalSession: clearSession,
            recheckClientCompatibility,
            persistAccountDeletionCleanupNotice,
            acknowledgeAccountDeletionCleanupNotice
        }),
        [pendingReconnection, accessToken, accountDeletionCleanupNotice, acknowledgeAccountDeletionCleanupNotice, api, authError, clearSession, clientServerIncompatibility, clientUpgradeRequired, deviceId, isLoading, login, logout, persistAccountDeletionCleanupNotice, recheckClientCompatibility, refreshToken, register, serverConnection, serverUrl, updateCurrentUser, user]
    );

    if (targetError) return <Screen contentWidth="form" safeTop>
        <AppText variant="title">Saved data needs attention</AppText>
        <AppText accessibilityRole="alert">{targetError}</AppText>
        <AppButton title="Retry" onPress={() => { setIsLoading(true); setBootstrapAttempt(value => value + 1); }} />
    </Screen>;
    if (!targetReady.current) return <Screen contentWidth="form" safeTop><AppText>Preparing Calibrate...</AppText></Screen>;
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
