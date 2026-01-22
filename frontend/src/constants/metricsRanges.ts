/**
 * Range options supported by the metrics API and weight history UI.
 *
 * Keep these values aligned with the backend range parser.
 */
export const METRICS_RANGE_OPTIONS = {
    WEEK: 'week',
    MONTH: 'month',
    YEAR: 'year',
    ALL: 'all'
} as const;

export type MetricsRange = (typeof METRICS_RANGE_OPTIONS)[keyof typeof METRICS_RANGE_OPTIONS];
