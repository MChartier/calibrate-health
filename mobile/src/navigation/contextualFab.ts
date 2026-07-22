import type { MetricEntry } from '@calibrate/api-client';
import { hasMetricForDate } from '../utils/metrics';

export type ContextualFabKind = 'add-food' | 'log-weight' | null;

export function getActiveTabRoute(pathname: string): 'today' | 'progress' | 'food-log' | null {
    const segments = pathname.split('?')[0].replace(/\/+$/, '').split('/').filter(Boolean);
    const route = segments[segments.length - 1];
    if (route === 'today' || route === 'progress' || route === 'food-log') return route;
    return null;
}

export function resolveContextualFab(input: {
    pathname: string;
    today: string;
    metrics: MetricEntry[] | undefined;
    metricsLoaded: boolean;
}): ContextualFabKind {
    const activeRoute = getActiveTabRoute(input.pathname);
    if (activeRoute === 'today' || activeRoute === 'food-log') return 'add-food';
    if (activeRoute !== 'progress' || !input.metricsLoaded) return null;
    return hasMetricForDate(input.metrics ?? [], input.today) ? null : 'log-weight';
}
