import { MOBILE_DEVICE_PLATFORMS, NATIVE_PUSH_PLATFORMS } from '@calibrate/shared';
import { Platform } from 'react-native';

export type SupportedNativePlatform = 'android' | 'ios';

/** Map the React Native runtime to the server's phone/tablet session identity. */
export function getMobileDevicePlatform(platform: string = Platform.OS) {
    return platform === 'ios'
        ? MOBILE_DEVICE_PLATFORMS.IOS
        : MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE;
}

/** Expo push tokens are delivered through FCM on Android and APNs on iOS. */
export function getNativePushPlatform(platform: string = Platform.OS) {
    return platform === 'ios'
        ? NATIVE_PUSH_PLATFORMS.IOS
        : NATIVE_PUSH_PLATFORMS.ANDROID;
}

export function getNativePlatformLabel(platform: string = Platform.OS): 'Android' | 'iOS' {
    return platform === 'ios' ? 'iOS' : 'Android';
}

export function getNativeDeviceName(
    platform: string = Platform.OS,
    isPad = platform === 'ios' && Boolean((Platform as typeof Platform & { isPad?: boolean }).isPad)
): string {
    if (platform !== 'ios') return 'Android device';
    return isPad ? 'iPad' : 'iPhone';
}

export function supportsAndroidIntegrations(platform: string = Platform.OS): boolean {
    return platform === 'android';
}
