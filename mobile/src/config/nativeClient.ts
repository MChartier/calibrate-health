import * as Application from 'expo-application';
import type { NativeClientIdentity } from '@calibrate/shared';
import appConfig from '../../app.json';
import clientRelease from '../../../shared/client-release.json';
import { getMobileDevicePlatform } from '../platform/nativePlatform';

/** Server contract version expected by the JavaScript bundle, independent of the native app version. */
export const MOBILE_SERVER_REQUIREMENT = clientRelease.requiresServer;

/** Native version is authoritative on-device; Expo config is a safe native/Jest fallback. */
export const MOBILE_CLIENT_IDENTITY = {
    platform: getMobileDevicePlatform(),
    version: Application.nativeApplicationVersion?.trim() || appConfig.expo.version
} satisfies NativeClientIdentity;
