import { getDefaultServerUrl, normalizeServerUrl } from '../config/server';

const BROWSER_SERVER_URL_KEY = 'calibrate.web.serverUrl';

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>;

function getBrowserStorage(): BrowserStorage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/** Restore only the selected server origin; browser credentials remain in HttpOnly cookies. */
export function readBrowserServerUrl(
    storage: BrowserStorage | null = getBrowserStorage(),
    fallbackUrl = getDefaultServerUrl(),
    preferFallback = process.env.EXPO_PUBLIC_CALIBRATE_AUTO_LOGIN_TEST_USER === 'true'
): string {
    // Automatic local testing must not silently reuse a previously selected remote server.
    if (preferFallback) return fallbackUrl;
    if (!storage) return fallbackUrl;
    try {
        const storedUrl = storage.getItem(BROWSER_SERVER_URL_KEY);
        return storedUrl ? normalizeServerUrl(storedUrl) ?? fallbackUrl : fallbackUrl;
    } catch {
        return fallbackUrl;
    }
}

/** Persist a non-sensitive server origin without making storage availability an authentication dependency. */
export async function writeBrowserServerUrl(
    serverUrl: string,
    storage: BrowserStorage | null = getBrowserStorage()
): Promise<void> {
    if (!storage) return;
    try {
        storage.setItem(BROWSER_SERVER_URL_KEY, serverUrl);
    } catch {
        // Private browsing and storage policies may disable Web Storage.
    }
}
