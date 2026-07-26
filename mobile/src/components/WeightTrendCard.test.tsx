import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import type { TrendMetricEntry } from '@calibrate/api-client';
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

describe('WeightTrendCard', () => {
    beforeEach(() => {
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: METRICS,
                meta: {
                    weekly_rate: 0.19,
                    volatility: 'low',
                    total_points: METRICS.length,
                    total_span_days: 2
                }
            },
            error: null,
            isLoading: false
        });
    });

    it('selects individual points from React Native Web offset coordinates', () => {
        const { getByLabelText, getByText, queryByText } = render(<WeightTrendCard />);
        const chart = getByLabelText('Show nearest weigh-in details');

        expect(queryByText(/Latest 168\.3/)).toBeNull();
        expect(getByText('Jul 15, 2026')).toBeTruthy();

        fireEvent.press(chart, { nativeEvent: { offsetX: 170 } });
        expect(getByText('Jul 14, 2026')).toBeTruthy();

        fireEvent.press(chart, { nativeEvent: { offsetX: 18 } });
        expect(getByText('Jul 13, 2026')).toBeTruthy();
    });

    it('keeps the current selection when a press has no usable coordinate', () => {
        const { getByLabelText, getByText } = render(<WeightTrendCard />);

        fireEvent.press(getByLabelText('Show nearest weigh-in details'), { nativeEvent: {} });

        expect(getByText('Jul 15, 2026')).toBeTruthy();
    });

    it('labels ranges by their comparison period', () => {
        const { getByText, queryByText } = render(<WeightTrendCard />);

        expect(getByText('Week')).toBeTruthy();
        expect(getByText('Month')).toBeTruthy();
        expect(getByText('Year')).toBeTruthy();
        expect(getByText('All')).toBeTruthy();
        expect(queryByText(/^(7d|30d|1y)$/)).toBeNull();
    });

    it('renders the first-weigh-in state for a single metric', () => {
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: [METRICS[0]],
                meta: {
                    weekly_rate: 0,
                    volatility: 'low',
                    total_points: 1,
                    total_span_days: 0
                }
            },
            error: null,
            isLoading: false
        });

        const { getByText } = render(<WeightTrendCard />);

        expect(getByText('First weigh-in recorded')).toBeTruthy();
        expect(getByText('168.3 lb on Jul 15, 2026')).toBeTruthy();
    });

    it('keeps older fallback measurements out of the smoothed trend path', () => {
        const metrics = [
            { ...createMetric(3, '2026-07-15', 168.3), trend_weight: 168.2 },
            { ...createMetric(2, '2026-07-14', 168.7), trend_weight: 168.8 },
            {
                ...createMetric(1, '2026-07-13', 169.8),
                trend_is_materialized: false,
                trend_weight: 169.8,
                trend_ci_lower: 169.8,
                trend_ci_upper: 169.8
            }
        ];
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics,
                meta: {
                    weekly_rate: -0.35,
                    volatility: 'low',
                    total_points: metrics.length,
                    total_span_days: 3
                }
            },
            error: null,
            isLoading: false
        });

        const screen = render(<WeightTrendCard />);

        expect(screen.getByTestId('weight-trend-measurement-path').props.d).toMatch(/^M 58\.00 /);
        expect(screen.getByTestId('weight-trend-smoothed-path').props.d).toMatch(/^M 193\.00 /);
        expect(screen.getByText('Trend line: down 0.6 lb over 1 day.')).toBeTruthy();
    });

    it('distinguishes an empty selected range from a user with no weight history', () => {
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: [],
                meta: {
                    weekly_rate: 0,
                    volatility: 'low',
                    total_points: 4,
                    total_span_days: 120
                }
            },
            error: null,
            isLoading: false
        });

        const screen = render(<WeightTrendCard />);

        expect(screen.getByText('No weigh-ins in this range. Choose All to view your weight history.')).toBeTruthy();
        expect(screen.queryByText('Log a weigh-in to start a trend.')).toBeNull();

        fireEvent.press(screen.getByText('All'));
        expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
            queryKey: ['mobile-metrics-trend', 'all']
        }));
    });

    it('labels the chart scale, dates, and selected-point series without a duplicate legend', () => {
        const { getAllByText, getByLabelText, getByText, queryByLabelText, queryByText } = render(<WeightTrendCard />);

        expect(getByLabelText('170 lb weight axis label')).toBeTruthy();
        expect(getByLabelText('167 lb weight axis label')).toBeTruthy();
        expect(getByLabelText('Jul 13 date axis label')).toBeTruthy();
        expect(getByLabelText('Jul 14 date axis label')).toBeTruthy();
        expect(getByLabelText('Jul 15 date axis label')).toBeTruthy();
        expect(queryByLabelText('Chart legend')).toBeNull();
        expect(getAllByText('Measurement')).toHaveLength(1);
        expect(getAllByText('Trend')).toHaveLength(1);
        expect(getAllByText('Expected range')).toHaveLength(1);
        expect(getByText('Trend line: steady over 2 days.')).toBeTruthy();
        expect(queryByText(/0\.19|volatility/)).toBeNull();
    });

    it('uses available chart height without growing beyond the visual cap', () => {
        const screen = render(<WeightTrendCard />);
        const canvas = screen.getByTestId('weight-trend-chart-canvas');

        fireEvent(canvas, 'layout', { nativeEvent: { layout: { width: 340, height: 343 } } });
        expect(screen.getByTestId('weight-trend-chart')).toHaveProp('height', 343);

        fireEvent(canvas, 'layout', { nativeEvent: { layout: { width: 340, height: 600 } } });
        expect(screen.getByTestId('weight-trend-chart')).toHaveProp('height', 420);
    });
});
