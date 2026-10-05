type Navigate = () => void;
export type PrepareNavigation = () => Promise<boolean>;

type NavigationGuard = (navigate: Navigate, prepare?: PrepareNavigation) => Promise<void>;

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

export function requestGuardedNavigation(navigate: Navigate, prepare?: PrepareNavigation): void {
    if (activeGuard) void activeGuard(navigate, prepare);
    else if (prepare) void prepare().then((ready) => { if (ready) navigate(); });
    else navigate();
}
