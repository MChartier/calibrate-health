export const MIN_AUTH_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes of a password; cap input so users do not create misleading secrets.
export const MAX_AUTH_PASSWORD_LENGTH = 72;

const MAX_EMAIL_LENGTH = 254;
const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize an email credential for lookup/storage.
 *
 * The validator is intentionally lightweight: it catches malformed credentials before
 * hitting Prisma while still leaving detailed deliverability rules to email providers.
 */
export function normalizeEmailCredential(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH) return null;
  if (!BASIC_EMAIL_PATTERN.test(normalized)) return null;

  return normalized;
}

/**
 * Validate password credential shape and bcrypt-safe length.
 */
export function validatePasswordCredential(value: unknown, label = 'Password'): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return `${label} is required`;
  }

  if (value.length < MIN_AUTH_PASSWORD_LENGTH) {
    return `${label} must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters`;
  }

  if (value.length > MAX_AUTH_PASSWORD_LENGTH) {
    return `${label} must be at most ${MAX_AUTH_PASSWORD_LENGTH} characters`;
  }

  return null;
}
