import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CalibrationStatusResponse } from '@calibrate/api-client';
import { CalibrationInsightCard } from './CalibrationInsightCard';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';

let mockHasPendingCalibrationEvidence = false;
jest.mock('../offline/usePendingCalibrationEvidenceMutation', () => ({
    usePendingCalibrationEvidenceMutation: () => mockHasPendingCalibrationEvidence
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'calibration-operation-id') }));
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

type Signals = CalibrationStatusResponse['evaluation']['signals'];
type SignalWindow = Signals['recent'];

function signalWindow(overrides: Partial<SignalWindow> = {}): SignalWindow {
    return {
        availability: 'available',
        scope: 'recent_7_days',
        startDate: '2026-07-25',
        endDate: '2026-07-31',
        calendarDays: 7,
        confidenceLevel: 0.95,
        dataQuality: {
            observationDays: 7,
            completeDays: 7,
            confidentDays: 7,
            suspiciousDays: 0,
            incompleteDays: 0,
            missingDays: 0,
            weightPoints: 4,
            weightSpanDays: 7
        },
        averageIntakeKcal: { low: 1825, midpoint: 1900, high: 1975 },
        estimatedDailyDeficitKcal: { low: 350, midpoint: 400, high: 450 },
        expectedWeightChangeKg: { low: -0.41, midpoint: -0.36, high: -0.32 },
        observedWeightChangeKg: { low: -0.4, midpoint: -0.36, high: -0.3 },
        plannedWeightChangeKg: -0.455,
        goalPaceStatus: 'slower',
        logsAgreementStatus: 'consistent',
        ...overrides
    };
}

function matureSignals(): Signals {
    const completeRequirements: Signals['readiness']['weeklySignals']['requirements'] = [
        { code: 'complete_food_days', current: 7, required: 7, status: 'complete' },
        { code: 'weight_span_days', current: 7, required: 7, status: 'complete' },
        { code: 'weight_points', current: 4, required: 2, status: 'complete' }
    ];
    return {
        version: 1,
        minimumDailyCalorieTargetKcal: 1650,
        recent: signalWindow(),
        longTerm: signalWindow({
            scope: 'since_goal_start',
            startDate: '2026-07-04',
            calendarDays: 28,
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
            expectedWeightChangeKg: { low: -1.65, midpoint: -1.45, high: -1.27 },
            observedWeightChangeKg: { low: -1.6, midpoint: -1.44, high: -1.2 },
            plannedWeightChangeKg: -1.82
        }),
        readiness: {
            weeklySignals: {
                status: 'available',
                progressDays: 7,
                requiredDays: 7,
                requirements: completeRequirements
            },
            targetReview: {
                status: 'available',
                progressDays: 14,
                requiredDays: 14,
                requirements: completeRequirements
            }
        }
    };
}

function buildingSignals(): Signals {
    const requirements: Signals['readiness']['weeklySignals']['requirements'] = [
        { code: 'complete_food_days', current: 6, required: 7, status: 'remaining' },
        { code: 'weight_span_days', current: 6, required: 7, status: 'remaining' },
        { code: 'weight_points', current: 6, required: 2, status: 'complete' }
    ];
    return {
        version: 1,
        minimumDailyCalorieTargetKcal: 1650,
        recent: signalWindow({
            availability: 'partial',
            startDate: '2026-07-26',
            calendarDays: 6,
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
            observedWeightChangeKg: null,
            goalPaceStatus: 'uncertain',
            logsAgreementStatus: 'uncertain'
        }),
        longTerm: signalWindow({
            availability: 'partial',
            scope: 'since_goal_start',
            startDate: '2026-07-26',
            calendarDays: 6,
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
            observedWeightChangeKg: null,
            goalPaceStatus: 'uncertain',
            logsAgreementStatus: 'uncertain'
        }),
        readiness: {
            weeklySignals: {
                status: 'building',
                progressDays: 6,
                requiredDays: 7,
                requirements
            },
            targetReview: {
                status: 'building',
                progressDays: 6,
                requiredDays: 14,
                requirements
            }
        }
    };
}

