export type BoundSession = {
    version: 1;
    origin: string;
    accessToken: string | null;
    refreshToken: string | null;
};

export type TargetTransitionStore = {
    readBinding: () => Promise<string | null>;
    readLegacy: () => Promise<{ origin: string | null; accessToken: string | null; refreshToken: string | null }>;
    inspectLocalState: (previousOrigin?: string) => Promise<{ hasState: boolean }>;
    preserveSession: (session: BoundSession) => Promise<void>;
    commitBinding: (session: BoundSession) => Promise<void>;
};

export const TARGET_RECOVERY_GUIDANCE = 'Calibrate could not safely prepare this build. Your saved data is preserved. Retry after device storage is available. If this build uses a different service, reopen a build configured for the previous service and resolve pending changes there. Do not clear app storage.';

/** Stored identities must be explicit origins; never infer the owner of legacy credentials. */
export function storedOrigin(value: string): string {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash || value.trim() !== value) {
        throw new Error('Saved service identity is invalid.');
    }
    return url.origin;
}

export function parseBoundSession(raw: string): BoundSession {
    const value = JSON.parse(raw) as BoundSession;
    if (value?.version !== 1 || typeof value.origin !== 'string' || storedOrigin(value.origin) !== value.origin ||
        ![value.accessToken, value.refreshToken].every(token => token === null || (typeof token === 'string' && token.length > 0))) {
        throw new Error('Saved session binding is unreadable.');
    }
    return value;
}

/** One SecureStore record commits origin and credentials together, including after an interrupted write. */
export async function prepareTarget(target: string, store: TargetTransitionStore): Promise<BoundSession> {
    const origin = storedOrigin(target);
    const raw = await store.readBinding();
    let previous: BoundSession | null = raw === null ? null : parseBoundSession(raw);
    if (!previous) {
        const legacy = await store.readLegacy();
        if (legacy.origin !== null) {
            previous = parseBoundSession(JSON.stringify({ ...legacy, version: 1, origin: storedOrigin(legacy.origin) }));
        } else {
            const local = await store.inspectLocalState();
            if (legacy.accessToken || legacy.refreshToken || local.hasState) {
                throw new Error('The previous service cannot be identified safely.');
            }
        }
    }
    if (previous?.origin === origin) {
        if (raw === null) await store.commitBinding(previous);
        return previous;
    }
    if (previous) {
        await store.inspectLocalState(previous.origin);
        // Recovery copy is never read as an active session. Failure leaves the active record untouched.
        await store.preserveSession(previous);
    }
    const next: BoundSession = { version: 1, origin, accessToken: null, refreshToken: null };
    await store.commitBinding(next);
    return next;
}
