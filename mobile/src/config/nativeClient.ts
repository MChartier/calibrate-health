import * as Application from 'expo-application';
import { MOBILE_DEVICE_PLATFORMS, type NativeClientIdentity } from '@calibrate/shared';
import release from '../../../shared/release.json';

/** Server contract version expected by the JavaScript bundle, independent of the native app version. */
export const MOBILE_SERVER_RELEASE_VERSION = release.server.version;

/** Native version is authoritative on-device; the checked release manifest is a safe Expo/Jest fallback. */
export const MOBILE_CLIENT_IDENTITY: NativeClientIdentity = {
    platform: MOBILE_DEVICE_PLATFORMS.ANDROID_PHONE,
    version: Application.nativeApplicationVersion?.trim() || release.android.mobile.version_name
};
