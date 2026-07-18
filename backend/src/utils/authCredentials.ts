export const MIN_AUTH_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 UTF-8 bytes of a password; cap input so users do not create misleading secrets.
export const MAX_AUTH_PASSWORD_BYTES = 72;
// Comparing against a fixed valid hash keeps unknown-account login timing close to wrong-password timing.
export const DUMMY_AUTH_PASSWORD_HASH = '$2b$10$24sOV1l/uVCwMwPmB4.2X.K6q10fTODGqeX7xEILbzcoM0zIgAwFC';

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

/** Reject values bcrypt would silently truncate after UTF-8 encoding. */
export function validateBcryptPasswordByteLength(value: string, label = 'Password'): string | null {
  return Buffer.byteLength(value, 'utf8') > MAX_AUTH_PASSWORD_BYTES
    ? `${label} must be at most ${MAX_AUTH_PASSWORD_BYTES} bytes`
    : null;
}

/**
 * Validate password credential shape and bcrypt-safe UTF-8 byte length.
 */
export function validatePasswordCredential(value: unknown, label = 'Password'): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return `${label} is required`;
  }

  if (value.length < MIN_AUTH_PASSWORD_LENGTH) {
    return `${label} must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters`;
  }

  const byteLengthError = validateBcryptPasswordByteLength(value, label);
  if (byteLengthError) return byteLengthError;

  return null;
}
