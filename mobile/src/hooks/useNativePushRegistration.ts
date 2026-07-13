import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { NATIVE_PUSH_PLATFORMS, NATIVE_PUSH_PROVIDERS } from '@calibrate/shared';
import { useAuth } from '../auth/AuthContext';
import {
    getNotificationPermissionState,
    isNativePushEnvironmentSupported,
    NATIVE_PUSH_STATES,
    type NativePushState
} from '../notifications/workflow';

type NativePushRegistrationContextValue = {
    state: NativePushState;
    requestPermission: () => Promise<void>;
    openSettings: () => Promise<void>;
    refreshPermission: () => Promise<void>;
    retryRegistration: () => Promise<void>;
};

const NativePushRegistrationContext = createContext<NativePushRegistrationContextValue | null>(null);

/** Configure foreground behavior consistently before registering or listening for native pushes. */
async function loadNotificationsModule() {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: true
        })
    });
    return Notifications;
}

/**
 * Own native notification permission and registration state for the signed-in Android install.
 * Permission prompts remain user initiated; already-granted devices register automatically.
 */
export function NativePushRegistrationProvider({ children }: { children: React.ReactNode }) {
    const { api, user } = useAuth();
    const [state, setState] = useState<NativePushState>(NATIVE_PUSH_STATES.CHECKING);
    const activeRun = useRef(0);

    const synchronize = useCallback(async (requestPermission: boolean) => {
        const run = ++activeRun.current;
        if (!user) {
            setState(NATIVE_PUSH_STATES.SIGNED_OUT);
            return;
        }
        if (!isNativePushEnvironmentSupported(Constants.appOwnership, Platform.OS)) {
            setState(NATIVE_PUSH_STATES.UNSUPPORTED);
            return;
        }

        setState(NATIVE_PUSH_STATES.CHECKING);
        try {
            const Notifications = await loadNotificationsModule();
            const permission = requestPermission
                ? await Notifications.requestPermissionsAsync()
                : await Notifications.getPermissionsAsync();
            if (run !== activeRun.current) return;

            const permissionState = getNotificationPermissionState(permission);
            if (permissionState !== NATIVE_PUSH_STATES.REGISTERING) {
                setState(permissionState);
                return;
            }

            setState(NATIVE_PUSH_STATES.REGISTERING);
            const token = await Notifications.getExpoPushTokenAsync();
            if (run !== activeRun.current) return;
            if (!token.data) throw new Error('Expo did not return a push token.');

            await api.registerNativePushSubscription({
                token: token.data,
                platform: NATIVE_PUSH_PLATFORMS.ANDROID,
                provider: NATIVE_PUSH_PROVIDERS.EXPO
            });
            if (run === activeRun.current) setState(NATIVE_PUSH_STATES.REGISTERED);
        } catch {
            if (run === activeRun.current) setState(NATIVE_PUSH_STATES.ERROR);
        }
    }, [api, user]);

    useEffect(() => {
        void synchronize(false);
        return () => {
            activeRun.current += 1;
        };
    }, [synchronize]);

    const requestPermission = useCallback(() => synchronize(true), [synchronize]);
    const refreshPermission = useCallback(() => synchronize(false), [synchronize]);
    const retryRegistration = useCallback(() => synchronize(false), [synchronize]);
    const openSettings = useCallback(async () => {
        try {
            await Linking.openSettings();
        } catch {
            setState(NATIVE_PUSH_STATES.ERROR);
        }
    }, []);

    const value = useMemo<NativePushRegistrationContextValue>(() => ({
        state,
        requestPermission,
        openSettings,
        refreshPermission,
        retryRegistration
    }), [openSettings, refreshPermission, requestPermission, retryRegistration, state]);

    return React.createElement(NativePushRegistrationContext.Provider, { value }, children);
}

export function useNativePushRegistration(): NativePushRegistrationContextValue {
    const context = useContext(NativePushRegistrationContext);
    if (!context) {
        throw new Error('useNativePushRegistration must be used within NativePushRegistrationProvider.');
    }
    return context;
}
