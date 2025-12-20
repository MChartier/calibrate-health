/**
 * Format a Date as `YYYY-MM-DD` using the provided IANA time zone identifier.
 *
 * This avoids relying on locale-specific formatting and keeps comparisons (string sort) predictable.
 */
export function formatDateToIsoDateInTimeZone(date: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
        throw new Error('Unable to format date');
    }

    return `${year}-${month}-${day}`;
}

/**
 * Return today's date in `YYYY-MM-DD` format using the provided time zone.
 *
 * When no time zone is supplied, the browser's current zone is used with a UTC fallback.
 */
export function getTodayIsoDate(timeZone?: string): string {
    const resolved =
        timeZone?.trim() ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        'UTC';

    try {
        return formatDateToIsoDateInTimeZone(new Date(), resolved);
    } catch {
        return formatDateToIsoDateInTimeZone(new Date(), 'UTC');
    }
}

