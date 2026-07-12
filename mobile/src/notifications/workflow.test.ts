import {
    getNotificationAction,
    getNotificationPermissionState,
    getNotificationResponseActionUrl,
    getPushStatusPresentation,
    isNativePushEnvironmentSupported,
    NATIVE_PUSH_STATES
} from './workflow';

describe('native notification workflow', () => {
    it('distinguishes permission retry from blocked settings recovery', () => {
        expect(getNotificationPermissionState({ granted: true, canAskAgain: true })).toBe(NATIVE_PUSH_STATES.REGISTERING);
        expect(getNotificationPermissionState({ granted: false, canAskAgain: true })).toBe(NATIVE_PUSH_STATES.PERMISSION_REQUIRED);
        expect(getNotificationPermissionState({ granted: false, canAskAgain: false })).toBe(NATIVE_PUSH_STATES.BLOCKED);
        expect(getPushStatusPresentation(NATIVE_PUSH_STATES.PERMISSION_REQUIRED).action).toBe('request');
        expect(getPushStatusPresentation(NATIVE_PUSH_STATES.BLOCKED).action).toBe('settings');
    });

    it('marks Expo Go and non-Android environments unsupported', () => {
        expect(isNativePushEnvironmentSupported('expo', 'android')).toBe(false);
        expect(isNativePushEnvironmentSupported('standalone', 'ios')).toBe(false);
        expect(isNativePushEnvironmentSupported('standalone', 'android')).toBe(true);
    });

    it('maps food, weight, and goal actions to allowlisted native routes', () => {
        expect(getNotificationAction('/log?quickAdd=food', '2026-07-12')).toEqual({
            label: 'Log food',
            href: { pathname: '/(tabs)/log', params: { date: '2026-07-12' } }
        });
        expect(getNotificationAction('/log?quickAdd=weight', '2026-07-12')).toEqual({
            label: 'Log weight',
            href: { pathname: '/(tabs)/weight', params: { date: '2026-07-12' } }
        });
        expect(getNotificationAction('/goals')).toEqual({ label: 'Open goals', href: '/(tabs)/progress' });
    });

    it.each([
        'https://evil.example/log?quickAdd=weight',
        '//evil.example/log',
        'javascript:alert(1)',
        '/unknown/path',
        '/log\\..\\settings',
        undefined
    ])('falls back safely for invalid or external action URL %p', (actionUrl) => {
        expect(getNotificationAction(actionUrl)).toEqual({
            label: 'Open Calibrate',
            href: '/(tabs)/today'
        });
    });

    it('uses a tapped action URL before the notification default', () => {
        const data = {
            url: '/log',
            actionUrls: {
                log_weight: '/log?quickAdd=weight',
                external: 'https://evil.example'
            }
        };

        expect(getNotificationResponseActionUrl(data, 'log_weight')).toBe('/log?quickAdd=weight');
        expect(getNotificationResponseActionUrl(data, 'unknown')).toBe('/log');
        expect(getNotificationAction(getNotificationResponseActionUrl(data, 'external')).href).toBe('/(tabs)/today');
    });
});
