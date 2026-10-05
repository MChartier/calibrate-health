import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import type { UserClientPayload } from '@calibrate/api-client';

const PREFIX = '@calibrate/offline-workspace/v1/';
const TRACKING_KEYS = new Set([
    'mobile-profile', 'mobile-goal', 'mobile-food', 'mobile-food-day', 'mobile-food-days',
    'mobile-metrics', 'mobile-metrics-trend', 'mobile-my-foods', 'mobile-my-foods-library',
    'mobile-recent-foods', 'mobile-food-search', 'mobile-calibration-status'
]);
const pending = new Map<string, Promise<unknown>>();
type Snapshot = { version: 1; origin: string; user: UserClientPayload; cache: DehydratedState };
const origin = (server: string) => new URL(server).origin;
const key = (server: string) => PREFIX + encodeURIComponent(origin(server));

function serialize<T>(server: string, work: () => Promise<T>): Promise<T> {
    const storageKey = key(server);
    const result = (pending.get(storageKey) ?? Promise.resolve()).then(work);
    pending.set(storageKey, result.catch(() => undefined));
    return result;
}

/** Local workspace only. Neither this snapshot nor its user ID authorizes a server request. */
export function saveOfflineWorkspace(server: string, user: UserClientPayload, client: QueryClient): Promise<void> {
    const snapshot: Snapshot = {
        version: 1, origin: origin(server), user,
        cache: dehydrate(client, {
            shouldDehydrateMutation: () => false,
            shouldDehydrateQuery: (query) => TRACKING_KEYS.has(String(query.queryKey[0])) && query.state.data !== undefined
        })
    };
    // Capture before queuing so an account switch cannot serialize the replacement user's cache.
    const encoded = JSON.stringify(snapshot);
    return serialize(server, () => AsyncStorage.setItem(key(server), encoded));
}

export function clearOfflineWorkspace(server: string): Promise<void> {
    return serialize(server, () => AsyncStorage.removeItem(key(server)));
}

export function restoreOfflineWorkspace(server: string, client: QueryClient): Promise<UserClientPayload | null> {
    return serialize(server, async () => {
        const encoded = await AsyncStorage.getItem(key(server));
        if (!encoded) return null;
        try {
            const snapshot = JSON.parse(encoded) as Snapshot;
            if (snapshot.version !== 1 || snapshot.origin !== origin(server) ||
                !Number.isSafeInteger(snapshot.user?.id) || snapshot.user.id <= 0 ||
                typeof snapshot.user.email !== 'string' || !Array.isArray(snapshot.cache?.queries)) return null;
            client.clear();
            hydrate(client, { mutations: [], queries: snapshot.cache.queries.filter((query) =>
                Array.isArray(query.queryKey) && TRACKING_KEYS.has(String(query.queryKey[0]))) });
            return snapshot.user;
        } catch { return null; }
    });
}
