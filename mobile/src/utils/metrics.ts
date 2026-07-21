import type { MetricEntry } from '@calibrate/api-client';

export function getMetricDate(metric: Pick<MetricEntry, 'date'>): string {
    return metric.date.split('T')[0] ?? metric.date;
}

export function hasMetricForDate(
    metrics: ReadonlyArray<Pick<MetricEntry, 'date'>>,
    date: string
): boolean {
    return metrics.some((metric) => getMetricDate(metric) === date);
}
