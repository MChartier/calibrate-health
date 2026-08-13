import { Alert, Platform } from 'react-native';

const DISCARD_TITLE = 'Discard changes?';
const DISCARD_MESSAGE = 'Your unsaved changes will be lost.';

/** Cross-platform confirmation shared by dismissible editing overlays. */
export function confirmDiscardChanges(): Promise<boolean> {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return Promise.resolve(window.confirm(`${DISCARD_TITLE}\n\n${DISCARD_MESSAGE}`));
    }

    return new Promise((resolve) => {
        Alert.alert(DISCARD_TITLE, DISCARD_MESSAGE, [
            { text: 'Keep editing', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Discard', style: 'destructive', onPress: () => resolve(true) }
        ], { cancelable: true, onDismiss: () => resolve(false) });
    });
}
