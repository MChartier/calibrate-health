import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CalibrationStatusResponse } from '@calibrate/api-client';
import { CalibrationInsightCard } from './CalibrationInsightCard';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'calibration-operation-id') }));
jest.mock('expo-haptics', () => ({
    NotificationFeedbackType: { Success: 'success' },
    notificationAsync: jest.fn(async () => undefined)
}));

const mockApi = {
    getCalibrationStatus: jest.fn(),
    applyCalibrationRecommendation: jest.fn()
};

jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({ api: mockApi })
}));

jest.mock('./BottomSheetModal', () => {
    const ReactModule = require('react');
    const { Pressable, Text, View } = require('react-native');
    return {
        BottomSheetModal: ({ visible, children, onRequestClose }: {
            visible: boolean;
            children: React.ReactNode;
            onRequestClose: () => void;
        }) => visible
            ? ReactModule.createElement(
                View,
                null,
                children,
                ReactModule.createElement(
                    Pressable,
                    { accessibilityRole: 'button', onPress: onRequestClose },
                    ReactModule.createElement(Text, null, 'Dismiss review')
                )
            )
            : null
    };
});

function recommendationStatus(weightUnit: 'KG' | 'LB' = 'KG'): CalibrationStatusResponse {
    return {
        generatedAt: '2026-07-31T20:00:00.000Z',
        inputFingerprint: 'current-input',
        evaluation: {
            modelVersion: 2,
            asOfDate: '2026-07-31',
            weightUnit,
            status: 'recommendation',
            headline: 'Weight loss is trending slower than projected',
            summary: 'Current evidence supports a lower calorie budget.',
            nextStep: null,
            historyProgress: null,
            selectedWindowDays: 28,
            dataQuality: {
                observationDays: 28,
                completeDays: 28,
                confidentDays: 28,
                suspiciousDays: 0,
                incompleteDays: 0,
                missingDays: 0,
                weightPoints: 14,
                weightSpanDays: 28
            },
            missingCriteria: [],
            assumptions: [],
            estimates: {
                averageIntakeKcal: { low: 1825, midpoint: 1900, high: 1975 },
                observedWeeklyWeightChangeKg: { low: -0.5, midpoint: -0.455, high: -0.4 },
                targetAdjustmentKcal: { low: -250, midpoint: -200, high: -150 },
                configuredWeeklyWeightChangeKg: -0.455
            },
            recommendation: {
                currentTargetKcal: 1900,
                recommendedTargetKcal: 1750,
                adjustmentStepKcal: -150,
                currentTargetAdjustmentKcal: 0,
                recommendedTargetAdjustmentKcal: -150
            },
            activityContext: null
        },
        recommendation: {
            id: 7,
            status: 'pending',
            inputFingerprint: 'current-input',
            effectiveLocalDate: '2026-08-01'
        },
        scheduledChange: null
    };
}

function scheduledStatus(): CalibrationStatusResponse {
    return {
        ...recommendationStatus(),
        recommendation: null,
        scheduledChange: {
            recommendationId: 7,
            targetAdjustmentKcal: 0,
            dailyCalorieBudgetKcal: 1900,
            effectiveLocalDate: '2026-08-01'
        }
    };
}

function buildingHistoryStatus(): CalibrationStatusResponse {
    const status = recommendationStatus();
    return {
        ...status,
        evaluation: {
            ...status.evaluation,
            status: 'not_ready',
            headline: 'See how your calorie plan is working',
            summary: 'Calibrate compares your logged food with your weight trend to show whether your plan is on track or a small calorie-budget adjustment could improve your pace.',
            nextStep: 'Keep following your current plan and log food and weight consistently so Calibrate can make its first pace check.',
            historyProgress: {
                observedDays: 6,
                requiredDays: 7
            },
            selectedWindowDays: null,
            dataQuality: {
                observationDays: 6,
                completeDays: 6,
                confidentDays: 6,
                suspiciousDays: 0,
                incompleteDays: 0,
                missingDays: 0,
                weightPoints: 6,
                weightSpanDays: 6
            },
            missingCriteria: ['Build at least 7 days of food and weight history.'],
            estimates: {
                averageIntakeKcal: null,
                observedWeeklyWeightChangeKg: null,
                targetAdjustmentKcal: null,
                configuredWeeklyWeightChangeKg: -0.455
            },
            recommendation: null
        },
        recommendation: null,
        scheduledChange: null
    };
}

