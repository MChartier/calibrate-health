import type { MetricEntry } from '@calibrate/api-client';

export function getMetricDate(metric: Pick<MetricEntry, 'date'>): string {
    return metric.date.split('T')[0] ?? metric.date;
}

export function getLatestMetric<T extends Pick<MetricEntry, 'date'>>(
    metrics: ReadonlyArray<T> | null | undefined
): T | undefined {
    return metrics?.reduce<T | undefined>((latest, metric) => {
        if (!latest) return metric;
        return getMetricDate(metric) > getMetricDate(latest) ? metric : latest;
    }, undefined);
}
