import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { getDefaultServerUrl } from '../config/server';
import { parseBoundSession, prepareTarget, type BoundSession } from './targetTransition';
import { inspectTargetTransitionState } from './targetTransitionState';

const ACCESS_TOKEN_KEY = 'calibrate.mobile.accessToken';
const REFRESH_TOKEN_KEY = 'calibrate.mobile.refreshToken';
const DEVICE_ID_KEY = 'calibrate.mobile.deviceId';
const SERVER_URL_KEY = 'calibrate.mobile.serverUrl';

export type StoredTokens = {
    accessToken: string | null;
    refreshToken: string | null;
};

const BINDING_KEY = 'calibrate.mobile.boundSession.v1';
let activeOrigin: string | null = null;

let tokenUpdates: Promise<unknown> = Promise.resolve();
function serializeTokens<T>(work: () => Promise<T>): Promise<T> {
    const task = tokenUpdates.then(work);
    tokenUpdates = task.catch(() => undefined);
    return task;
}

async function readActiveSession(): Promise<BoundSession> {
    const raw = await SecureStore.getItemAsync(BINDING_KEY);
    if (!raw || !activeOrigin) throw new Error('Service preparation is incomplete.');
    const session = parseBoundSession(raw);
    if (session.origin !== activeOrigin) throw new Error('Service binding changed.');
    return session;
}

export async function readStoredTokens(): Promise<StoredTokens> {
    return serializeTokens(async () => {
        const { accessToken, refreshToken } = await readActiveSession();
        return { accessToken, refreshToken };
    });
}

export async function writeStoredTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
    await serializeTokens(async () => {
        const session = await readActiveSession();
        await SecureStore.setItemAsync(BINDING_KEY, JSON.stringify({ ...session, ...tokens }));
    });
}

export async function clearStoredTokens(): Promise<void> {
    await serializeTokens(async () => {
        const session = await readActiveSession();
        await SecureStore.setItemAsync(BINDING_KEY, JSON.stringify({ ...session, accessToken: null, refreshToken: null }));
    });
}

export async function getOrCreateDeviceId(): Promise<string> {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) {
        return existing;
    }

    const next = typeof Crypto.randomUUID === 'function'
        ? Crypto.randomUUID()
        : `native-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, next);
    return next;
}

/** Completes the fixed-target gate before any token read or authenticated request. */
export async function readServerUrl(): Promise<string> {
    return serializeTokens(async () => {
        activeOrigin = null;
        const session = await prepareTarget(getDefaultServerUrl(), {
            readBinding: () => SecureStore.getItemAsync(BINDING_KEY),
            readLegacy: async () => {
                const [origin, accessToken, refreshToken] = await Promise.all([
                    AsyncStorage.getItem(SERVER_URL_KEY),
                    SecureStore.getItemAsync(ACCESS_TOKEN_KEY), SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
                ]);
                return { origin, accessToken, refreshToken };
            },
            inspectLocalState: inspectTargetTransitionState,
            preserveSession: async previous => {
                const key = 'calibrate.mobile.retainedSession.' + Array.from(previous.origin).map(c => c.charCodeAt(0).toString(16)).join('');
                await SecureStore.setItemAsync(key, JSON.stringify(previous));
            },
            commitBinding: next => SecureStore.setItemAsync(BINDING_KEY, JSON.stringify(next))
        });
        activeOrigin = session.origin;
        return session.origin;
    });
}
