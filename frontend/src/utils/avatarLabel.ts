/**
 * Derive a short, stable label for the user's Avatar when we don't have a profile image.
 */
export function getAvatarLabel(email?: string): string {
    const trimmed = email?.trim();
    if (!trimmed) return '?';
    return trimmed[0].toUpperCase();
}

