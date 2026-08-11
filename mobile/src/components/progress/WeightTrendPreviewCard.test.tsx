import { fireEvent, render } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import Svg from 'react-native-svg';
import type { TrendMetricEntry, WeightTrendSummary } from '@calibrate/api-client';
import { spacing } from '../../theme';
import { WeightTrendPreviewCard } from './WeightTrendPreviewCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@tanstack/react-query', () => ({
    ...jest.requireActual('@tanstack/react-query'),
    useQuery: jest.fn()
}));
jest.mock('../../auth/AuthContext', () => ({
    useAuth: () => ({
        api: { getTrendMetrics: jest.fn() },
        user: { weight_unit: 'LB' }
    })
}));

/** Build deterministic metric for regression coverage. */
function metric(id: number, date: string, weight: number, trendWeight: number, materialized = true): TrendMetricEntry {
    return {
        id,
        user_id: 1,
        date,
        weight,
        body_fat_percent: null,
        trend_is_materialized: materialized,
        trend_weight: materialized ? trendWeight : weight,
        trend_ci_lower: materialized ? trendWeight - 0.4 : weight,
        trend_ci_upper: materialized ? trendWeight + 0.4 : weight,
        trend_std: materialized ? 0.2 : 0
    };
}

const METRICS = [
    metric(2, '2026-07-20', 168, 168.2),
    metric(1, '2026-07-19', 169, 168.8)
];

/** Build deterministic trend summary for regression coverage. */
function trendSummary(overrides: Partial<WeightTrendSummary> = {}): WeightTrendSummary {
    return {
        status: 'provisional',
        evidence: 'provisional',
        freshness: 'current',
        model_version: 2,
        as_of_date: '2026-07-20',
        scope_start_date: '2026-06-22',
        scope_end_date: '2026-07-20',
        latest_observation_date: '2026-07-20',
        days_since_latest: 0,
        modeled_points: 2,
        observation_span_days: 1,
        segment_start_date: '2026-07-19',
        latest_trend: { weight: 168.2, lower: 167.8, upper: 168.6 },
        weekly_rate: null,
        short_term_variation: null,
        ...overrides
    };
}

