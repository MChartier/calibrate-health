import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { NATIVE_PUSH_PLATFORMS, NATIVE_PUSH_PROVIDERS } from '@calibrate/shared';
import { useAuth } from '../auth/AuthContext';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true
    })
});

/**
 * Register the current Android install with the backend for native reminder push.
 */
export function useNativePushRegistration() {
    const { api, user, deviceId } = useAuth();

    useEffect(() => {
        const currentDeviceId = deviceId;
        if (!user || !currentDeviceId) return;

        let cancelled = false;
        const registerDeviceId = currentDeviceId;

        async function register() {
            const permissions = await Notifications.requestPermissionsAsync();
            if (permissions.status !== 'granted') return;

            const token = await Notifications.getExpoPushTokenAsync();
            if (!token.data) return;
            if (cancelled) return;

            await api.registerNativePushSubscription({
                token: token.data,
                device_id: registerDeviceId,
                platform: NATIVE_PUSH_PLATFORMS.ANDROID,
                provider: NATIVE_PUSH_PROVIDERS.EXPO
            });
        }

        void register().catch(() => {
            // Push registration should never block the core app shell.
        });

        return () => {
            cancelled = true;
        };
    }, [api, deviceId, user]);
}
