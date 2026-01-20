/**
 * Avatar label helpers for users without profile photos.
 */
export function getAvatarLabel(email?: string): string {
    const trimmed = email?.trim();
    if (!trimmed) return '?';
    return trimmed[0].toUpperCase();
}
