import { fireEvent, render } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import Svg from 'react-native-svg';
import type { TrendMetricEntry } from '@calibrate/api-client';
import { WeightTrendPreviewCard } from './WeightTrendPreviewCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../auth/AuthContext', () => ({
    useAuth: () => ({
        api: { getTrendMetrics: jest.fn() },
        user: { weight_unit: 'LB' }
    })
}));

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
                    trend_summary: {
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
                        short_term_variation: null
                    }
                }
            },
            error: null,
            isLoading: false
        });
    });

    it('labels the current trend in the compact header and opens the full trend', () => {
        const onPress = jest.fn();
        const screen = render(<WeightTrendPreviewCard onPress={onPress} />);

        expect(screen.getByText('Trend')).toBeTruthy();
        expect(screen.getByTestId('trend-preview-heading-line')).toHaveStyle({
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap'
        });
        expect(screen.queryByText('Weight trend')).toBeNull();
        expect(screen.queryByText('Last four weeks at a glance.')).toBeNull();
        expect(screen.queryByText('Smoothed weight')).toBeNull();
        expect(screen.getByText('Current trend: 168.2 lb')).toBeTruthy();
        expect(screen.queryByLabelText('Latest smoothed weight 168.2 lb')).toBeNull();
        expect(screen.queryByText('95% estimated trend range')).toBeNull();
        expect(screen.queryByText('167.8 lb - 168.6 lb')).toBeNull();
        expect(screen.getByLabelText('Four-week smoothed weight trend with 95% estimated range')).toBeTruthy();
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
        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} />);
        expect(screen.getByLabelText('Four-week smoothed weight trend with 95% estimated range')).toHaveProp('height', '100%');
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
            isLoading: false
        });

        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} />);
        expect(screen.queryByTestId('weight-trend-preview-measurement-path')).toBeNull();
        expect(screen.getByTestId('weight-trend-preview-smoothed-path-0').props.d).toMatch(/^M 190\.00 /);
        expect(screen.getByTestId('weight-trend-preview-range-0')).toBeTruthy();
        expect(screen.queryByText(/Trend line:/)).toBeNull();
    });

    it('links an empty current period with existing history to the full trend', () => {
        const onPress = jest.fn();
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: [],
                meta: { weekly_rate: 0, volatility: 'low', total_points: 4, total_span_days: 120 }
            },
            error: null,
            isLoading: false
        });
        const screen = render(<WeightTrendPreviewCard onPress={onPress} />);
        expect(screen.getByText('No weigh-ins in the last four weeks. Open Details to view your history.')).toBeTruthy();
        fireEvent.press(screen.getByLabelText('Open full weight trend'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('draws against the measured canvas without stretching its markers', () => {
        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} />);
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
