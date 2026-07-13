import { useEffect } from 'react';
import Constants from 'expo-constants';
import { NATIVE_PUSH_PLATFORMS, NATIVE_PUSH_PROVIDERS } from '@calibrate/shared';
import { useAuth } from '../auth/AuthContext';

/**
 * Register the current Android install with the backend for native reminder push.
 *
 * Expo Go no longer supports Android remote push, so we skip registration there
 * and keep the code path for development builds and release builds.
 */
export function useNativePushRegistration() {
    const { api, user } = useAuth();

    useEffect(() => {
        if (!user) return;

        let cancelled = false;

        async function register() {
            if (Constants.appOwnership === 'expo') {
                return;
            }

            const Notifications = await import('expo-notifications');
            Notifications.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowBanner: true,
                    shouldShowList: true,
                    shouldPlaySound: false,
                    shouldSetBadge: true
                })
            });

            const permissions = await Notifications.requestPermissionsAsync();
            if (permissions.status !== 'granted') return;

            const token = await Notifications.getExpoPushTokenAsync();
            if (!token.data) return;
            if (cancelled) return;

            await api.registerNativePushSubscription({
                token: token.data,
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
    }, [api, user]);
}
