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

    it('labels the chart scale, dates, and visual series', () => {
        const { getAllByText, getByLabelText } = render(<WeightTrendCard />);

        expect(getByLabelText('170 lb weight axis label')).toBeTruthy();
        expect(getByLabelText('167 lb weight axis label')).toBeTruthy();
        expect(getByLabelText('Jul 13 date axis label')).toBeTruthy();
        expect(getByLabelText('Jul 14 date axis label')).toBeTruthy();
        expect(getByLabelText('Jul 15 date axis label')).toBeTruthy();
        expect(getAllByText('Measurement')).toHaveLength(2);
        expect(getAllByText('Trend')).toHaveLength(2);
        expect(getAllByText('Expected range')).toHaveLength(2);
    });
});
