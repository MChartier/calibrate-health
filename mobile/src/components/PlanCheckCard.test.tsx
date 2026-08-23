import React from 'react';
import { Dimensions } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CalibrationStatusResponse } from '@calibrate/api-client';
import { PlanCheckCard } from './PlanCheckCard';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';

let mockHasPendingCalibrationEvidence = false;
jest.mock('../offline/usePendingCalibrationEvidenceMutation', () => ({
    usePendingCalibrationEvidenceMutation: () => mockHasPendingCalibrationEvidence
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'plan-check-operation-id') }));
jest.mock('expo-haptics', () => ({
    NotificationFeedbackType: { Success: 'success' },
    notificationAsync: jest.fn(async () => undefined)
}));

const mockApi = {
    getCalibrationStatus: jest.fn(),
    applyCalibrationRecommendation: jest.fn(),
    cancelCalibrationRecommendation: jest.fn()
};

jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({ api: mockApi, user: { timezone: 'America/Los_Angeles' } })
}));

jest.mock('../utils/dates', () => ({
    ...jest.requireActual('../utils/dates'),
    getTodayDate: () => '2026-07-31'
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

function baseStatus(): CalibrationStatusResponse {
    return {
        generatedAt: '2026-07-31T20:00:00.000Z',
        inputFingerprint: 'current-input',
        planStatus: 'available',
        planReasonCode: null,
        evaluation: {
            modelVersion: 4,
            asOfDate: '2026-07-31',
            weightUnit: 'KG',
            status: 'insight',
            headline: 'Legacy headline must not render',
            summary: 'Legacy summary must not render.',
            nextStep: 'Legacy next step must not render.',
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
            missingCriteria: ['Legacy missing criterion must not render.'],
            assumptions: [],
            estimates: {
                averageIntakeKcal: { low: 1850, midpoint: 1900, high: 1950 },
                observedWeeklyWeightChangeKg: { low: -0.50, midpoint: -0.46, high: -0.42 },
                targetAdjustmentKcal: { low: -25, midpoint: 0, high: 25 },
                configuredWeeklyWeightChangeKg: -0.455
            },
            recommendation: null,
            activityContext: null,
            assessment: {
                version: 1,
                state: 'on_track',
                paceStatus: 'aligned',
                window: {
                    startDate: '2026-07-03',
                    endDate: '2026-07-31',
                    spanDays: 28,
                    confidenceLevel: 0.95
                },
                recentWeightTrendKgPerWeek: { low: -0.50, midpoint: -0.46, high: -0.42 },
                goalRateKgPerWeek: -0.455,
                blocker: null,
                targetDecision: 'no_change_recommended',
                targetDecisionBlocker: null,
                minimumDailyCalorieTargetKcal: 1650
            }
        },
        recommendation: null,
        scheduledChange: null
    };
}

function waitingStatus(): CalibrationStatusResponse {
    const status = baseStatus();
    return {
        ...status,
        evaluation: {
            ...status.evaluation,
            status: 'not_ready',
            selectedWindowDays: null,
            estimates: {
                ...status.evaluation.estimates,
                observedWeeklyWeightChangeKg: null
            },
            assessment: {
                ...status.evaluation.assessment,
                state: 'waiting',
                paceStatus: null,
                window: null,
                recentWeightTrendKgPerWeek: null,
                blocker: 'weight_history',
                targetDecision: 'waiting'
            }
        }
    };
}

function recommendationStatus(): CalibrationStatusResponse {
    const status = baseStatus();
    return {
        ...status,
        evaluation: {
            ...status.evaluation,
            status: 'recommendation',
            estimates: {
                ...status.evaluation.estimates,
                observedWeeklyWeightChangeKg: { low: -0.30, midpoint: -0.25, high: -0.20 },
                targetAdjustmentKcal: { low: -250, midpoint: -200, high: -150 }
            },
            recommendation: {
                currentTargetKcal: 1900,
                recommendedTargetKcal: 1750,
                adjustmentStepKcal: -150,
                currentTargetAdjustmentKcal: 0,
                recommendedTargetAdjustmentKcal: -150
            },
            assessment: {
                ...status.evaluation.assessment,
                state: 'off_track',
                paceStatus: 'slower',
                recentWeightTrendKgPerWeek: { low: -0.30, midpoint: -0.25, high: -0.20 },
                targetDecision: 'change_available'
            }
        },
        recommendation: {
            id: 7,
            status: 'pending',
            inputFingerprint: 'current-input',
            effectiveLocalDate: '2026-08-01'
        }
    };
}

function scheduledStatus(): CalibrationStatusResponse {
    return {
        ...recommendationStatus(),
        recommendation: null,
        scheduledChange: {
            recommendationId: 7,
            targetAdjustmentKcal: -150,
            dailyCalorieBudgetKcal: 1750,
            effectiveLocalDate: '2026-08-01'
        }
    };
}

function renderCard() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 }
        }
    });
    const screen = render(
        <QueryClientProvider client={queryClient}>
            <PlanCheckCard />
        </QueryClientProvider>
    );
    return { ...screen, queryClient };
}

