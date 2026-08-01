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
                        trend_is_materialized: true,
                        trend_weight: 168.2
                    },
                    {
                        id: 1,
                        date: '2026-07-19',
                        weight: 169,
                        trend_is_materialized: true,
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

    it('shows a compact four-week summary and opens the full trend', () => {
        const onPress = jest.fn();
        const screen = render(<WeightTrendPreviewCard onPress={onPress} />);

        expect(screen.getByText('Last four weeks at a glance.')).toBeTruthy();
        expect(screen.getByLabelText('Four-week weight trend preview')).toBeTruthy();
        expect(screen.getByLabelText('169 lb weight axis label')).toBeTruthy();
        expect(screen.getByLabelText('168 lb weight axis label')).toBeTruthy();
        expect(screen.getByLabelText('Jul 19 date axis label')).toBeTruthy();
        expect(screen.getByLabelText('Jul 20 date axis label')).toBeTruthy();
        expect(screen.getByText('Trend line: down 0.6 lb over 1 day.')).toBeTruthy();
        expect(screen.queryByText(/-0\.35|volatility/)).toBeNull();
        expect(screen.queryByText(/^(Week|Month|Year|All)$/)).toBeNull();

        fireEvent.press(screen.getByLabelText('Open full weight trend'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fills its flexed preview immediately', () => {
        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} />);

        expect(screen.getByLabelText('Four-week weight trend preview')).toHaveProp('height', '100%');
    });

    it('keeps older fallback measurements out of the smoothed preview path', () => {
        const metrics = [
            {
                id: 3,
                date: '2026-07-20',
                weight: 168,
                trend_is_materialized: true,
                trend_weight: 168.2
            },
            {
                id: 2,
                date: '2026-07-19',
                weight: 169,
                trend_is_materialized: true,
                trend_weight: 168.8
            },
            {
                id: 1,
                date: '2026-07-18',
                weight: 170,
                trend_is_materialized: false,
                trend_weight: 170
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

        const screen = render(<WeightTrendPreviewCard onPress={jest.fn()} />);

        expect(screen.getByTestId('weight-trend-preview-measurement-path').props.d).toMatch(/^M 48\.00 /);
        expect(screen.getByTestId('weight-trend-preview-smoothed-path').props.d).toMatch(/^M 190\.00 /);
        expect(screen.getByText('Trend line: down 0.6 lb over 1 day.')).toBeTruthy();
    });

    it('links an empty current period with existing history to the full trend', () => {
        const onPress = jest.fn();
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

        const screen = render(<WeightTrendPreviewCard onPress={onPress} />);

        expect(screen.getByText('No weigh-ins in the last four weeks. Open Details to view your history.')).toBeTruthy();
        expect(screen.queryByText('Log a weigh-in to start a trend.')).toBeNull();

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
