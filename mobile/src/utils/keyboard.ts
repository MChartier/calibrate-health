export type KeyboardAvoidingBehavior = 'height' | 'padding' | undefined;

/** Keeps form content visible without duplicating Android's window-resize handling. */
export function getKeyboardAvoidingBehavior(platform: string): KeyboardAvoidingBehavior {
    if (platform === 'ios') return 'padding';
    return undefined;
}
