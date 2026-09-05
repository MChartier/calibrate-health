type Navigate = () => void;
type NavigationGuard = (navigate: Navigate) => Promise<void>;

let activeGuard: NavigationGuard | undefined;

/** Only the focused editor owns shell navigation; retained routes must not block it. */
export function registerNavigationGuard(guard: NavigationGuard): () => void {
    activeGuard = guard;
    return () => {
        if (activeGuard === guard) activeGuard = undefined;
    };
}

/** Stop a link's default action synchronously, before its asynchronous confirmation. */
export function interceptGuardedNavigation(navigate: Navigate, preventDefault: () => void): boolean {
    if (!activeGuard) return false;
    preventDefault();
    void activeGuard(navigate);
    return true;
}

export function requestGuardedNavigation(navigate: Navigate): void {
    if (activeGuard) void activeGuard(navigate);
    else navigate();
}
