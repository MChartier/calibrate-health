/**
 * Returns true when the provided value is a valid IANA time zone identifier supported by the runtime.
 *
 * We validate via Intl because it is available on both Node and browsers and handles the IANA database.
 */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format();
    return true;
  } catch {
    return false;
  }
}

