/**
 * Return the browser's current IANA time zone identifier, falling back to UTC.
 */
export function getBrowserTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Return the runtime's supported IANA time zones when available.
 *
 * Some browsers do not implement Intl.supportedValuesOf, so we fall back to the resolved time zone.
 */
export function getSupportedTimeZones(): string[] {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => unknown }).supportedValuesOf;
    if (typeof supportedValuesOf === 'function') {
        try {
            const zones = supportedValuesOf('timeZone');
            if (Array.isArray(zones)) {
                return zones.filter((value): value is string => typeof value === 'string');
            }
        } catch {
            // Ignore and fall back to a minimal list.
        }
    }

    return [getBrowserTimeZone()];
}
