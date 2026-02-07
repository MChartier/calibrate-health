type BadgingNavigator = Navigator & {
    setAppBadge?: (value?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
};

/**
 * Check whether the Badging API is available on this platform.
 */
export const isBadgingSupported = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    const api = navigator as BadgingNavigator;
    return typeof api.setAppBadge === 'function' && typeof api.clearAppBadge === 'function';
};

/**
 * Set the app badge count if supported.
 */
export const setAppBadge = async (value: number): Promise<boolean> => {
    const api = navigator as BadgingNavigator;
    if (typeof api.setAppBadge !== 'function') {
        return false;
    }

    await api.setAppBadge(value);
    return true;
};

/**
 * Clear the app badge if supported.
 */
export const clearAppBadge = async (): Promise<boolean> => {
    const api = navigator as BadgingNavigator;
    if (typeof api.clearAppBadge !== 'function') {
        return false;
    }

    await api.clearAppBadge();
    return true;
};
