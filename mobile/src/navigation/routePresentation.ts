/**
 * Provides Expo client behavior for route presentation.
 */
import { getRouteByPath } from './routeRegistry';

export const NOT_FOUND_DOCUMENT_TITLE = 'Page not found - Calibrate';

/** Resolve the route document title from the current validated state. */
export function getRouteDocumentTitle(pathname: string): string {
    return getRouteByPath(pathname)?.definition.documentTitle ?? NOT_FOUND_DOCUMENT_TITLE;
}

/** Resolve the route back label from the current validated state. */
export function getRouteBackLabel(pathname: string, canGoBack: boolean): string | null {
    const match = getRouteByPath(pathname);
    if (!match?.definition.parent) return null;
    if (canGoBack) return 'Go back';
    return match.definition.backLabel ?? 'Go back';
}

/** Check whether the current state has browser history since mount. */
export function hasBrowserHistorySinceMount(initialLength: number, currentLength: number): boolean {
    return currentLength > initialLength;
}
