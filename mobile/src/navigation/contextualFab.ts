import type { FoodLogDayStatus } from '@calibrate/api-client';

export type ContextualFabKind = 'add-food' | null;

export function getActiveTabRoute(pathname: string): 'today' | 'progress' | 'food-log' | null {
    const segments = pathname.split('?')[0].replace(/\/+$/, '').split('/').filter(Boolean);
    const route = segments[segments.length - 1];
    if (route === 'today' || route === 'progress' || route === 'food-log') return route;
    return null;
}

export function resolveContextualFab(input: {
    pathname: string;
    foodDayStatus?: FoodLogDayStatus;
    foodDayStatusLoaded?: boolean;
}): ContextualFabKind {
    const activeRoute = getActiveTabRoute(input.pathname);
    if (activeRoute !== 'food-log') return null;
    if (!input.foodDayStatusLoaded || input.foodDayStatus !== 'OPEN') return null;
    return 'add-food';
}
