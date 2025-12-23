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

