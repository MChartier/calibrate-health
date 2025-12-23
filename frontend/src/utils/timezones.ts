export type TimeZoneOption = {
    /** IANA timezone identifier stored in the database (e.g. "America/Los_Angeles"). */
    value: string;
    /** Friendly display label for humans (e.g. "Los Angeles (America)"). */
    label: string;
    /** Search text used by autocomplete filtering. */
    searchText: string;
};

/**
 * Return the list of supported IANA timezone identifiers in the current runtime.
 *
 * Uses `Intl.supportedValuesOf('timeZone')` when available. If not supported (older browsers),
 * falls back to a minimal list that still allows selecting the current detected zone + UTC.
 */
export function listSupportedTimeZones(): string[] {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supportedValuesOf === 'function') {
        return supportedValuesOf('timeZone');
    }

    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fallback = new Set<string>(['UTC']);
    if (detected) fallback.add(detected);
    return Array.from(fallback);
}

/**
 * Create a human-friendly label from an IANA timezone identifier.
 */
export function formatTimeZoneLabel(timeZone: string): string {
    const trimmed = timeZone.trim();
    if (!trimmed) return 'UTC';

    const parts = trimmed.split('/');
    const region = parts[0] ?? trimmed;
    const city = (parts[parts.length - 1] ?? trimmed).replace(/_/g, ' ');
    const subregion = parts.length > 2 ? (parts[parts.length - 2] ?? '').replace(/_/g, ' ') : null;

    if (parts.length === 1) return trimmed;
    if (subregion && subregion !== region) return `${city} (${subregion})`;
    return `${city} (${region})`;
}

/**
 * Compute the UTC offset in minutes for the supplied IANA timezone at the given date.
 *
 * Note: offsets can include minutes (e.g. +05:45).
 */
export function getTimeZoneOffsetMinutes(timeZone: string, at: Date): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(at);
    const values: Record<string, string> = {};
    for (const part of parts) {
        if (part.type !== 'literal') {
            values[part.type] = part.value;
        }
    }

    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    const second = Number(values.second);

    if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) {
        throw new Error('Unable to compute timezone offset');
    }

    const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    return Math.round((asUtcMs - at.getTime()) / 60000);
}

/**
 * Format an offset (in minutes) into `UTC±HH:MM`.
 */
export function formatUtcOffset(offsetMinutes: number): string {
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Format the current time in the supplied timezone for display alongside its offset.
 */
export function formatTimeInZone(timeZone: string, at: Date): string {
    return new Intl.DateTimeFormat(undefined, {
        timeZone,
        hour: '2-digit',
        minute: '2-digit'
    }).format(at);
}

/**
 * Build stable autocomplete options for timezone selection.
 */
export function buildTimeZoneOptions(): TimeZoneOption[] {
    const now = new Date();
    const offsets = new Map<string, number>();
    const getOffset = (timeZone: string): number => {
        const cached = offsets.get(timeZone);
        if (cached !== undefined) return cached;
        try {
            const computed = getTimeZoneOffsetMinutes(timeZone, now);
            offsets.set(timeZone, computed);
            return computed;
        } catch {
            offsets.set(timeZone, 0);
            return 0;
        }
    };

    return listSupportedTimeZones()
        .map((value) => {
            const label = formatTimeZoneLabel(value);
            const searchText = `${label} ${value}`.toLowerCase();
            return { value, label, searchText };
        })
        .sort((a, b) => {
            const offsetDelta = getOffset(a.value) - getOffset(b.value);
            if (offsetDelta !== 0) return offsetDelta;
            const labelDelta = a.label.localeCompare(b.label);
            if (labelDelta !== 0) return labelDelta;
            return a.value.localeCompare(b.value);
        });
}
