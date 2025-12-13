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

