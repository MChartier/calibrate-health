import type { TrendMetricEntry } from '@calibrate/api-client';
import type { WeightUnit } from '@calibrate/shared';
import { formatWeight } from '../utils/format';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_DISPLAY_CHANGE = 0.05; // Matches the one-decimal precision used for displayed weights.

type VisibleTrendPoint = {
    dateMs: number;
    trendWeight: number;
};

export function isVisibleWeightTrendPoint(metric: TrendMetricEntry): boolean {
    return metric.trend_is_materialized !== false && Number.isFinite(metric.trend_weight);
}

/**
 * Describe the endpoint-to-endpoint movement of the trend line currently shown.
 */
export function describeVisibleWeightTrend(
    metrics: TrendMetricEntry[],
    unit: WeightUnit | undefined
): string {
    const points = metrics
        .map<VisibleTrendPoint | null>((metric) => {
            const dateMs = new Date(metric.date).getTime();
            if (
                !isVisibleWeightTrendPoint(metric) ||
                !Number.isFinite(dateMs)
            ) {
                return null;
            }
            return {
                dateMs,
                trendWeight: metric.trend_weight
            };
        })
        .filter((point): point is VisibleTrendPoint => point !== null)
        .sort((a, b) => a.dateMs - b.dateMs);

    if (points.length < 2) {
        return 'Log another weigh-in to show the trend line change.';
    }

    const first = points[0];
    const last = points[points.length - 1];
    const spanDays = Math.max(1, Math.round((last.dateMs - first.dateMs) / MS_PER_DAY));
    const spanLabel = `${spanDays} ${spanDays === 1 ? 'day' : 'days'}`;
    const change = last.trendWeight - first.trendWeight;

    if (Math.abs(change) < MIN_DISPLAY_CHANGE) {
        return `Trend line: steady over ${spanLabel}.`;
    }

    const direction = change > 0 ? 'up' : 'down';
    return `Trend line: ${direction} ${formatWeight(Math.abs(change), unit)} over ${spanLabel}.`;
}
