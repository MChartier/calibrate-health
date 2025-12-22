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
