export function isAppForeground(): boolean {
    return typeof document !== 'undefined' && document.visibilityState !== 'hidden';
}

export function subscribeAppForeground(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    document.addEventListener('visibilitychange', listener);
    window.addEventListener('focus', listener);
    window.addEventListener('pageshow', listener);
    return () => {
        document.removeEventListener('visibilitychange', listener);
        window.removeEventListener('focus', listener);
        window.removeEventListener('pageshow', listener);
    };
}