describe('WeightTrendPreviewCard', () => {
    beforeEach(() => {
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: METRICS,
                meta: {
                    weekly_rate: -0.35,
                    volatility: 'low',
                    total_points: 2,
                    total_span_days: 1,
                    trend_summary: trendSummary()
                }
            },
            error: null,
            isLoading: false, status: 'success'
        });
    });

    it('labels the current underlying trend with its as-of date and opens the full trend', () => {
        const onPress = jest.fn();
        const screen = render(<WeightTrendPreviewCard onPress={onPress} onLogWeight={jest.fn()} />);

        expect(screen.getByText('Trend')).toBeTruthy();
        expect(screen.getByTestId('trend-preview-heading-line')).toHaveStyle({
            flexDirection: 'row',
            alignItems: 'baseline',
            flexWrap: 'wrap'
        });
        expect(screen.queryByText('Weight trend')).toBeNull();
        expect(screen.queryByText('Last four weeks at a glance.')).toBeNull();
        expect(screen.queryByText('Smoothed weight')).toBeNull();
        expect(screen.getByText('Current underlying trend: 168.2 lb | As of Jul 20')).toBeTruthy();
        expect(screen.queryByLabelText('Latest smoothed weight 168.2 lb')).toBeNull();
        expect(screen.queryByText('95% estimated trend range')).toBeNull();
        expect(screen.queryByText('167.8 lb - 168.6 lb')).toBeNull();
        expect(screen.getByLabelText('Four-week underlying weight trend with 95% estimated range')).toBeTruthy();
        expect(screen.getByLabelText('169.2 lb weight axis label')).toBeTruthy();
        expect(screen.getByLabelText('167.8 lb weight axis label')).toBeTruthy();
        expect(screen.getByLabelText('Jul 19 date axis label')).toBeTruthy();
        expect(screen.getByLabelText('Jul 20 date axis label')).toBeTruthy();
        expect(screen.queryByText(/Trend line:/)).toBeNull();
        expect(screen.queryByText(/-0\.35|volatility/)).toBeNull();
        expect(screen.queryByText(/^(Week|Month|Year|All)$/)).toBeNull();

        fireEvent.press(screen.getByLabelText('Open full weight trend'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fills its flexed preview immediately', () => {
        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} onLogWeight={jest.fn()} />);
        expect(screen.getByTestId('weight-trend-preview-canvas')).toHaveStyle({
            height: 184,
            marginBottom: spacing.md
        });
        expect(screen.getByLabelText('Four-week underlying weight trend with 95% estimated range'))
            .toHaveProp('height', '100%');
    });

    it('draws the uncertainty band while keeping measurement dots and fallback context out of the preview', () => {
        const metrics = [
            metric(3, '2026-07-20', 168, 168.2),
            metric(2, '2026-07-19', 169, 168.8),
            metric(1, '2026-07-18', 170, 170, false)
        ];
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics,
                meta: { weekly_rate: -0.35, volatility: 'low', total_points: 3, total_span_days: 3 }
            },
            error: null,
            isLoading: false, status: 'success'
        });

        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} onLogWeight={jest.fn()} />);
        expect(screen.queryByTestId('weight-trend-preview-measurement-path')).toBeNull();
        expect(screen.getByTestId('weight-trend-preview-smoothed-path-0').props.d).toMatch(/^M 190\.00 /);
        expect(screen.getByTestId('weight-trend-preview-range-0')).toBeTruthy();
        expect(screen.queryByText(/Trend line:/)).toBeNull();
    });

    it('labels a stale estimate by date without calling it current', () => {
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: METRICS,
                meta: {
                    weekly_rate: -0.35,
                    volatility: 'low',
                    total_points: 2,
                    total_span_days: 1,
                    trend_summary: trendSummary({
                        status: 'stale',
                        freshness: 'stale',
                        latest_observation_date: '2026-07-12',
                        days_since_latest: 8
                    })
                }
            },
            error: null,
            isLoading: false, status: 'success'
        });

        const screen = render(
            <WeightTrendPreviewCard onPress={jest.fn()} onLogWeight={jest.fn()} />
        );

        expect(screen.getByText('Underlying trend: 168.2 lb | As of Jul 12')).toBeTruthy();
        expect(screen.queryByText(/Current underlying trend/)).toBeNull();
        expect(screen.getByLabelText('Four-week underlying weight trend with 95% estimated range')).toBeTruthy();
        expect(screen.queryByLabelText('Log weight')).toBeNull();
    });

    it('suppresses an outdated estimate with no in-range metrics and offers Log weight', () => {
        const onPress = jest.fn();
        const onLogWeight = jest.fn();
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: [],
                meta: {
                    weekly_rate: -0.35,
                    volatility: 'low',
                    total_points: 2,
                    total_span_days: 19,
                    trend_summary: trendSummary({
                        status: 'stale',
                        freshness: 'outdated',
                        latest_observation_date: '2026-07-01',
                        days_since_latest: 19
                    })
                }
            },
            error: null,
            isLoading: false, status: 'success'
        });

        const screen = render(
            <WeightTrendPreviewCard onPress={onPress} onLogWeight={onLogWeight} />
        );

        expect(screen.getByText('Estimate out of date | Last scale weight Jul 1')).toBeTruthy();
        expect(screen.getByText(
            'Log a current scale weight to refresh the underlying trend estimate.'
        )).toBeTruthy();
        expect(screen.queryByText(/168\.2 lb/)).toBeNull();
        expect(screen.queryByLabelText('Four-week underlying weight trend with 95% estimated range')).toBeNull();

        fireEvent.press(screen.getByLabelText('Log weight'));
        expect(onLogWeight).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
    });

    it('does not label an unavailable estimate as current', () => {
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: METRICS,
                meta: {
                    weekly_rate: 0,
                    volatility: 'low',
                    total_points: 2,
                    total_span_days: 1,
                    trend_summary: trendSummary({
                        status: 'unavailable',
                        freshness: 'unavailable',
                        latest_trend: null
                    })
                }
            },
            error: null,
            isLoading: false, status: 'success'
        });

        const screen = render(
            <WeightTrendPreviewCard onPress={jest.fn()} onLogWeight={jest.fn()} />
        );

        expect(screen.getByText('Trend estimate temporarily unavailable')).toBeTruthy();
        expect(screen.getByText(
            'Your scale weights are saved, but the underlying trend estimate is temporarily unavailable.'
        )).toBeTruthy();
        expect(screen.queryByText(/Current underlying trend/)).toBeNull();
        expect(screen.queryByLabelText('Four-week underlying weight trend with 95% estimated range')).toBeNull();
        expect(screen.queryByLabelText('Log weight')).toBeNull();
    });

    it('links an empty current period with existing history to the full trend', () => {
        const onPress = jest.fn();
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: [],
                meta: { weekly_rate: 0, volatility: 'low', total_points: 4, total_span_days: 120 }
            },
            error: null,
            isLoading: false, status: 'success'
        });
        const screen = render(<WeightTrendPreviewCard onPress={onPress} onLogWeight={jest.fn()} />);
        expect(screen.getByText('No weigh-ins in the last four weeks. Open Details to view your history.')).toBeTruthy();
        fireEvent.press(screen.getByLabelText('Open full weight trend'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('draws against the measured canvas without stretching its markers', () => {
        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} onLogWeight={jest.fn()} />);
        fireEvent(
            screen.getByTestId('weight-trend-preview-canvas'),
            'layout',
            { nativeEvent: { layout: { width: 480, height: 320 } } }
        );
        const chart = screen.UNSAFE_getByType(Svg);
        expect(chart.props.viewBox).toBe('0 0 480 320');
        expect(chart.props.preserveAspectRatio).toBeUndefined();
    });
});
