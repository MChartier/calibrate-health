/**
 * Provides the shared use focus visible component and interaction contract.
 */
import React from 'react';
import { Platform, type PressableProps } from 'react-native';

let lastWebInputWasKeyboard = true;
let webConsumerCount = 0;
const webFocusResetters = new Set<() => void>();

/** Mark keyboard input using validated domain inputs. */
function markKeyboardInput(event: KeyboardEvent) {
    if (!event.metaKey && !event.altKey && !event.ctrlKey) lastWebInputWasKeyboard = true;
}

/** Mark pointer input using validated domain inputs. */
function markPointerInput() {
    lastWebInputWasKeyboard = false;
    webFocusResetters.forEach((resetFocus) => resetFocus());
}

/** Retain web input listeners using validated domain inputs. */
function retainWebInputListeners() {
    webConsumerCount += 1;
    if (webConsumerCount !== 1) return;
    document.addEventListener('keydown', markKeyboardInput, true);
    document.addEventListener('pointerdown', markPointerInput, true);
    document.addEventListener('mousedown', markPointerInput, true);
    document.addEventListener('touchstart', markPointerInput, true);
}

/** Release web input listeners using validated domain inputs. */
function releaseWebInputListeners() {
    webConsumerCount -= 1;
    if (webConsumerCount !== 0) return;
    document.removeEventListener('keydown', markKeyboardInput, true);
    document.removeEventListener('pointerdown', markPointerInput, true);
    document.removeEventListener('mousedown', markPointerInput, true);
    document.removeEventListener('touchstart', markPointerInput, true);
}

/** Mirrors :focus-visible for shared React Native/Web pressables. */
export function useFocusVisible(
    onFocus?: PressableProps['onFocus'],
    onBlur?: PressableProps['onBlur']
) {
    const [focusVisible, setFocusVisible] = React.useState(false);
    const resetFocus = React.useCallback(() => setFocusVisible(false), []);

    React.useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
        webFocusResetters.add(resetFocus);
        retainWebInputListeners();
        return () => {
            webFocusResetters.delete(resetFocus);
            releaseWebInputListeners();
        };
    }, [resetFocus]);

    const handleFocus = React.useCallback<NonNullable<PressableProps['onFocus']>>((event) => {
        setFocusVisible(Platform.OS !== 'web' || lastWebInputWasKeyboard);
        onFocus?.(event);
    }, [onFocus]);

    const handleBlur = React.useCallback<NonNullable<PressableProps['onBlur']>>((event) => {
        setFocusVisible(false);
        onBlur?.(event);
    }, [onBlur]);

    return { focusVisible, handleFocus, handleBlur };
}
