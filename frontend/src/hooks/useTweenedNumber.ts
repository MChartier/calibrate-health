import { useEffect, useRef, useState } from 'react';

type TweenedNumberOptions = {
    /** Duration of the tween in milliseconds. */
    durationMs?: number;
    /** Disable tweening and jump directly to the target. */
    disabled?: boolean;
};

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Tween a number from its previous value to a new target value using requestAnimationFrame.
 *
 * This is intentionally lightweight (no additional animation deps) and works well for
 * small "state transitions" like date navigation on /log.
 */
export function useTweenedNumber(target: number, options?: TweenedNumberOptions): number {
    const durationMs = options?.durationMs ?? 420;
    const disabled = options?.disabled ?? false;

    const rafRef = useRef<number | null>(null);
    const valueRef = useRef(target);
    const [value, setValue] = useState(target);

    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    useEffect(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        if (disabled || durationMs <= 0 || !Number.isFinite(target)) {
            if (Object.is(valueRef.current, target)) return;
            valueRef.current = target;

            // Avoid calling setState synchronously inside an effect body (eslint rule).
            rafRef.current = requestAnimationFrame(() => {
                setValue(target);
                rafRef.current = null;
            });

            return () => {
                if (rafRef.current !== null) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = null;
                }
            };
        }

        const from = valueRef.current;
        const to = target;
        if (from === to) return;

        const start = performance.now();

        const tick = (now: number) => {
            const elapsed = now - start;
            const t = Math.min(1, elapsed / durationMs);
            const eased = easeOutCubic(t);
            const next = from + (to - from) * eased;
            valueRef.current = next;
            setValue(next);
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
            }
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [disabled, durationMs, target]);

    return value;
}
