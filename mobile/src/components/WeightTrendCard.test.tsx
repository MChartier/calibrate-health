import { fireEvent, render, within } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import type { TrendMetricEntry, TrendMetricsResponse, WeightTrendSummary } from '@calibrate/api-client';
import { WeightTrendCard } from './WeightTrendCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({
        api: { getTrendMetrics: jest.fn() },
        user: { weight_unit: 'LB' }
    })
}));

const METRICS: TrendMetricEntry[] = [
    createMetric(3, '2026-07-15', 168.3),
    createMetric(2, '2026-07-14', 168.7),
    createMetric(1, '2026-07-13', 169.8)
];

function createMetric(id: number, date: string, weight: number): TrendMetricEntry {
    return {
        id,
        user_id: 1,
        date,
        weight,
        body_fat_percent: null,
        trend_is_materialized: true,
        trend_weight: 168.2,
        trend_ci_lower: 167.1,
        trend_ci_upper: 169.3,
        trend_std: 0.4
    };
}

function createTrendSummary(): WeightTrendSummary {
    return {
        status: 'sufficient',
        evidence: 'sufficient',
        freshness: 'current',
        model_version: 2,
        as_of_date: '2026-07-15',
        scope_start_date: '2026-06-17',
        scope_end_date: '2026-07-15',
        latest_observation_date: '2026-07-15',
        days_since_latest: 0,
        modeled_points: 3,
        observation_span_days: 2,
        segment_start_date: '2026-07-13',
        interval_kind: 'latent_weight_model_uncertainty',
        confidence_level: 0.95,
        latest_trend: { weight: 168.2, lower: 167.1, upper: 169.3 },
        weekly_rate: {
            estimate: -0.3,
            lower: -0.6,
            upper: 0,
            point_count: 3,
            span_days: 2,
            evidence: 'provisional'
        },
        short_term_variation: {
            standard_deviation: 0.5,
            central_80_half_width: 0.6
        }
    };
}

function response(metrics = METRICS, summary: WeightTrendSummary | null = createTrendSummary()): TrendMetricsResponse {
    return {
        metrics,
        meta: {
            weekly_rate: 0.19,
            volatility: 'low',
            total_points: metrics.length,
            total_span_days: 2,
            ...(summary ? { trend_summary: summary } : {})
        }
    };
}

