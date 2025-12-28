import { useCallback, useEffect, useRef, useState } from 'react';

export type TransientStatusTone = 'success' | 'error' | 'neutral';

export type TransientStatus = {
    /** Status text to display (kept intentionally short; long text may be truncated by the renderer). */
    text: string;
    /** Visual tone used to color the status text. */
    tone: TransientStatusTone;
};

type ShowStatusOptions = {
    /**
     * Automatically clears the status after this many milliseconds.
     *
     * Pass `null` to keep the status visible until replaced/cleared.
     */
    autoHideMs?: number | null;
};

const DEFAULT_AUTO_HIDE_MS: Record<TransientStatusTone, number> = {
    success: 1500,
    error: 3000,
    neutral: 1500
};

/**
 * useTransientStatus
 *
 * Small helper for showing short-lived inline status messages (e.g. "Changes saved") without
 * introducing layout shifts (pair with `InlineStatusLine` which reserves space).
 */
export function useTransientStatus() {
    const [status, setStatus] = useState<TransientStatus | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const clearStatus = useCallback(() => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setStatus(null);
    }, []);

    const showStatus = useCallback((text: string, tone: TransientStatusTone, options?: ShowStatusOptions) => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        setStatus({ text, tone });

        const autoHideMs = options?.autoHideMs ?? DEFAULT_AUTO_HIDE_MS[tone];
        if (autoHideMs !== null && autoHideMs > 0) {
            timeoutRef.current = window.setTimeout(() => {
                setStatus(null);
                timeoutRef.current = null;
            }, autoHideMs);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, []);

    return { status, showStatus, clearStatus };
}

