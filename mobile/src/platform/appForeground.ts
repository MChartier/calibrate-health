import { AppState } from 'react-native';

export function isAppForeground(): boolean {
    return AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
}

export function subscribeAppForeground(listener: () => void): () => void {
    const subscription = AppState.addEventListener('change', listener);
    return () => subscription.remove();
}