function renderCard() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 }
        }
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <CalibrationInsightCard />
        </QueryClientProvider>
    );
}

describe('CalibrationInsightCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockApi.getCalibrationStatus.mockResolvedValue(recommendationStatus());
        mockApi.applyCalibrationRecommendation.mockResolvedValue({
            recommendationId: 7,
            targetAdjustmentKcal: -150,
            dailyCalorieBudgetKcal: 1750,
            effectiveLocalDate: '2026-08-01'
        });
    });

    it('explains the value of calibration and presents one next step before the first insight', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(buildingHistoryStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('See how your calorie plan is working')).toBeTruthy());
        expect(screen.getByText(/whether your plan is on track or a small calorie-budget adjustment/)).toBeTruthy();
        expect(screen.getByText('Progress toward your first pace check')).toBeTruthy();
        expect(screen.getByText('6 of 7 days')).toBeTruthy();
        expect(screen.getByRole('progressbar', { name: 'History for your first pace check' }).props.accessibilityValue).toEqual({
            min: 0,
            max: 7,
            now: 6,
            text: '6 of 7 days'
        });
        expect(screen.getByText('Next step')).toBeTruthy();
        expect(screen.getByText(/Keep following your current plan/)).toBeTruthy();
        expect(screen.queryByText('What would improve this insight')).toBeNull();
        expect(screen.queryByText(/^- Track food and weight/)).toBeNull();
    });

    it('keeps a recommendation available when the user closes review without applying it', async () => {
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Review suggested budget')).toBeTruthy());

        fireEvent.press(screen.getByText('Review suggested budget'));
        expect(screen.getByText('Review calorie budget')).toBeTruthy();
        expect(screen.getByText('proposed change')).toBeTruthy();
        expect(screen.getByText('150 kcal less/day')).toBeTruthy();
        expect(screen.queryByText('estimated budget difference')).toBeNull();
        expect(screen.queryByText(/200 kcal lower/)).toBeNull();
        fireEvent.press(screen.getByText('Not now'));

        expect(screen.queryByText('Review calorie budget')).toBeNull();
        expect(screen.getByText('Review suggested budget')).toBeTruthy();
        expect(mockApi.applyCalibrationRecommendation).not.toHaveBeenCalled();
    });

    it('renders a scheduled rollback as its resulting budget instead of an ambiguous zero-kcal change', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(scheduledStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Your calorie budget update is scheduled')).toBeTruthy());
        expect(screen.getByText(/daily calorie budget will be 1,900 kcal starting/)).toBeTruthy();
        expect(screen.queryByText('Current evidence supports a lower calorie budget.')).toBeNull();
        expect(screen.queryByText('Review suggested budget')).toBeNull();
    });

    it('formats observed pace in the evaluation display unit', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(recommendationStatus('LB'));
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Review suggested budget')).toBeTruthy());

        fireEvent.press(screen.getByText('Review suggested budget'));
        expect(screen.getByText('-1.00 lb/week')).toBeTruthy();
    });

    it('applies the materialized recommendation with a fresh operation id', async () => {
        mockApi.getCalibrationStatus
            .mockResolvedValueOnce(recommendationStatus())
            .mockResolvedValue(scheduledStatus());
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Review suggested budget')).toBeTruthy());

        fireEvent.press(screen.getByText('Review suggested budget'));
        fireEvent.press(screen.getByText('Apply tomorrow'));

        await waitFor(() => expect(mockApi.applyCalibrationRecommendation).toHaveBeenCalledWith(
            7,
            'calibration-operation-id'
        ));
        await waitFor(() => expect(screen.getByText('Your calorie budget update is scheduled')).toBeTruthy());
    });
});
