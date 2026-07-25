import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import Svg from 'react-native-svg';
import { WeightTrendPreviewCard } from './WeightTrendPreviewCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../auth/AuthContext', () => ({
    useAuth: () => ({
        api: { getTrendMetrics: jest.fn() },
        user: { weight_unit: 'LB' }
    })
}));

describe('WeightTrendPreviewCard', () => {
    beforeEach(() => {
        (useQuery as jest.Mock).mockReturnValue({
            data: {
                metrics: [
                    {
                        id: 2,
                        date: '2026-07-20',
                        weight: 168,
                        trend_weight: 168.2
                    },
                    {
                        id: 1,
                        date: '2026-07-19',
                        weight: 169,
                        trend_weight: 168.8
                    }
                ],
                meta: {
                    weekly_rate: -0.35,
                    volatility: 'low',
                    total_points: 2,
                    total_span_days: 1
                }
            },
            error: null,
            isLoading: false
        });
    });

    it('shows a compact 30-day summary and opens the full trend', () => {
        const onPress = jest.fn();
        const screen = render(<WeightTrendPreviewCard onPress={onPress} />);

        expect(screen.getByText('Last 30 days at a glance.')).toBeTruthy();
        expect(screen.getByLabelText('30-day weight trend preview')).toBeTruthy();
        expect(screen.getByText('Trend -0.35 lb / week | low volatility')).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Open full weight trend'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fills its flexed preview immediately', () => {
        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} />);

        expect(screen.getByLabelText('30-day weight trend preview')).toHaveProp('height', '100%');
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
