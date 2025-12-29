import { useEffect, useState } from 'react';

/**
 * Return a debounced version of `value` that only updates after `delayMs` of inactivity.
 *
 * Useful for search inputs so typing does not spam network requests while still keeping UI reactive.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState<T>(value);

    useEffect(() => {
        if (delayMs <= 0) {
            setDebounced(value);
            return;
        }

        const timeoutId = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timeoutId);
    }, [delayMs, value]);

    return debounced;
}

