type Intent = { signedOut: boolean; pending: boolean; refreshTokens?: string[] };
type Storage = { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> };

/** Serialize invalidation and account switching; completed logout still suppresses automatic sign-in. */
export function createLogoutIntentStore(storage: Storage, revoke: (server: string, token?: string) => Promise<unknown>, browser: boolean, lock: <T>(key: string, work: () => Promise<T>) => Promise<T> = (_key, work) => work()) {
    const pending = new Map<string, Promise<unknown>>();
    const active = new Map<string, number>();
    const unsaved = new Map<string, Intent>();
    const unreadable = new Set<string>();
    const key = (server: string) => 'calibrate.logout.' + Array.from(new URL(server).origin).map(c => c.charCodeAt(0).toString(16)).join('');
    function serial<T>(server: string, work: (storageKey: string) => Promise<T>): Promise<T> {
        const storageKey = key(server);
        active.set(storageKey, (active.get(storageKey) ?? 0) + 1);
        const result = (pending.get(storageKey) ?? Promise.resolve())
            .then(() => lock(storageKey, () => work(storageKey)))
            .finally(() => { active.set(storageKey, (active.get(storageKey) ?? 1) - 1); });
        pending.set(storageKey, result.catch(() => undefined));
        return result;
    }
    const read = async (k: string): Promise<Intent | null> => unsaved.get(k) ?? JSON.parse(await storage.get(k) ?? 'null') as Intent | null;
    const save = async (k: string, intent: Intent) => {
        // Keep an in-process recovery path even when persistent storage rejects the write.
        unsaved.set(k, intent);
        if (unreadable.has(k)) throw new Error('Sign-out storage could not be read; existing durable intent is preserved.');
        if (intent.signedOut || intent.pending) await storage.set(k, JSON.stringify(intent));
        else await storage.remove(k);
        unsaved.delete(k);
    };
    // These operations are called only while serial holds the origin's existing lock.
    const held = {
        hasExplicitLogout: async (server: string) => Boolean((await read(key(server)))?.signedOut),
        beginExplicitLogout: async (server: string, token?: string) => {
            const k = key(server);
            const previous = await read(k).catch(() => { unreadable.add(k); return null; });
            const tokens = browser ? [] : [...new Set([...(previous?.refreshTokens ?? []), ...(token ? [token] : [])])];
            await save(k, { signedOut: true, pending: browser || tokens.length > 0, ...(tokens.length ? { refreshTokens: tokens } : {}) });
        },
        /** A rotated token arriving after logout must be revoked without signing out a replacement account. */
        enqueueRevocation: async (server: string, token: string) => {
            const k = key(server);
            if (browser) throw new Error('Browser invalidation does not accept refresh tokens.');
            const previous = await read(k);
            await save(k, { signedOut: previous?.signedOut ?? false, pending: true, refreshTokens: [...new Set([...(previous?.refreshTokens ?? []), token])] });
        },
        flushExplicitLogout: async (server: string) => {
            const k = key(server);
            const intent = await read(k);
            if (!intent?.pending) return;
            if (browser) {
                await revoke(server);
                await save(k, { signedOut: intent.signedOut, pending: false }).catch(() => undefined);
            } else {
                const remaining = [...(intent.refreshTokens ?? [])];
                while (remaining.length) {
                    await revoke(server, remaining[0]);
                    remaining.shift();
                    await save(k, { signedOut: intent.signedOut, pending: remaining.length > 0, ...(remaining.length ? { refreshTokens: remaining } : {}) }).catch(() => undefined);
                }
            }
        },
        finishExplicitLogin: async (server: string) => {
            const k = key(server);
            const intent = await read(k);
            if (intent?.pending) await save(k, { ...intent, signedOut: false });
            else await save(k, { signedOut: false, pending: false });
        }
    };
    return {
        hasExplicitLogout: (server: string) => serial(server, () => held.hasExplicitLogout(server)),
        beginExplicitLogout: (server: string, token?: string) => serial(server, () => held.beginExplicitLogout(server, token)),
        enqueueRevocation: (server: string, token: string) => serial(server, () => held.enqueueRevocation(server, token)),
        flushExplicitLogout: (server: string) => serial(server, () => held.flushExplicitLogout(server)),
        finishExplicitLogin: (server: string) => serial(server, () => held.finishExplicitLogin(server)),
        isSessionBusy: (server: string) => (active.get(key(server)) ?? 0) > 0,
        /** Cookie issuance and revocation share one lock, including across provider remounts. */
        withBrowserSession: <T>(server: string, work: (intent: typeof held) => Promise<T>): Promise<T> => {
            if (!browser) return Promise.reject(new Error('Cookie session operations are browser-only.'));
            return serial(server, () => work(held));
        }
    };
}
