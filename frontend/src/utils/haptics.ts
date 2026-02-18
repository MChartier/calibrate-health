/**
 * Centralized haptics utility so all vibration behavior is gated behind one preference-aware API.
 */
type HapticPattern = number | number[];

const HAPTIC_PATTERNS = {
    TAP: 10,
    SUCCESS: 15,
    WARNING: [20, 40, 20],
    ERROR: [30, 30, 30]
} as const satisfies Record<string, HapticPattern>;

let hapticsEnabled = true;

const hasVibrationApi = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    return typeof navigator.vibrate === 'function';
};

const prefersReducedMotion = (): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const canVibrate = (): boolean => {
    if (!hapticsEnabled) return false;
    if (!hasVibrationApi()) return false;
    if (prefersReducedMotion()) return false;
    return true;
};

const triggerVibration = (pattern: HapticPattern): void => {
    if (!canVibrate()) return;

    try {
        navigator.vibrate(pattern);
    } catch {
        // Ignore unsupported-device/runtime errors so callers never need local guards.
    }
};

/**
 * Update the runtime haptics preference (usually from user settings).
 */
export const setHapticsEnabled = (enabled: boolean): void => {
    hapticsEnabled = enabled;
};

/**
 * Return whether the current browser environment can attempt vibration.
 */
export const supportsHaptics = (): boolean => hasVibrationApi();

export const haptic = {
    tap: (): void => triggerVibration(HAPTIC_PATTERNS.TAP),
    success: (): void => triggerVibration(HAPTIC_PATTERNS.SUCCESS),
    warning: (): void => triggerVibration(HAPTIC_PATTERNS.WARNING),
    error: (): void => triggerVibration(HAPTIC_PATTERNS.ERROR)
};

