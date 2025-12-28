/**
 * Format a Date into "YYYY-MM-DD" for the supplied IANA time zone.
 *
 * This is used for "local day" semantics (e.g. log grouping) where the calendar date
 * must be stable across DST and independent of the server's timezone.
 */
export function formatDateToLocalDateString(date: Date, timeZone: string): string {
    const tz = timeZone.trim();

    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);

        const year = parts.find((part) => part.type === 'year')?.value;
        const month = parts.find((part) => part.type === 'month')?.value;
        const day = parts.find((part) => part.type === 'day')?.value;

        if (!year || !month || !day) {
            throw new Error('Missing date parts');
        }

        return `${year}-${month}-${day}`;
    } catch {
        // Fall back to UTC to keep output deterministic if Intl/timeZone formatting fails.
        return date.toISOString().slice(0, 10);
    }
}

/**
 * Return today's local date in `YYYY-MM-DD` format using the provided time zone.
 *
 * When no time zone is supplied, the browser's current zone is used with a UTC fallback.
 */
export function getTodayIsoDate(timeZone?: string): string {
    const resolved = timeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return formatDateToLocalDateString(new Date(), resolved);
}

/**
 * Add a day offset to an ISO date-only string (`YYYY-MM-DD`) using UTC math.
 *
 * This is safe for app-level "day navigation" because it avoids local time zone/DST skew.
 */
export function addDaysToIsoDate(dateIso: string, deltaDays: number): string {
    const [yearString, monthString, dayString] = dateIso.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        throw new Error('Invalid ISO date');
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + deltaDays);
    return date.toISOString().slice(0, 10);
}

/**
 * Clamp a date-only ISO string (`YYYY-MM-DD`) to an inclusive [min, max] range.
 *
 * Lexicographic comparison is safe for this format.
 */
export function clampIsoDate(dateIso: string, bounds: { min: string; max: string }): string {
    if (dateIso < bounds.min) return bounds.min;
    if (dateIso > bounds.max) return bounds.max;
    return dateIso;
}