describe('Plan check card', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockHasPendingCalibrationEvidence = false;
        Dimensions.set({
            window: { width: 1024, height: 768, scale: 1, fontScale: 1 },
            screen: { width: 1024, height: 768, scale: 1, fontScale: 1 }
        });
        mockApi.getCalibrationStatus.mockResolvedValue(baseStatus());
        mockApi.applyCalibrationRecommendation.mockResolvedValue({
            recommendationId: 7,
            targetAdjustmentKcal: -150,
            dailyCalorieBudgetKcal: 1750,
            effectiveLocalDate: '2026-08-01'
        });
        mockApi.cancelCalibrationRecommendation.mockResolvedValue(recommendationStatus());
    });

    afterEach(async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    });

    it('suppresses stale decisions while evidence is syncing', () => {
        mockHasPendingCalibrationEvidence = true;
        const screen = renderCard();

        expect(screen.getByText('Plan check')).toBeTruthy();
        expect(screen.getByText(/latest food and weight entries are syncing/)).toBeTruthy();
        expect(screen.queryByText('Review adjustment')).toBeNull();
    });

    it('sets expectations without preview metrics while waiting', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(waitingStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Not enough history for a reliable plan check')).toBeTruthy());
        expect(screen.getByText(/Keep logging meals and weight consistently/)).toBeTruthy();
        expect(screen.getByText('more weight history')).toBeTruthy();
        expect(screen.queryByText('Available now')).toBeNull();
        expect(screen.queryByText('Confidence still building')).toBeNull();
        expect(screen.queryByText(/kcal\/day deficit/)).toBeNull();
        expect(screen.queryByText('Legacy headline must not render')).toBeNull();
        expect(screen.queryByText('Legacy summary must not render.')).toBeNull();
    });

    it('shows a retrospective on-track trend and no-change decision', async () => {
        const screen = renderCard();

        await waitFor(() => expect(
            screen.getByText('Your recent weight trend matches your goal')
        ).toBeTruthy());
        expect(screen.getAllByText('0.46 kg/week loss')).toHaveLength(2);
        expect(screen.getByText('Likely range: 0.42-0.50 kg/week loss')).toBeTruthy();
        expect(screen.getByText('This describes the period shown, not a forecast.')).toBeTruthy();
        expect(screen.getByText('No calorie-target change suggested right now.')).toBeTruthy();
        expect(screen.getByTestId('plan-check-pace-comparison')).toBeTruthy();
        expect(screen.queryByText('Expected from logs')).toBeNull();
        expect(screen.queryByText('Estimated calorie balance')).toBeNull();
    });

    it('keeps Apply inside the adjustment review', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(recommendationStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Review adjustment')).toBeTruthy());
        expect(screen.getByText('Your recent weight trend is slower than your goal')).toBeTruthy();
        expect(screen.queryByText('Apply 1,750 kcal')).toBeNull();

        fireEvent.press(screen.getByText('Review adjustment'));
        expect(screen.getByText('Current calorie target')).toBeTruthy();
        expect(screen.getByText('Suggested calorie target')).toBeTruthy();
        expect(screen.getByText('Safety limit')).toBeTruthy();
        expect(screen.getByText('Apply 1,750 kcal')).toBeTruthy();

        fireEvent.press(screen.getByText('Apply 1,750 kcal'));
        await waitFor(() => expect(mockApi.applyCalibrationRecommendation).toHaveBeenCalledWith(
            7,
            'plan-check-operation-id'
        ));
        expect(screen.queryByText('Apply 1,750 kcal')).toBeNull();
    });

    it('keeps the assessment visible with a scheduled update and supports Undo', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(scheduledStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Calorie target update scheduled')).toBeTruthy());
        expect(screen.getByText('Your recent weight trend is slower than your goal')).toBeTruthy();
        expect(screen.getByText(/1,750 kcal\/day starts/)).toBeTruthy();
        expect(screen.queryByText('Review adjustment')).toBeNull();
        expect(screen.queryByText('Keep your current calorie target for now.')).toBeNull();

        fireEvent.press(screen.getByText('Undo'));
        await waitFor(() => expect(mockApi.cancelCalibrationRecommendation).toHaveBeenCalledWith(
            7,
            'plan-check-operation-id'
        ));
    });

    it('updates the cached scheduled state immediately after Apply', async () => {
        mockApi.getCalibrationStatus.mockResolvedValueOnce(recommendationStatus());
        mockApi.getCalibrationStatus.mockResolvedValue(scheduledStatus());
        const { queryClient, ...screen } = renderCard();

        await waitFor(() => expect(screen.getByText('Review adjustment')).toBeTruthy());
        fireEvent.press(screen.getByText('Review adjustment'));
        fireEvent.press(screen.getByText('Apply 1,750 kcal'));

        await waitFor(() => {
            const cached = queryClient.getQueryData<CalibrationStatusResponse>(calibrationStatusQueryKey);
            expect(cached?.recommendation).toBeNull();
            expect(cached?.scheduledChange?.dailyCalorieBudgetKcal).toBe(1750);
        });
    });
});
