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
 * Parse an ISO date-only string (`YYYY-MM-DD`) into numeric parts.
 *
 * Returns null for invalid inputs. We treat the input as a calendar date (not a moment in time),
 * so the parsing intentionally ignores timezone semantics.
 */
function parseIsoDateParts(dateIso: string): { year: number; month: number; day: number } | null {
    const datePart = dateIso.split('T')[0] ?? '';
    const [yearString, monthString, dayString] = datePart.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return { year, month, day };
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

/**
 * Format an ISO date-only string (`YYYY-MM-DD`) into a user-friendly label like
 * "Saturday, December 27, 2025".
 *
 * We treat the input as a plain calendar date (not a moment in time) and format it in UTC
 * to avoid off-by-one day issues when the browser's local timezone differs from the user's log timezone.
 */
export function formatIsoDateForDisplay(dateIso: string): string {
    const parts = parseIsoDateParts(dateIso);
    if (!parts) return dateIso;

    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (Number.isNaN(date.getTime())) return dateIso;

    return new Intl.DateTimeFormat(undefined, {
        timeZone: 'UTC',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

/**
 * Returns true when the provided date is US Thanksgiving (fourth Thursday in November).
 */
function isUsThanksgivingDate(parts: { year: number; month: number; day: number }): boolean {
    if (parts.month !== 11) return false;

    // Find the first Thursday in November, then add 3 weeks.
    const nov1 = new Date(Date.UTC(parts.year, 10, 1));
    const nov1Weekday = nov1.getUTCDay(); // 0=Sun ... 4=Thu
    const thursdayIndex = 4;
    const firstThursday = 1 + ((thursdayIndex - nov1Weekday + 7) % 7);
    const thanksgivingDay = firstThursday + 21;

    return parts.day === thanksgivingDay;
}

/**
 * Returns true when `year` is a leap year (Gregorian calendar).
 */
function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Return an optional holiday emoji to decorate a given local-date string (`YYYY-MM-DD`).
 *
 * The input is treated as a pure calendar date (not a moment in time), so we match on month/day
 * without doing any timezone conversions.
 */
export function getHolidayEmojiForIsoDate(dateIso: string): string | null {
    const parts = parseIsoDateParts(dateIso);
    if (!parts) return null;

    // Christmas Day.
    if (parts.month === 12 && parts.day === 25) return '\u{1F384}';

    // Halloween.
    if (parts.month === 10 && parts.day === 31) return '\u{1F383}';

    // Valentine's Day.
    if (parts.month === 2 && parts.day === 14) return '\u2764\uFE0F';

    // New Year's Eve.
    if (parts.month === 12 && parts.day === 31) return '\u{1F386}';

    // New Year's Day.
    if (parts.month === 1 && parts.day === 1) return '\u{1F389}';

    // Thanksgiving (US - fourth Thursday in November).
    if (isUsThanksgivingDate(parts)) return '\u{1F983}';

    return null;
}

/**
 * Return an optional birthday emoji when the provided date matches the user's birthday.
 *
 * We compare only the calendar month/day (ignoring the birth year), and treat both inputs as plain
 * dates (not moments in time) so we can safely accept ISO strings with or without a time portion.
 *
 * For users born on Feb 29, we treat Feb 28 as their birthday on non-leap years so they still get
 * the "birthday" decoration most years.
 */
export function getBirthdayEmojiForIsoDate(dateIso: string, dateOfBirthIso?: string | null): string | null {
    if (!dateOfBirthIso) return null;

    const dateParts = parseIsoDateParts(dateIso);
    const dobParts = parseIsoDateParts(dateOfBirthIso);
    if (!dateParts || !dobParts) return null;

    // Leap day handling: users born on Feb 29 see the birthday emoji on Feb 29 when it exists,
    // otherwise we show it on Feb 28.
    if (dobParts.month === 2 && dobParts.day === 29) {
        if (dateParts.month === 2 && dateParts.day === 29) return '\u{1F382}';
        if (!isLeapYear(dateParts.year) && dateParts.month === 2 && dateParts.day === 28) return '\u{1F382}';
        return null;
    }

    if (dateParts.month === dobParts.month && dateParts.day === dobParts.day) return '\u{1F382}';

    return null;
}
