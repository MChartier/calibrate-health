import { getRouteByPath } from './routeRegistry';

export const NOT_FOUND_DOCUMENT_TITLE = 'Page not found - Calibrate';

export function getRouteDocumentTitle(pathname: string): string {
    return getRouteByPath(pathname)?.definition.documentTitle ?? NOT_FOUND_DOCUMENT_TITLE;
}

export function getRouteBackLabel(pathname: string, canGoBack: boolean): string | null {
    const match = getRouteByPath(pathname);
    if (!match?.definition.parent) return null;
    if (canGoBack) return 'Go back';
    return match.definition.backLabel ?? 'Go back';
}

export function hasBrowserHistorySinceMount(initialLength: number, currentLength: number): boolean {
    return currentLength > initialLength;
}
