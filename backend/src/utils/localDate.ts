import { getUtcTodayDateOnlyInTimeZone, normalizeToUtcDateOnly } from './date';

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

