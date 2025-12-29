import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

/**
 * Build the canonical React Query key for the current user's weight history.
 */
export function metricsQueryKey() {
    return ['metrics'] as const;
}

/**
 * Fetch the current user's weight entries (descending by date).
 */
export async function fetchMetrics(): Promise<MetricEntry[]> {
    const res = await axios.get('/api/metrics');
    return Array.isArray(res.data) ? (res.data as MetricEntry[]) : [];
}

/**
 * Shared hook for loading the current user's weight history.
 *
 * Centralizing this ensures /log widgets and dialogs share caching behavior.
 */
export function useMetricsQuery(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: metricsQueryKey(),
        queryFn: fetchMetrics,
        enabled: options?.enabled
    });
}

/**
 * Extract the date-only portion of a timestamp-like string (e.g. "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SSZ").
 */
export function toDatePart(value: string): string {
    return value.split('T')[0] ?? value;
}

/**
 * Return the most recent metric on-or-before a given local date string (`YYYY-MM-DD`).
 *
 * Metrics are expected to be in descending date order.
 */
export function findMetricOnOrBeforeDate(metrics: MetricEntry[], targetDate: string): MetricEntry | null {
    for (const metric of metrics) {
        const metricDate = toDatePart(metric.date);
        if (metricDate <= targetDate) return metric;
    }
    return null;
}

