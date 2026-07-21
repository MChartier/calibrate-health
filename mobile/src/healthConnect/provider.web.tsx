import React, { createContext, useContext, useMemo } from 'react';
import { DEFAULT_HEALTH_CONNECT_PREFERENCES, type StoredHealthConnectPreferences } from './preferences';
import type { HealthConnectConnection, HealthConnectFeature } from './types';

type HealthConnectContextValue = StoredHealthConnectPreferences & {
    connection: HealthConnectConnection | null;
    isLoading: boolean;
    isBusy: boolean;
    isSyncing: boolean;
    lastRefreshedAt: string | null;
    lastSuccessfulSyncAt: string | null;
    error: string | null;
    syncError: string | null;
    restartMessage: string | null;
    connect: () => Promise<void>;
    refresh: () => Promise<void>;
    sync: () => Promise<void>;
    setFeatureEnabled: (feature: HealthConnectFeature, enabled: boolean) => Promise<void>;
    setPaused: (paused: boolean) => Promise<void>;
    manageAccess: () => Promise<void>;
    updateProvider: () => Promise<void>;
    disconnect: () => Promise<void>;
    clearAccountData: () => Promise<void>;
};

const HealthConnectContext = createContext<HealthConnectContextValue | null>(null);
const WEB_UNAVAILABLE = 'Health Connect is available in the Android app.';

/** Keep shared settings routes renderable without loading Android Health Connect modules on web. */
export function HealthConnectProvider({ children }: { children: React.ReactNode }) {
    const value = useMemo<HealthConnectContextValue>(() => ({
        ...DEFAULT_HEALTH_CONNECT_PREFERENCES,
        connection: { availability: 'not_android', initialized: false, grantedFeatures: [] },
        isLoading: false,
        isBusy: false,
        isSyncing: false,
        lastRefreshedAt: null,
        lastSuccessfulSyncAt: null,
        error: null,
        syncError: null,
        restartMessage: null,
        connect: async () => { throw new Error(WEB_UNAVAILABLE); },
        refresh: async () => undefined,
        sync: async () => { throw new Error(WEB_UNAVAILABLE); },
        setFeatureEnabled: async () => { throw new Error(WEB_UNAVAILABLE); },
        setPaused: async () => { throw new Error(WEB_UNAVAILABLE); },
        manageAccess: async () => { throw new Error(WEB_UNAVAILABLE); },
        updateProvider: async () => { throw new Error(WEB_UNAVAILABLE); },
        disconnect: async () => undefined,
        clearAccountData: async () => undefined
    }), []);
    return <HealthConnectContext.Provider value={value}>{children}</HealthConnectContext.Provider>;
}

export function useHealthConnect(): HealthConnectContextValue {
    const context = useContext(HealthConnectContext);
    if (!context) throw new Error('useHealthConnect must be used within HealthConnectProvider.');
    return context;
}
