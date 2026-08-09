import { useEffect, useRef } from 'react';

const ROUTE_FOCUS_TITLE_ID = 'route-focus-title';
const ROUTE_FOCUS_FALLBACK_MS = 5_000;

function focusRouteTitle(): boolean {
    const title = document.getElementById(ROUTE_FOCUS_TITLE_ID);
    if (!title) return false;
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
    return true;
}

/**
 * Direct entries preserve browser focus so the skip link remains the first Tab
 * target. Client-side route changes move focus to the new route heading.
 */
export function useBrowserRouteFocus(pathname: string, title: string) {
    const previousPathnameRef = useRef(pathname);

    useEffect(() => {
        document.title = title;
        if (previousPathnameRef.current === pathname) return undefined;
        previousPathnameRef.current = pathname;

        if (focusRouteTitle()) return undefined;

        let fallbackTimer: number | null = null;
        const observer = new MutationObserver(() => {
            if (!focusRouteTitle()) return;
            observer.disconnect();
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        fallbackTimer = window.setTimeout(() => {
            observer.disconnect();
            document.querySelector<HTMLElement>('[role="main"]')?.focus({ preventScroll: true });
        }, ROUTE_FOCUS_FALLBACK_MS);
        return () => {
            observer.disconnect();
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        };
    }, [pathname, title]);
}
