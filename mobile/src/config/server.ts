import { Platform } from 'react-native';

export const HOSTED_SERVER_URL = 'https://calibratehealth.app';
export const ANDROID_EMULATOR_SERVER_URL = 'http://10.0.2.2:3000';
export const CALIBRATE_SERVER_URL_ENV = 'EXPO_PUBLIC_CALIBRATE_SERVER_URL';

/**
 * Allow local Expo Go sessions on physical devices to point at a LAN backend without code edits.
 */
export function getConfiguredServerUrl(value = process.env.EXPO_PUBLIC_CALIBRATE_SERVER_URL): string | null {
    if (!value) return null;
    return normalizeServerUrl(value);
}

/**
 * Default to an explicit Expo public env value, the hosted instance in production, and the emulator loopback in
 * Android dev builds.
 */
export function getDefaultServerUrl(): string {
    const configuredServerUrl = getConfiguredServerUrl();
    if (configuredServerUrl) return configuredServerUrl;

    if (__DEV__ && Platform.OS === 'android') {
        return ANDROID_EMULATOR_SERVER_URL;
    }

    return HOSTED_SERVER_URL;
}

/**
 * Normalize self-hosted server input so API calls can safely append paths.
 */
export function normalizeServerUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const url = new URL(trimmed);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return null;
        }
        return url.origin;
    } catch {
        return null;
    }
}
