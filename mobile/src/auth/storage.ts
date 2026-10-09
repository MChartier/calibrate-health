import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { getDefaultServerUrl, storedOrigin } from '../config/server';
import { inspectTargetTransitionState } from './targetTransitionState';

export type BoundSession = {
    version: 1;
    origin: string;
    accessToken: string | null;
    refreshToken: string | null;
};

export function parseBoundSession(raw: string): BoundSession {
    const value = JSON.parse(raw) as BoundSession;
    if (value?.version !== 1 || typeof value.origin !== 'string' || storedOrigin(value.origin) !== value.origin ||
        ![value.accessToken, value.refreshToken].every(token => token === null || (typeof token === 'string' && token.length > 0))) {
        throw new Error('Saved session binding is unreadable.');
    }
    return value;
}


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
let interruptedSession: BoundSession | null = null;
async function restoreInterruptedWrite(): Promise<void> {
    if (!interruptedSession) return;
    await SecureStore.setItemAsync(BINDING_KEY, JSON.stringify(interruptedSession));
    interruptedSession = null;
}

let tokenUpdates: Promise<unknown> = Promise.resolve();
function serializeTokens<T>(work: () => Promise<T>): Promise<T> {
    const task = tokenUpdates.then(work);
    tokenUpdates = task.catch(() => undefined);
    return task;
}

async function readActiveSession(): Promise<BoundSession> {
    await restoreInterruptedWrite();
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

/** Keep cancelled provider writes from becoming visible to the next queued reader/writer. */
async function updateStoredTokens(tokens: StoredTokens, isCurrent: () => boolean): Promise<void> {
    await serializeTokens(async () => {
        if (!isCurrent()) throw new Error('Authentication scope changed before storage.');
        const session = await readActiveSession();
        if (!isCurrent()) throw new Error('Authentication scope changed before storage.');
        try {
            await SecureStore.setItemAsync(BINDING_KEY, JSON.stringify({ ...session, ...tokens }));
        } finally {
            // SecureStore cannot cancel an in-flight write. Restore within the same queue slot,
            // before a replacement provider can read or persist its own session.
            if (!isCurrent()) {
                interruptedSession = session;
                await restoreInterruptedWrite();
            }
        }
        if (!isCurrent()) throw new Error('Authentication scope changed during storage.');
    });
}

export async function writeStoredTokens(tokens: { accessToken: string; refreshToken: string }, isCurrent: () => boolean = () => true): Promise<void> {
    await updateStoredTokens(tokens, isCurrent);
}

export async function clearStoredTokens(isCurrent: () => boolean = () => true): Promise<void> {
    await updateStoredTokens({ accessToken: null, refreshToken: null }, isCurrent);
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
        await restoreInterruptedWrite();
        activeOrigin = null;
        const origin = storedOrigin(getDefaultServerUrl());
        const raw = await SecureStore.getItemAsync(BINDING_KEY);
        let previous = raw === null ? null : parseBoundSession(raw);
        if (!previous) {
            const [savedOrigin, accessToken, refreshToken] = await Promise.all([
                AsyncStorage.getItem(SERVER_URL_KEY),
                SecureStore.getItemAsync(ACCESS_TOKEN_KEY), SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
            ]);
            if (savedOrigin !== null) {
                previous = parseBoundSession(JSON.stringify({ version: 1, origin: storedOrigin(savedOrigin), accessToken, refreshToken }));
            } else {
                const local = await inspectTargetTransitionState();
                if (accessToken || refreshToken || local.hasState) throw new Error('The previous service cannot be identified safely.');
            }
        }
        if (previous && previous.origin !== origin) {
            await inspectTargetTransitionState(previous.origin);
            const key = 'calibrate.mobile.retainedSession.' + Array.from(previous.origin).map(c => c.charCodeAt(0).toString(16)).join('');
            await SecureStore.setItemAsync(key, JSON.stringify(previous));
        }
        const session: BoundSession = previous?.origin === origin ? previous : { version: 1, origin, accessToken: null, refreshToken: null };
        if (raw === null || previous?.origin !== origin) await SecureStore.setItemAsync(BINDING_KEY, JSON.stringify(session));
        activeOrigin = session.origin;
        return session.origin;
    });
}
