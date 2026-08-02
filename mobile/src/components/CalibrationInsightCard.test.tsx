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
            headline: 'Weight loss is trending slower than planned',
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
                observedWeeklyWeightChangeKg: { low: -0.4, midpoint: -0.36, high: -0.3 },
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

function fasterRecommendationStatus(): CalibrationStatusResponse {
    const status = recommendationStatus();
    return {
        ...status,
        evaluation: {
            ...status.evaluation,
            headline: 'Weight loss is trending faster than planned',
            estimates: {
                ...status.evaluation.estimates,
                observedWeeklyWeightChangeKg: { low: -0.7, midpoint: -0.61, high: -0.55 },
                targetAdjustmentKcal: { low: 175, midpoint: 225, high: 275 }
            },
            recommendation: {
                currentTargetKcal: 1900,
                recommendedTargetKcal: 2050,
                adjustmentStepKcal: 150,
                currentTargetAdjustmentKcal: 0,
                recommendedTargetAdjustmentKcal: 150
            }
        }
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

    it('makes the recommendation visual and directly actionable without opening the evidence sheet', async () => {
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('CALIBRATION SUGGESTION')).toBeTruthy());

        expect(screen.getByText('Weight loss is trending slower than planned')).toBeTruthy();
        expect(screen.getByText('0.36 kg/week')).toBeTruthy();
        expect(screen.getByText('Plan: 0.46 kg/week loss')).toBeTruthy();
        expect(screen.getByText('1,750 kcal')).toBeTruthy();
        expect(screen.getByText('150 kcal less than your current 1,900 kcal budget.')).toBeTruthy();
        expect(screen.getByText('Starts tomorrow. Your weight goal stays the same.')).toBeTruthy();
        expect(screen.getByText('Apply 1,750 kcal tomorrow')).toBeTruthy();
        expect(screen.getByText('See why')).toBeTruthy();
        expect(screen.queryByText('Current evidence supports a lower calorie budget.')).toBeNull();
        expect(screen.queryByText(/confident food days/)).toBeNull();
        expect(screen.queryByText('Why we suggest 1,750 kcal')).toBeNull();
    });

    it('uses the evidence sheet to explain the model estimate and conservative first step', async () => {
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('See why')).toBeTruthy());

        fireEvent.press(screen.getByText('See why'));
        expect(screen.getByText('Why we suggest 1,750 kcal')).toBeTruthy();
        expect(screen.getByText('What we observed')).toBeTruthy();
        expect(screen.getByText('1,900 kcal')).toBeTruthy();
        expect(screen.getByText('How Calibrate reached this suggestion')).toBeTruthy();
        expect(screen.getByText('Why a 150 kcal first step?')).toBeTruthy();
        expect(screen.getByText(/daily budget about 200 kcal lower/)).toBeTruthy();
        expect(screen.getByText(/plausible adjustment is 150-250 kcal lower/)).toBeTruthy();
        expect(screen.getByText('This review uses 28 well-tracked food days and 14 weigh-ins across 28 days.')).toBeTruthy();
        expect(screen.queryByText('estimated budget difference')).toBeNull();
        fireEvent.press(screen.getByText('Not now'));

        expect(screen.queryByText('Why we suggest 1,750 kcal')).toBeNull();
        expect(screen.getByText('Apply 1,750 kcal tomorrow')).toBeTruthy();
        expect(mockApi.applyCalibrationRecommendation).not.toHaveBeenCalled();
    });

    it('mirrors the visual hierarchy for a higher-budget recommendation', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(fasterRecommendationStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Weight loss is trending faster than planned')).toBeTruthy());
        expect(screen.getByText('0.61 kg/week')).toBeTruthy();
        expect(screen.getByText('2,050 kcal')).toBeTruthy();
        expect(screen.getByText('150 kcal more than your current 1,900 kcal budget.')).toBeTruthy();
        expect(screen.getByText('Apply 2,050 kcal tomorrow')).toBeTruthy();
    });

    it('renders a scheduled rollback as its resulting budget instead of an ambiguous zero-kcal change', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(scheduledStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Your calorie budget update is scheduled')).toBeTruthy());
        expect(screen.getByText(/daily calorie budget will be 1,900 kcal starting/)).toBeTruthy();
        expect(screen.queryByText('Current evidence supports a lower calorie budget.')).toBeNull();
        expect(screen.queryByText('See why')).toBeNull();
    });

    it('formats observed pace in the evaluation display unit', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(recommendationStatus('LB'));
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('0.79 lb/week')).toBeTruthy());

        expect(screen.getByText('Plan: 1.00 lb/week loss')).toBeTruthy();
    });

    it('applies directly from the card with a fresh operation id', async () => {
        mockApi.getCalibrationStatus
            .mockResolvedValueOnce(recommendationStatus())
            .mockResolvedValue(scheduledStatus());
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Apply 1,750 kcal tomorrow')).toBeTruthy());

        expect(screen.queryByText('Why we suggest 1,750 kcal')).toBeNull();
        fireEvent.press(screen.getByText('Apply 1,750 kcal tomorrow'));

        await waitFor(() => expect(mockApi.applyCalibrationRecommendation).toHaveBeenCalledWith(
            7,
            'calibration-operation-id'
        ));
        await waitFor(() => expect(screen.getByText('Your calorie budget update is scheduled')).toBeTruthy());
    });

    it('keeps the apply action available after the user reviews the evidence', async () => {
        mockApi.getCalibrationStatus
            .mockResolvedValueOnce(recommendationStatus())
            .mockResolvedValue(scheduledStatus());
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('See why')).toBeTruthy());

        fireEvent.press(screen.getByText('See why'));
        const applyButtons = screen.getAllByText('Apply 1,750 kcal tomorrow');
        fireEvent.press(applyButtons[applyButtons.length - 1]);

        await waitFor(() => expect(mockApi.applyCalibrationRecommendation).toHaveBeenCalledWith(
            7,
            'calibration-operation-id'
        ));
        await waitFor(() => expect(screen.getByText('Your calorie budget update is scheduled')).toBeTruthy());
    });

    it('keeps direct-apply errors visible on the card', async () => {
        mockApi.applyCalibrationRecommendation.mockRejectedValueOnce(new Error('Recommendation is no longer current.'));
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Apply 1,750 kcal tomorrow')).toBeTruthy());

        fireEvent.press(screen.getByText('Apply 1,750 kcal tomorrow'));

        await waitFor(() => expect(screen.getByText('Recommendation is no longer current.')).toBeTruthy());
        expect(screen.queryByText('Why we suggest 1,750 kcal')).toBeNull();
    });
});