describe('WeightTrendCard', () => {
    beforeEach(() => {
        (useQuery as jest.Mock).mockReturnValue({ data: response(), error: null, isLoading: false });
    });

    it('defaults the consolidated summary to the latest point and selects from web offset coordinates', () => {
        const screen = render(<WeightTrendCard />);
        const chart = screen.getByLabelText('Select nearest weigh-in');

        const initialSummary = within(screen.getByTestId('selected-trend-summary'));
        expect(initialSummary.getByText('Jul 15, 2026')).toBeTruthy();
        expect(initialSummary.getByText('Underlying weight estimate')).toBeTruthy();
        expect(initialSummary.getByText('Scale reading')).toBeTruthy();
        expect(initialSummary.getByText('168.3 lb')).toBeTruthy();
        expect(initialSummary.queryByLabelText('Previous weigh-in')).toBeNull();
        expect(screen.getByLabelText('Selected weigh-in navigation')).toBeTruthy();
        expect(screen.getByLabelText('Chart legend')).toBeTruthy();
        expect(screen.getAllByText('Scale reading')).toHaveLength(2);
        expect(screen.getByText('Underlying trend')).toBeTruthy();
        expect(screen.getByText('95% estimate range')).toBeTruthy();
        fireEvent.press(chart, { nativeEvent: { offsetX: 170 } });
        expect(screen.getByText('Jul 14, 2026')).toBeTruthy();
        fireEvent.press(chart, { nativeEvent: { offsetX: 18 } });
        expect(screen.getByText('Jul 13, 2026')).toBeTruthy();
    });

    it('provides accessible previous and next point navigation', () => {
        const screen = render(<WeightTrendCard />);
        const previous = screen.getByLabelText('Previous weigh-in');
        const next = screen.getByLabelText('Next weigh-in');

        expect(next).toHaveProp('accessibilityState', { disabled: true });
        fireEvent.press(previous);
        expect(screen.getByText('Jul 14, 2026')).toBeTruthy();
        expect(screen.getByLabelText('Next weigh-in')).toHaveProp('accessibilityState', { disabled: false });
        fireEvent.press(screen.getByLabelText('Previous weigh-in'));
        expect(screen.getByText('Jul 13, 2026')).toBeTruthy();
        expect(screen.getByLabelText('Previous weigh-in')).toHaveProp('accessibilityState', { disabled: true });
    });

    it('keeps the current selection when a press has no usable coordinate', () => {
        const screen = render(<WeightTrendCard />);
        fireEvent.press(screen.getByLabelText('Select nearest weigh-in'), { nativeEvent: {} });
        expect(within(screen.getByTestId('selected-trend-summary')).getByText('Jul 15, 2026')).toBeTruthy();
    });

    it('renders the first-weigh-in state for a single metric', () => {
        (useQuery as jest.Mock).mockReturnValue({
            data: response([METRICS[0]], null),
            error: null,
            isLoading: false
        });
        const screen = render(<WeightTrendCard />);
        expect(screen.getByText('First weigh-in recorded')).toBeTruthy();
        expect(screen.getByText('168.3 lb on Jul 15, 2026')).toBeTruthy();
    });

    it('draws raw measurements as dots and segments only the modeled trend', () => {
        const metrics = [
            { ...createMetric(4, '2026-07-25', 168.3), trend_weight: 168.2 },
            { ...createMetric(3, '2026-07-24', 168.7), trend_weight: 168.8 },
            { ...createMetric(2, '2026-07-01', 169.2), trend_weight: 169.1 },
            { ...createMetric(1, '2026-06-30', 169.8), trend_weight: 169.4 }
        ];
        (useQuery as jest.Mock).mockReturnValue({ data: response(metrics, null), error: null, isLoading: false });

        const screen = render(<WeightTrendCard />);
        expect(screen.queryByTestId('weight-trend-measurement-path')).toBeNull();
        expect(screen.getByTestId('weight-trend-smoothed-path-0')).toBeTruthy();
        expect(screen.getByTestId('weight-trend-smoothed-path-1')).toBeTruthy();
        expect(screen.getByTestId('weight-trend-range-0')).toBeTruthy();
        expect(screen.getByTestId('weight-trend-range-1')).toBeTruthy();
    });

    it('shows old context as measurement-only and marks the model boundary for Year and All', () => {
        const metrics = [
            createMetric(3, '2026-07-15', 168.3),
            createMetric(2, '2026-07-14', 168.7),
            {
                ...createMetric(1, '2026-01-01', 176),
                trend_is_materialized: false,
                trend_weight: 176,
                trend_ci_lower: 176,
                trend_ci_upper: 176,
                trend_std: 0
            }
        ];
        (useQuery as jest.Mock).mockReturnValue({ data: response(metrics, null), error: null, isLoading: false });
        const screen = render(<WeightTrendCard />);

        fireEvent.press(screen.getByText('All'));
        expect(screen.getByTestId('weight-trend-model-boundary')).toBeTruthy();
        expect(screen.getByText(/Earlier dots are measurements only/)).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Previous weigh-in'));
        fireEvent.press(screen.getByLabelText('Previous weigh-in'));
        const details = within(screen.getByTestId('selected-trend-summary'));
        expect(details.getByText('Scale reading')).toBeTruthy();
        expect(details.getByText(/no underlying trend estimate/)).toBeTruthy();
        expect(details.queryByText('Underlying weight estimate')).toBeNull();
        expect(details.queryByText(/95% trend range/)).toBeNull();
    });

    it('focuses on the underlying estimate and keeps concise context below the chart', () => {
        const screen = render(<WeightTrendCard />);
        expect(screen.getAllByText('168.2 lb').length).toBeGreaterThan(0);
        expect(screen.queryByText('Smoothed weight')).toBeNull();
        const summary = within(screen.getByTestId('selected-trend-summary'));
        expect(summary.getByText('Underlying weight estimate')).toBeTruthy();
        expect(summary.getByText('Scale reading')).toBeTruthy();
        expect(summary.getByText('168.3 lb')).toBeTruthy();
        expect(summary.getByText(/95% trend range/)).toBeTruthy();
        expect(screen.queryByText(/uncertainty in the estimate/)).toBeNull();
        fireEvent(screen.getByLabelText('About the 95% trend range'), 'hoverIn');
        expect(screen.getByText(/uncertainty in the estimate/)).toBeTruthy();
        expect(screen.getByTestId('trend-range-tooltip')).toHaveStyle({ position: 'absolute' });
        fireEvent(screen.getByLabelText('About the 95% trend range'), 'hoverOut');
        expect(screen.queryByText(/uncertainty in the estimate/)).toBeNull();
        expect(screen.queryByText('Scale reading variation')).toBeNull();
        expect(screen.queryByText('About 80% within +/- 0.6 lb')).toBeNull();
        expect(screen.queryByText('Hydration, meals, timing, and scale noise can shift individual readings.')).toBeNull();
        expect(screen.queryByText('Current pace estimate')).toBeNull();
        expect(screen.queryByText('Down 0.3 lb/week')).toBeNull();
        expect(screen.queryByText(/0\.19|low volatility/)).toBeNull();
    });

    it('preserves a useful snapshot for legacy payloads', () => {
        (useQuery as jest.Mock).mockReturnValue({ data: response(METRICS, null), error: null, isLoading: false });
        const screen = render(<WeightTrendCard />);
        expect(screen.getAllByText('168.2 lb').length).toBeGreaterThan(0);
        expect(screen.queryByText('Scale reading variation')).toBeNull();
        expect(screen.queryByText('Current pace estimate')).toBeNull();
        expect(screen.getByText('Trend line: steady over 2 days.')).toBeTruthy();
    });

    it('shows estimate freshness without adding pace information', () => {
        const summary = createTrendSummary();
        summary.freshness = 'outdated';
        summary.days_since_latest = 18;
        (useQuery as jest.Mock).mockReturnValue({ data: response(METRICS, summary), error: null, isLoading: false });

        const screen = render(<WeightTrendCard />);
        expect(screen.getByText('Current weigh-in needed')).toBeTruthy();
        expect(screen.queryByText('Current pace estimate')).toBeNull();
    });

    it('distinguishes an empty selected range from a user with no weight history', () => {
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: [],
                meta: { weekly_rate: 0, volatility: 'low', total_points: 4, total_span_days: 120 }
            },
            error: null,
            isLoading: false
        });
        const screen = render(<WeightTrendCard />);
        expect(screen.getByText('No weigh-ins in this range. Choose All to view your weight history.')).toBeTruthy();
        fireEvent.press(screen.getByText('All'));
        expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
            queryKey: ['mobile-metrics-trend', 'all']
        }));
    });

    it('labels the chart scale and time-proportional date axis', () => {
        const screen = render(<WeightTrendCard />);
        expect(screen.getByLabelText('170 lb weight axis label')).toBeTruthy();
        expect(screen.getByLabelText('167 lb weight axis label')).toBeTruthy();
        expect(screen.getByLabelText('Jul 13 date axis label')).toBeTruthy();
        expect(screen.getByLabelText('Jul 14 date axis label')).toBeTruthy();
        expect(screen.getByLabelText('Jul 15 date axis label')).toBeTruthy();
        expect(screen.getByLabelText('Chart legend')).toBeTruthy();
        expect(screen.queryByText('Current pace estimate')).toBeNull();
    });

    it('uses the full available chart height on larger responsive layouts', () => {
        const screen = render(<WeightTrendCard />);
        const canvas = screen.getByTestId('weight-trend-chart-canvas');
        fireEvent(canvas, 'layout', { nativeEvent: { layout: { width: 340, height: 343 } } });
        expect(screen.getByTestId('weight-trend-chart')).toHaveProp('height', 343);
        fireEvent(canvas, 'layout', { nativeEvent: { layout: { width: 340, height: 600 } } });
        expect(screen.getByTestId('weight-trend-chart')).toHaveProp('height', 600);
    });
});
