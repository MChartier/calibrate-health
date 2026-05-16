import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { getDefaultServerUrl } from '../config/server';

const ACCESS_TOKEN_KEY = 'calibrate.mobile.accessToken';
const REFRESH_TOKEN_KEY = 'calibrate.mobile.refreshToken';
const DEVICE_ID_KEY = 'calibrate.mobile.deviceId';
const SERVER_URL_KEY = 'calibrate.mobile.serverUrl';

export type StoredTokens = {
    accessToken: string | null;
    refreshToken: string | null;
};

export async function readStoredTokens(): Promise<StoredTokens> {
    const [accessToken, refreshToken] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
    ]);

    return { accessToken, refreshToken };
}

export async function writeStoredTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
    await Promise.all([
        SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
        SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken)
    ]);
}

export async function clearStoredTokens(): Promise<void> {
    await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
    ]);
}

export async function getOrCreateDeviceId(): Promise<string> {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) {
        return existing;
    }

    const next = typeof Crypto.randomUUID === 'function'
        ? Crypto.randomUUID()
        : `android-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, next);
    return next;
}

export async function readServerUrl(): Promise<string> {
    return (await AsyncStorage.getItem(SERVER_URL_KEY)) ?? getDefaultServerUrl();
}

export async function writeServerUrl(serverUrl: string): Promise<void> {
    await AsyncStorage.setItem(SERVER_URL_KEY, serverUrl);
}
