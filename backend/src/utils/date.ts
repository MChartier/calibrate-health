export function normalizeToUtcDateOnly(input: unknown): Date {
  const date =
    input instanceof Date
      ? input
      : typeof input === 'string' || typeof input === 'number'
        ? new Date(input)
        : new Date(NaN);

  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid date');
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getUtcTodayDateOnly(): Date {
  return normalizeToUtcDateOnly(new Date());
}

/**
 * Format a Date into a calendar date string ("YYYY-MM-DD") for the supplied IANA time zone.
 *
 * This is useful for deriving "local day" semantics (e.g. for logging/queries) while storing
 * timestamps in UTC.
 */
export function formatDateToLocalDateString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Unable to format local date');
  }

  return `${year}-${month}-${day}`;
}

/**
 * Return a UTC Date at midnight that represents "today" in the supplied IANA time zone.
 *
 * The returned Date is intentionally UTC-normalized so it can be safely stored in Postgres DATE columns.
 */
export function getUtcTodayDateOnlyInTimeZone(timeZone: string, now: Date = new Date()): Date {
  const localDate = formatDateToLocalDateString(now, timeZone);
  return normalizeToUtcDateOnly(localDate);
}

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a date-like input into a UTC-normalized Date suitable for Postgres DATE columns.
 *
 * Accepted inputs:
 * - "YYYY-MM-DD"
 * - any string starting with "YYYY-MM-DD" (e.g. "YYYY-MM-DDT12:00:00Z")
 */
export function parseLocalDateOnly(input: unknown): Date {
  if (typeof input !== 'string') {
    throw new Error('Invalid local date');
  }

  const trimmed = input.trim();
  if (trimmed.length < 10) {
    throw new Error('Invalid local date');
  }

  const datePart = trimmed.slice(0, 10);
  if (!LOCAL_DATE_PATTERN.test(datePart)) {
    throw new Error('Invalid local date');
  }

  return normalizeToUtcDateOnly(datePart);
}

/**
 * Compute "today" in the supplied IANA time zone as a UTC-normalized DATE value.
 *
 * This is a safe wrapper that falls back to UTC when the user's timezone value is missing/invalid.
 */
export function getSafeUtcTodayDateOnlyInTimeZone(timeZone: unknown, now: Date = new Date()): Date {
  const tz = typeof timeZone === 'string' && timeZone.trim().length > 0 ? timeZone.trim() : 'UTC';

  try {
    return getUtcTodayDateOnlyInTimeZone(tz, now);
  } catch {
    return getUtcTodayDateOnlyInTimeZone('UTC', now);
  }
}

/**
 * Validate an IANA time zone identifier (e.g. "America/Los_Angeles").
 *
 * Node's Intl implementation throws a RangeError when an unknown timeZone is provided,
 * so we can use that as a lightweight runtime validator.
 */
export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