function recommendationStatus(weightUnit: 'KG' | 'LB' = 'KG'): CalibrationStatusResponse {
    return {
        generatedAt: '2026-07-31T20:00:00.000Z',
        inputFingerprint: 'current-input',
        evaluation: {
            modelVersion: 4,
            asOfDate: '2026-07-31',
            weightUnit,
            status: 'recommendation',
            headline: "You're losing weight, but slower than planned",
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
            activityContext: null,
            signals: matureSignals()
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
            headline: 'Legacy headline must not render',
            summary: 'Legacy summary must not render.',
            nextStep: 'Legacy next step must not render.',
            historyProgress: {
                stage: 'pace_check',
                observedDays: 6,
                requiredDays: 7,
                completeFoodDays: 6,
                requiredCompleteFoodDays: 7,
                weightSpanDays: 6,
                requiredWeightSpanDays: 7,
                weightPoints: 6,
                requiredWeightPoints: 2,
                restartedAfterPause: false
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
            missingCriteria: ['Legacy missing criterion must not render.'],
            estimates: {
                averageIntakeKcal: null,
                observedWeeklyWeightChangeKg: null,
                targetAdjustmentKcal: null,
                configuredWeeklyWeightChangeKg: -0.455
            },
            recommendation: null,
            signals: buildingSignals()
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
    const screen = render(
        <QueryClientProvider client={queryClient}>
            <CalibrationInsightCard />
        </QueryClientProvider>
    );
    return { ...screen, queryClient };
}

describe('CalibrationInsightCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockHasPendingCalibrationEvidence = false;
        Dimensions.set({
            window: { width: 1024, height: 768, scale: 1, fontScale: 1 },
            screen: { width: 1024, height: 768, scale: 1, fontScale: 1 }
        });
        mockApi.getCalibrationStatus.mockResolvedValue(recommendationStatus());
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

    it('suppresses stale actions while queued evidence is syncing', () => {
        mockHasPendingCalibrationEvidence = true;
        const screen = renderCard();

        expect(screen.getByText('Updating measured signals...')).toBeTruthy();
        expect(screen.getByText(/latest food and weight changes are syncing/)).toBeTruthy();
        expect(screen.queryByText('Apply 1,750 kcal')).toBeNull();
    });

    it('shows one evidence-based weekly milestone and the calorie balance available now', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(buildingHistoryStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Building your weekly signal')).toBeTruthy());
        expect(screen.getByRole('progressbar', { name: 'Weekly calibration signal progress' })
            .props.accessibilityValue).toEqual({
            min: 0,
            max: 7,
            now: 6,
            text: '6 of 7 evidence days'
        });
        expect(screen.getByText('6 of 7 well-tracked food days')).toBeTruthy();
        expect(screen.getByText('6 of 7 days of weight history')).toBeTruthy();
        expect(screen.getByText('Available now')).toBeTruthy();
        expect(screen.getByText('400 kcal/day deficit')).toBeTruthy();
        expect(screen.queryByText('Legacy headline must not render')).toBeNull();
        expect(screen.queryByText('Legacy summary must not render.')).toBeNull();
        expect(screen.queryByText('Legacy next step must not render.')).toBeNull();
        expect(screen.queryByText('Legacy missing criterion must not render.')).toBeNull();
    });

    it('renders both mature scopes with numeric ranges and accessible comparisons', async () => {
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Past 7 days')).toBeTruthy());
        expect(screen.getByText('Since goal start')).toBeTruthy();
        expect(screen.getAllByText('Slower than goal')).toHaveLength(2);
        expect(screen.getByTestId('calibration-range-chart-recent_7_days')).toBeTruthy();
        expect(screen.getByTestId('calibration-range-chart-since_goal_start')).toBeTruthy();
        expect(screen.getByLabelText(/Past 7 days comparison.*Observed 0.36 kg loss.*Goal 0.46 kg loss/))
            .toBeTruthy();
        expect(screen.getAllByText('0.36 kg loss')).toHaveLength(2);
        expect(screen.getByText('1.44 kg loss')).toBeTruthy();
        expect(screen.getByText('1.45 kg loss')).toBeTruthy();
        expect(screen.getByText('95% range 350-450 kcal/day deficit')).toBeTruthy();
        expect(screen.queryByText("You're losing weight, but slower than planned")).toBeNull();
        expect(screen.queryByText('Current evidence supports a lower calorie budget.')).toBeNull();
    });

    it.each([
        ['maintenance', 'aligned' as const, 0, 'Aligned with goal'],
        ['gain', 'slower' as const, 0.45, 'Slower than goal']
    ])('shows descriptive signals without an adjustment for a %s goal', async (
        _goal,
        goalPaceStatus,
        plannedWeightChangeKg,
        expectedLabel
    ) => {
        const status = recommendationStatus();
        const recent = signalWindow({
            plannedWeightChangeKg,
            goalPaceStatus,
            observedWeightChangeKg: plannedWeightChangeKg === 0
                ? { low: -0.02, midpoint: 0, high: 0.02 }
                : { low: 0.15, midpoint: 0.2, high: 0.25 }
        });
        mockApi.getCalibrationStatus.mockResolvedValue({
            ...status,
            evaluation: {
                ...status.evaluation,
                status: 'insight',
                recommendation: null,
                signals: {
                    ...matureSignals(),
                    recent,
                    longTerm: {
                        ...recent,
                        scope: 'since_goal_start',
                        startDate: '2026-07-04',
                        calendarDays: 28
                    }
                }
            },
            recommendation: null
        });
        const screen = renderCard();

        await waitFor(() => expect(screen.getAllByText(expectedLabel)).toHaveLength(2));
        expect(screen.queryByText('High-confidence target adjustment')).toBeNull();
    });

    it('shows a compact second milestone after weekly signals unlock', async () => {
        const status = recommendationStatus();
        mockApi.getCalibrationStatus.mockResolvedValue({
            ...status,
            evaluation: {
                ...status.evaluation,
                status: 'insight',
                recommendation: null,
                signals: {
                    ...matureSignals(),
                    readiness: {
                        ...matureSignals().readiness,
                        targetReview: {
                            status: 'building',
                            progressDays: 13,
                            requiredDays: 14,
                            requirements: [
                                { code: 'weight_span_days', current: 13, required: 14, status: 'remaining' }
                            ]
                        }
                    }
                }
            },
            recommendation: null
        });
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Calorie-target review')).toBeTruthy());
        expect(screen.getByRole('progressbar', { name: 'Calorie target review progress' })
            .props.accessibilityValue).toEqual({
            min: 0,
            max: 14,
            now: 13,
            text: '13 of 14 days'
        });
        expect(screen.getByText('13 of 14 days of weight history')).toBeTruthy();
    });

    it('replaces elapsed-time prose with structured blockers once thresholds are met', async () => {
        const status = recommendationStatus();
        mockApi.getCalibrationStatus.mockResolvedValue({
            ...status,
            evaluation: {
                ...status.evaluation,
                status: 'insight',
                recommendation: null,
                signals: {
                    ...matureSignals(),
                    readiness: {
                        ...matureSignals().readiness,
                        targetReview: {
                            status: 'limited',
                            progressDays: 14,
                            requiredDays: 14,
                            requirements: [
                                { code: 'current_weigh_in', current: 0, required: 1, status: 'remaining' },
                                { code: 'food_uncertainty', current: null, required: null, status: 'remaining' }
                            ]
                        }
                    }
                }
            },
            recommendation: null
        });
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('More confidence needed')).toBeTruthy());
        expect(screen.getByText('Add a current weigh-in')).toBeTruthy();
        expect(screen.getByText('Food-log range still wide')).toBeTruthy();
        expect(screen.queryByRole('progressbar', { name: 'Calorie target review progress' })).toBeNull();
    });

    it('makes a high-confidence adjustment directly actionable without legacy prose', async () => {
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('High-confidence target adjustment')).toBeTruthy());
        expect(screen.getByText('Based on the latest 28-day calibration window')).toBeTruthy();
        expect(screen.getByText('1,900 kcal')).toBeTruthy();
        expect(screen.getByText('1,750 kcal')).toBeTruthy();
        expect(screen.getByText(/150 kcal\/day lower.*starts tomorrow/)).toBeTruthy();
        expect(screen.getByText('Apply 1,750 kcal')).toBeTruthy();
        expect(screen.getByText('Review adjustment')).toBeTruthy();
        expect(screen.queryByText("You're losing weight, but slower than planned")).toBeNull();
        expect(screen.queryByText('Current evidence supports a lower calorie budget.')).toBeNull();
    });

    it('uses a compact metric review with the modeled range and conservative step', async () => {
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Review adjustment')).toBeTruthy());

        fireEvent.press(screen.getByText('Review adjustment'));
        expect(screen.getByText('Observed weight rate')).toBeTruthy();
        expect(screen.getByText('0.36 kg loss/week')).toBeTruthy();
        expect(screen.getByText('Average logged intake')).toBeTruthy();
        expect(screen.getByText('1,900 kcal/day')).toBeTruthy();
        expect(screen.getByText('Modeled target correction')).toBeTruthy();
        expect(screen.getByText('-250 to -150 kcal/day')).toBeTruthy();
        expect(screen.getByText('Conservative first step')).toBeTruthy();
        expect(screen.getByText('150 kcal/day lower')).toBeTruthy();
        expect(screen.getByText('BMR-based safety limit')).toBeTruthy();
        expect(screen.getByText('1,650 kcal/day minimum')).toBeTruthy();
        expect(screen.getByText(/BMR-based calorie-budget limit/)).toBeTruthy();
        expect(screen.getByText('Proposed target')).toBeTruthy();
        expect(screen.getByText('Close')).toBeTruthy();
        fireEvent.press(screen.getByText('Close'));
        expect(screen.queryByText('Observed weight rate')).toBeNull();
    });

    it.each([
        ['compact width', { width: 390, height: 844, scale: 1, fontScale: 1 }],
        ['large text', { width: 800, height: 900, scale: 1, fontScale: 1.5 }]
    ])('stacks signals and actions for %s', async (_label, dimensions) => {
        Dimensions.set({ window: dimensions, screen: dimensions });
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Past 7 days')).toBeTruthy());
        expect(StyleSheet.flatten(screen.getByTestId('calibration-signal-grid').props.style))
            .toMatchObject({ flexDirection: 'column' });
        expect(StyleSheet.flatten(screen.getByTestId('calibration-recommendation-actions').props.style))
            .toMatchObject({ flexDirection: 'column' });
    });

    it('uses the actual effective date when the change is not scheduled for tomorrow', async () => {
        const status = recommendationStatus();
        mockApi.getCalibrationStatus.mockResolvedValue({
            ...status,
            recommendation: { ...status.recommendation!, effectiveLocalDate: '2026-08-03' }
        });
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText(/starts on Aug 3, 2026/)).toBeTruthy());
        fireEvent.press(screen.getByText('Review adjustment'));
        expect(screen.getByText('Starts on Aug 3, 2026 only if you apply it.')).toBeTruthy();
    });

    it('keeps descriptive signal panels visible with a scheduled update banner', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(scheduledStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Calorie budget update scheduled')).toBeTruthy());
        expect(screen.getByText('Past 7 days')).toBeTruthy();
        expect(screen.getByText('Since goal start')).toBeTruthy();
        expect(screen.getByText('1,900 kcal/day starts Aug 1, 2026.')).toBeTruthy();
        expect(screen.getByText('Undo')).toBeTruthy();
        expect(screen.queryByText('High-confidence target adjustment')).toBeNull();
    });

    it('shows an unsafe scheduled revision as on hold without hiding signals', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue({
            ...scheduledStatus(),
            planStatus: 'requires_review',
            planReasonCode: 'HISTORICAL_PLAN_REQUIRES_REVIEW',
            scheduledChange: {
                ...scheduledStatus().scheduledChange!,
                dailyCalorieBudgetKcal: null
            }
        });
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Saved update on hold')).toBeTruthy());
        expect(screen.getByText('No updated budget starts until the calorie plan is replaced.')).toBeTruthy();
        expect(screen.getByText('Past 7 days')).toBeTruthy();
    });

    it('undoes a scheduled update and restores the adjustment for review', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(scheduledStatus());
        mockApi.cancelCalibrationRecommendation.mockResolvedValue(recommendationStatus());
        const screen = renderCard();

        await waitFor(() => expect(screen.getByText('Undo')).toBeTruthy());
        fireEvent.press(screen.getByText('Undo'));

        await waitFor(() => expect(mockApi.cancelCalibrationRecommendation).toHaveBeenCalledWith(
            7,
            'calibration-operation-id'
        ));
        await waitFor(() => expect(screen.getByText('Apply 1,750 kcal')).toBeTruthy());
        expect(screen.queryByText('Calorie budget update scheduled')).toBeNull();
    });

    it('formats all measured weight changes in pounds', async () => {
        mockApi.getCalibrationStatus.mockResolvedValue(recommendationStatus('LB'));
        const screen = renderCard();

        await waitFor(() => expect(screen.getAllByText('0.79 lb loss')).toHaveLength(2));
        expect(screen.getByText('3.17 lb loss')).toBeTruthy();
        expect(screen.getByLabelText(/Goal 1.00 lb loss/)).toBeTruthy();
    });

    it('applies directly from the card and shows the accepted schedule', async () => {
        mockApi.getCalibrationStatus
            .mockResolvedValueOnce(recommendationStatus())
            .mockResolvedValue(scheduledStatus());
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Apply 1,750 kcal')).toBeTruthy());

        fireEvent.press(screen.getByText('Apply 1,750 kcal'));

        await waitFor(() => expect(mockApi.applyCalibrationRecommendation).toHaveBeenCalledWith(
            7,
            'calibration-operation-id'
        ));
        await waitFor(() => expect(screen.getByText('Calorie budget update scheduled')).toBeTruthy());
        await waitFor(() => expect(screen.queryClient.isFetching()).toBe(0));
    });

    it('keeps an accepted schedule visible if its status refresh fails', async () => {
        mockApi.getCalibrationStatus
            .mockResolvedValueOnce(recommendationStatus())
            .mockRejectedValueOnce(new Error('Refresh failed'));
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Apply 1,750 kcal')).toBeTruthy());

        fireEvent.press(screen.getByText('Apply 1,750 kcal'));

        await waitFor(() => expect(screen.getByText('Calorie budget update scheduled')).toBeTruthy());
        expect(screen.getByText('1,750 kcal/day starts Aug 1, 2026.')).toBeTruthy();
        expect(screen.getByText('Past 7 days')).toBeTruthy();
    });

    it('closes an open review when the recommendation becomes stale', async () => {
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Review adjustment')).toBeTruthy());
        fireEvent.press(screen.getByText('Review adjustment'));
        expect(screen.getByText('Observed weight rate')).toBeTruthy();

        const staleStatus = recommendationStatus();
        await act(async () => {
            screen.queryClient.setQueryData(calibrationStatusQueryKey, {
                ...staleStatus,
                evaluation: {
                    ...staleStatus.evaluation,
                    status: 'insight',
                    recommendation: null
                },
                recommendation: null
            });
            await Promise.resolve();
        });

        await waitFor(() => expect(screen.queryByText('Observed weight rate')).toBeNull());
        expect(screen.queryByText('Apply suggested budget')).toBeNull();
    });

    it('keeps direct-apply errors visible on the card', async () => {
        mockApi.applyCalibrationRecommendation.mockRejectedValueOnce(
            new Error('Recommendation is no longer current.')
        );
        const screen = renderCard();
        await waitFor(() => expect(screen.getByText('Apply 1,750 kcal')).toBeTruthy());

        fireEvent.press(screen.getByText('Apply 1,750 kcal'));

        await waitFor(() => expect(screen.getByText('Unable to apply this recommendation.')).toBeTruthy());
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.queryByText('Recommendation is no longer current.')).toBeNull();
    });
});
