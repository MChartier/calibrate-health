import type { TrendMetricEntry } from '@calibrate/api-client';
import { describeVisibleWeightTrend } from './presentation';

function createMetric(
    id: number,
    date: string,
    trendWeight: number,
    trendIsMaterialized = true
): TrendMetricEntry {
    return {
        id,
        user_id: 1,
        date,
        weight: trendWeight,
        body_fat_percent: null,
        trend_is_materialized: trendIsMaterialized,
        trend_weight: trendWeight,
        trend_ci_lower: trendWeight - 0.5,
        trend_ci_upper: trendWeight + 0.5,
        trend_std: 0.2
    };
}

describe('describeVisibleWeightTrend', () => {
    it('describes the visible trend endpoints instead of an unrelated weekly rate', () => {
        const metrics = [
            createMetric(3, '2026-07-20', 168.2),
            createMetric(2, '2026-07-12', 168.8),
            createMetric(1, '2026-07-01', 169.4)
        ];

        expect(describeVisibleWeightTrend(metrics, 'LB'))
            .toBe('Trend line: down 1.2 lb over 19 days.');
    });

    it('uses plain-language upward and steady summaries', () => {
        expect(describeVisibleWeightTrend([
            createMetric(2, '2026-07-08', 80.4),
            createMetric(1, '2026-07-01', 80)
        ], 'KG')).toBe('Trend line: up 0.4 kg over 7 days.');

        expect(describeVisibleWeightTrend([
            createMetric(2, '2026-07-08', 80.03),
            createMetric(1, '2026-07-01', 80)
        ], 'KG')).toBe('Trend line: steady over 7 days.');
    });

    it('ignores Year and All fallback points older than the materialized horizon', () => {
        const metrics = [
            createMetric(3, '2026-07-20', 168.5),
            createMetric(2, '2026-03-23', 170),
            createMetric(1, '2025-07-20', 210, false)
        ];

        expect(describeVisibleWeightTrend(metrics, 'LB'))
            .toBe('Trend line: down 1.5 lb over 119 days.');
    });

    it('accepts missing materialization metadata from legacy API v1 servers', () => {
        const metrics = [
            createMetric(2, '2026-07-20', 168.2),
            createMetric(1, '2026-07-01', 169.4)
        ];
        delete metrics[0].trend_is_materialized;
        delete metrics[1].trend_is_materialized;

        expect(describeVisibleWeightTrend(metrics, 'LB'))
            .toBe('Trend line: down 1.2 lb over 19 days.');
    });

    it('requires two genuinely materialized endpoints', () => {
        const metrics = [
            createMetric(3, '2026-07-20', 168.5),
            createMetric(2, '2025-07-20', 210, false)
        ];

        expect(describeVisibleWeightTrend(metrics, 'LB'))
            .toBe('Log another weigh-in to show the trend line change.');
    });
});
