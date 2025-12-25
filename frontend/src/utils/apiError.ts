import axios from 'axios';

/**
 * Extract a concise, user-facing message from an Axios error response.
 *
 * Backend routes typically respond with `{ message: string }` on validation failures.
 * This helper prefers that message and falls back to null when unavailable.
 */
export function getApiErrorMessage(error: unknown): string | null {
    if (!axios.isAxiosError(error)) return null;

    const data = error.response?.data as { message?: unknown } | undefined;
    const message = data?.message;
    if (typeof message !== 'string') return null;

    const trimmed = message.trim();
    return trimmed.length > 0 ? trimmed : null;
}

