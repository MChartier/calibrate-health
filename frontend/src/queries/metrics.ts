import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { type MetricsRange } from '../constants/metricsRanges';

/**
 * React Query helpers for weight metrics.
 */
export type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

export type MetricTrendEntry = MetricEntry & {
    trend_weight: number;
    trend_ci_lower: number;
    trend_ci_upper: number;
    trend_std: number;
};

export type MetricTrendVolatility = 'low' | 'medium' | 'high';

export type TrendMetricsResponse = {
    metrics: MetricTrendEntry[];
    meta: {
        weekly_rate: number;
        volatility: MetricTrendVolatility;
        total_points: number;
        total_span_days: number;
    };
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
 * Fetch trend-augmented metrics prepared by the server for chart rendering.
 */
export async function fetchTrendMetrics(range: MetricsRange): Promise<TrendMetricsResponse> {
    const res = await axios.get('/api/metrics', {
        params: {
            include_trend: 'true',
            range
        }
    });

    const metrics = Array.isArray(res.data?.metrics) ? (res.data.metrics as MetricTrendEntry[]) : [];
    const meta = res.data?.meta;

    return {
        metrics,
        meta: {
            weekly_rate: typeof meta?.weekly_rate === 'number' ? meta.weekly_rate : 0,
            volatility: meta?.volatility === 'high' || meta?.volatility === 'medium' ? meta.volatility : 'low',
            total_points: typeof meta?.total_points === 'number' ? meta.total_points : metrics.length,
            total_span_days: typeof meta?.total_span_days === 'number' ? meta.total_span_days : (metrics.length > 0 ? 1 : 0)
        }
    };
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
