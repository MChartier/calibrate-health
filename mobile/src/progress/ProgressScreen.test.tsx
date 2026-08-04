import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { GoalEntry } from '@calibrate/api-client';
import ProgressScreen from '../../app/(tabs)/progress';

const GOAL: GoalEntry = {
    id: 1,
    start_weight: 175,
    target_weight: 170,
    target_date: null,
    daily_deficit: 500,
    created_at: '2026-07-01T00:00:00.000Z'
};

const mockApi = {
    getGoals: jest.fn(async () => GOAL),
    getUserProfile: jest.fn(async () => ({ latest_weight_grams: 76657 })),
    getMetrics: jest.fn(async () => [
        { id: 2, date: '2026-07-24', weight: 169 },
        { id: 1, date: '2026-07-20', weight: 171 }
    ]),
    getTrendMetrics: jest.fn(async () => ({ metrics: [], meta: { total_points: 2 } })),
    createGoal: jest.fn(async () => GOAL)
};

let mockSearchParams: { openNextGoal?: string } = {};
jest.mock('expo-router', () => ({
    router: { push: jest.fn() },
    useLocalSearchParams: () => mockSearchParams
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({
        api: mockApi,
        user: { weight_unit: 'LB', timezone: 'UTC' }
    })
}));
jest.mock('../components/progress/WeightTrendPreviewCard', () => ({
    WeightTrendPreviewCard: () => null
}));
jest.mock('../components/CalibrationInsightCard', () => ({
    CalibrationInsightCard: () => null
}));
jest.mock('../components/BottomSheetModal', () => {
    const ReactModule = require('react') as typeof React;
    const { View } = require('react-native') as typeof import('react-native');
    return {
        BottomSheetModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
            visible ? ReactModule.createElement(View, { accessibilityLabel: 'Goal editor' }, children) : null
    };
});

describe('Progress goal completion flow', () => {
    beforeEach(() => {
        mockSearchParams = {};
    });

    it('opens Set next goal as an unsaved maintenance draft at the latest weight', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
        });
        const screen = render(
            <SafeAreaProvider
                initialMetrics={{
                    frame: { x: 0, y: 0, width: 390, height: 844 },
                    insets: { top: 0, left: 0, right: 0, bottom: 0 }
                }}
            >
                <QueryClientProvider client={queryClient}>
                    <ProgressScreen />
                </QueryClientProvider>
            </SafeAreaProvider>
        );

        fireEvent.press(await screen.findByLabelText('Set next goal'));

        expect(screen.getByText('Set a new goal')).toBeTruthy();
        expect(screen.getAllByText('169 lb')).toHaveLength(2);
        expect(screen.getByLabelText('Target')).toHaveProp('value', '169');
        await waitFor(() => {
            expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityState.checked))
                .toEqual([false, true, false]);
        });
        expect(mockApi.createGoal).not.toHaveBeenCalled();
        expect(screen.queryByLabelText('Log weight')).toBeNull();
        screen.unmount();
        queryClient.clear();
    });

    it('accepts the one-shot next-goal handoff from a goal-reached weigh-in', async () => {
        mockSearchParams = { openNextGoal: 'true' };
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
        });
        const screen = render(
            <SafeAreaProvider
                initialMetrics={{
                    frame: { x: 0, y: 0, width: 390, height: 844 },
                    insets: { top: 0, left: 0, right: 0, bottom: 0 }
                }}
            >
                <QueryClientProvider client={queryClient}>
                    <ProgressScreen />
                </QueryClientProvider>
            </SafeAreaProvider>
        );

        expect(await screen.findByText('Set a new goal')).toBeTruthy();
        expect(screen.getByLabelText('Target')).toHaveProp('value', '169');
        expect(mockApi.createGoal).not.toHaveBeenCalled();
        screen.unmount();
        queryClient.clear();
    });
});
