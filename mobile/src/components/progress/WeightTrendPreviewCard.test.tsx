import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
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

    it('uses flexed chart height and sample metadata after the card receives free space', () => {
        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} />);

        fireEvent(
            screen.getByLabelText('Open full weight trend'),
            'layout',
            { nativeEvent: { layout: { width: 340, height: 360 } } }
        );
        fireEvent(
            screen.getByTestId('weight-trend-preview-canvas'),
            'layout',
            { nativeEvent: { layout: { width: 340, height: 176 } } }
        );

        expect(screen.getByLabelText('30-day weight trend preview')).toHaveProp('height', 176);
        expect(screen.getByText('2 total weigh-ins')).toBeTruthy();
        expect(screen.getByText('1-day history')).toBeTruthy();

        fireEvent(
            screen.getByTestId('weight-trend-preview-canvas'),
            'layout',
            { nativeEvent: { layout: { width: 340, height: 500 } } }
        );
        expect(screen.getByLabelText('30-day weight trend preview')).toHaveProp('height', 260);
    });
});
