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
