import { useEffect, useState } from 'react';

/**
 * Return a debounced version of `value` that only updates after `delayMs` of inactivity.
 *
 * Useful for search inputs so typing does not spam network requests while still keeping UI reactive.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState<T>(value);

    useEffect(() => {
        if (delayMs <= 0) return;

        const timeoutId = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timeoutId);
    }, [delayMs, value]);

    // If debouncing is disabled, return the raw value directly to avoid a redundant state update.
    return delayMs <= 0 ? value : debounced;
}
