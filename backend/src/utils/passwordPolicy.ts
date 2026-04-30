export const MIN_PASSWORD_LENGTH = 8;
// bcrypt truncates long passwords; cap inputs so users do not set an ambiguous secret.
export const MAX_PASSWORD_LENGTH = 72;

/**
 * Validate password length against the policy used for registration and password changes.
 */
export function validatePasswordPolicy(value: unknown, label: string): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return `${label} is required`;
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `${label} must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (value.length > MAX_PASSWORD_LENGTH) {
    return `${label} must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }

  return null;
}
