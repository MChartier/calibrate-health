import React, { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalibrationStatusResponse } from '@calibrate/api-client';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from './AsyncStateBoundary';
import { BottomSheetModal } from './BottomSheetModal';
import { ProgressBar } from './ProgressBar';
import { SectionHeader } from './SectionHeader';
import { CardHeader } from './CardHeader';
import { useAuth } from '../auth/AuthContext';
import {
    describeCalorieBudgetChange,
    describeCalorieBudgetEstimate,
    describeCalibrationEvidence,
    describeCalibrationEvidenceForReview,
    describeWeightPaceDirection,
    formatWeightPaceMagnitude
} from '../calibration/presentation';
import { addDaysToDateOnly, formatDateOnlyForDisplay, getTodayDate } from '../utils/dates';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';
import { spacing, type AppTheme, useAppTheme } from '../theme';
import { getErrorPresentation, getSafeActionErrorMessage } from '../errors/presentation';
import { usePendingCalibrationEvidenceMutation } from '../offline/usePendingCalibrationEvidenceMutation';

const RECOMMENDATION_STACK_BREAKPOINT = 560; // Keeps paired panels and action labels legible on compact screens.

type CalibrationInsightCardProps = ViewProps & { suppressStaleNotice?: boolean };
type CalibrationInsightCardViewProps = ViewProps & {
    status?: CalibrationStatusResponse;
    isLoading?: boolean;
    error?: Error | null;
    timezone?: string | null;
    todayDate?: string;
    onRetry?: () => void;
    onApplyRecommendation?: (recommendationId: number) => Promise<void>;
    onCancelScheduledChange?: (recommendationId: number) => Promise<void>;
};

/** Production data wrapper for the shared calibration presentation. */
export const CalibrationInsightCard: React.FC<CalibrationInsightCardProps> = ({ suppressStaleNotice, ...props }) => {
    const { api, user } = useAuth();
    const queryClient = useQueryClient();
    const statusQuery = useQuery({
        queryKey: calibrationStatusQueryKey,
        queryFn: () => api.getCalibrationStatus()
    });
    const isOnline = useOnlineStatus();
    const hasPendingEvidence = usePendingCalibrationEvidenceMutation();
    const statusState = useAsyncResourceState(statusQuery, () => false);

    if (hasPendingEvidence) {
        return (
            <AppCard {...props}>
                <CardHeader title="Calibration" metadata="Evidence change syncing" density="compact" />
                <AppText variant="muted">
                    Calibration will return after your pending food and weight changes are checked by the server.
                </AppText>
            </AppCard>
        );
    }

    async function applyRecommendation(recommendationId: number) {
        const change = await api.applyCalibrationRecommendation(recommendationId, Crypto.randomUUID());
        queryClient.setQueryData<CalibrationStatusResponse>(calibrationStatusQueryKey, (current) => current ? ({
            ...current,
            recommendation: null,
            scheduledChange: change
        }) : current);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        void Promise.all([
            queryClient.invalidateQueries({ queryKey: calibrationStatusQueryKey }),
            queryClient.invalidateQueries({ queryKey: ['mobile-profile'] })
        ]).catch(() => undefined);
    }

    async function cancelScheduledChange(recommendationId: number) {
        const nextStatus = await api.cancelCalibrationRecommendation(recommendationId, Crypto.randomUUID());
        queryClient.setQueryData<CalibrationStatusResponse>(calibrationStatusQueryKey, nextStatus);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }).catch(() => undefined);
    }

    return (
        <AsyncStateBoundary
            state={statusState}
            resourceLabel="calibration insight"
            loading={<CalibrationInsightCardView {...props} isLoading timezone={user?.timezone} />}
            empty={<CalibrationInsightCardView {...props} isLoading timezone={user?.timezone} />}
            onRetry={isOnline ? () => statusQuery.refetch() : undefined}
            retrying={statusQuery.isFetching}
            suppressStaleNotice={suppressStaleNotice}
        >
            <CalibrationInsightCardView
                {...props}
                status={statusQuery.data}
                timezone={user?.timezone}
                onApplyRecommendation={applyRecommendation}
                onCancelScheduledChange={cancelScheduledChange}
            />
        </AsyncStateBoundary>
    );
};

/** Shared end-user presentation used by Progress and the calibration scenario lab. */
export const CalibrationInsightCardView: React.FC<CalibrationInsightCardViewProps> = ({
    status,
    isLoading = false,
    error = null,
    timezone,
    todayDate,
    onRetry,
    onApplyRecommendation,
    onCancelScheduledChange,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { width, fontScale } = useWindowDimensions();
    const stackRecommendation = width < RECOMMENDATION_STACK_BREAKPOINT || fontScale >= 1.4;
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [applyError, setApplyError] = useState<Error | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancelError, setCancelError] = useState<Error | null>(null);
    const evaluation = status?.evaluation;
    const hasActionableRecommendation = Boolean(status?.recommendation && evaluation?.recommendation);
    useEffect(() => {
        if (!isReviewOpen || !status || hasActionableRecommendation) return;
        setApplyError(null);
        setIsReviewOpen(false);
    }, [hasActionableRecommendation, isReviewOpen, status]);

    const recommendation = evaluation?.recommendation;
    const scheduledChange = status?.scheduledChange;
    const scheduledChangeIsOnHold = scheduledChange?.dailyCalorieBudgetKcal === null;
    const closeReview = () => {
        setApplyError(null);
        setIsReviewOpen(false);
    };
    const openReview = () => {
        setApplyError(null);
        setIsReviewOpen(true);
    };

    async function applyRecommendation() {
        const recommendationId = status?.recommendation?.id;
        if (!recommendationId || !onApplyRecommendation) {
            setApplyError(new Error('This recommendation is no longer available.'));
            return;
        }
        setIsApplying(true);
        setApplyError(null);
        try {
            await onApplyRecommendation(recommendationId);
            setIsReviewOpen(false);
        } catch (nextError) {
            setApplyError(nextError instanceof Error ? nextError : new Error('Unable to apply this recommendation.'));
        } finally {
            setIsApplying(false);
        }
    }

    async function cancelScheduledChange() {
        const recommendationId = status?.scheduledChange?.recommendationId;
        if (!recommendationId || !onCancelScheduledChange) {
            setCancelError(new Error('This scheduled update is no longer available.'));
            return;
        }
        setIsCancelling(true);
        setCancelError(null);
        try {
            await onCancelScheduledChange(recommendationId);
        } catch (nextError) {
            setCancelError(nextError instanceof Error ? nextError : new Error('Unable to undo this scheduled update.'));
        } finally {
            setIsCancelling(false);
        }
    }

    if (error && !status) {
        const presentation = getErrorPresentation(error, 'calibration insight');
        return (
            <AppCard {...props} style={style}>
                <CardHeader title="Calibration" metadata="Unable to evaluate your latest history." density="compact" />
                <AppText accessibilityRole="alert" style={styles.error}>{presentation.message}</AppText>
                {presentation.requestId && <AppText variant="caption">Reference: {presentation.requestId}</AppText>}
                {onRetry && <AppButton title="Retry" variant="secondary" onPress={onRetry} />}
            </AppCard>
        );
    }

    if (isLoading || !evaluation) {
        return (
            <AppCard {...props} style={style} accessibilityLabel="Loading calibration insight">
                <CardHeader title="Calibration" metadata="Checking your latest completed history..." density="compact" />
            </AppCard>
        );
    }

    const actionableRecommendation = status?.recommendation && recommendation ? recommendation : null;
    const observedPaceKg = evaluation.estimates.observedWeeklyWeightChangeKg?.midpoint ?? null;
    const plannedPaceKg = evaluation.estimates.configuredWeeklyWeightChangeKg;
    const observedPace = formatWeightPaceMagnitude(observedPaceKg, evaluation.weightUnit);
    const plannedPace = formatWeightPaceMagnitude(plannedPaceKg, evaluation.weightUnit);
    const observedDirection = observedPaceKg === null ? null : describeWeightPaceDirection(observedPaceKg);
    const plannedDirection = describeWeightPaceDirection(plannedPaceKg);
    const selectedHistoryDays = evaluation.selectedWindowDays ?? evaluation.dataQuality.observationDays;
    const observedPaceWithDirection = observedDirection && observedDirection !== 'stable'
        ? `${observedPace} ${observedDirection}`
        : observedPace;
    const averageIntake = evaluation.estimates.averageIntakeKcal
        ? `${Math.round(evaluation.estimates.averageIntakeKcal.midpoint).toLocaleString()} kcal`
        : 'Not enough evidence';
    const plannedPaceDescription = plannedDirection === 'stable'
        ? 'your planned steady weight'
        : `your planned ${plannedPace} ${plannedDirection}`;
    const recommendationReason = actionableRecommendation
        ? `Your average weight-change rate across this ${selectedHistoryDays}-day window is ${observedPaceWithDirection}, compared with ${plannedPaceDescription}. If this pattern continues, a slightly ${actionableRecommendation.adjustmentStepKcal < 0 ? 'lower' : 'higher'} daily budget could bring your weekly rate closer to plan.`
        : null;
    const budgetEstimateExplanation = actionableRecommendation
        ? describeCalorieBudgetEstimate(
            evaluation.estimates.targetAdjustmentKcal,
            actionableRecommendation.currentTargetAdjustmentKcal,
            actionableRecommendation.adjustmentStepKcal,
            actionableRecommendation.recommendedTargetKcal
        )
        : null;
    const restoresBaselineBudget = Boolean(actionableRecommendation
        && actionableRecommendation.currentTargetAdjustmentKcal !== 0
        && actionableRecommendation.recommendedTargetAdjustmentKcal === 0);
    const effectiveLocalDate = status?.recommendation?.effectiveLocalDate ?? null;
    const tomorrow = addDaysToDateOnly(todayDate ?? getTodayDate(timezone), 1);
    let effectiveDateLabel = 'on the next local day';
    if (effectiveLocalDate === tomorrow) effectiveDateLabel = 'tomorrow';
    else if (effectiveLocalDate) effectiveDateLabel = `on ${formatDateOnlyForDisplay(effectiveLocalDate)}`;
    const applyButtonTitle = actionableRecommendation
        ? `Apply ${actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal`
        : 'Apply suggested budget';
    const reviewApplyButtonTitle = actionableRecommendation
        ? `${applyButtonTitle} ${effectiveDateLabel}`
        : applyButtonTitle;
    const historyProgress = evaluation.historyProgress;
    const isBuildingBudgetReview = historyProgress?.stage === 'budget_review';
    let cardDescription = evaluation.headline;
    if (isBuildingBudgetReview && evaluation.selectedWindowDays) {
        cardDescription = `${evaluation.selectedWindowDays}-day calibration average`;
    }
    if (scheduledChange && !actionableRecommendation) {
        cardDescription = scheduledChangeIsOnHold
            ? 'Your saved calorie budget update is on hold'
            : 'Your calorie budget update is scheduled';
    }
    let scheduledReviewMessage = recommendation
        ? `Your current ${recommendation.currentTargetKcal.toLocaleString()} kcal budget stays in place until then. Changed your mind? Undo this update before it starts to review the suggestion again.`
        : 'Changed your mind? Undo this update before it starts to keep your current budget and review the suggestion again.';
    if (scheduledChangeIsOnHold) {
        scheduledReviewMessage = 'The saved update is preserved. Undo it to review the suggestion again, or replace your calorie plan before targets resume.';
    }
    let historyProgressTitle = '';
    let historyProgressDescription = '';
    let historyTrackingValue = '';
    if (historyProgress) {
        historyProgressTitle = historyProgress.stage === 'pace_check'
            ? `${historyProgress.restartedAfterPause ? 'Next' : 'First'} available: weight-trend estimate`
            : 'Coming next: calorie-budget review';
        historyProgressDescription = historyProgress.stage === 'pace_check'
            ? 'After these requirements are met, Calibrate can estimate your average weekly weight change. It will not assess your calorie budget yet; that requires at least 14 days of food and weight history.'
            : 'Once the remaining requirements are met, Calibrate can compare your average logged calories with your weight-change rate. If the evidence supports an adjustment, you can review a suggested calorie budget before deciding whether to apply it.';
        historyTrackingValue = historyProgress.stage === 'pace_check'
            ? 'Complete food logs and regular weigh-ins help establish an early trend without overreacting to day-to-day scale changes.'
            : 'Keep completing each food day across multiple meals and weighing in regularly. Better coverage helps separate a true calorie-budget mismatch from missed food entries and normal scale changes.';
    }
    const historyRequirements = historyProgress ? [
        {
            key: 'food',
            label: 'Well-tracked food days',
            accessibilityLabel: 'Well-tracked food days for calibration',
            current: historyProgress.completeFoodDays,
            required: historyProgress.requiredCompleteFoodDays,
            displayValue: `${historyProgress.completeFoodDays} of ${historyProgress.requiredCompleteFoodDays} days`,
            accessibilityValue: `${historyProgress.completeFoodDays} of ${historyProgress.requiredCompleteFoodDays} well-tracked food days`
        },
        {
            key: 'weight-history',
            label: 'Weight history',
            accessibilityLabel: 'Weight history for calibration',
            current: historyProgress.weightSpanDays,
            required: historyProgress.requiredWeightSpanDays,
            displayValue: `${historyProgress.weightSpanDays} of ${historyProgress.requiredWeightSpanDays} days`,
            accessibilityValue: `${historyProgress.weightSpanDays} of ${historyProgress.requiredWeightSpanDays} days of weight history`
        },
        ...(historyProgress.stage === 'budget_review' ? [{
            key: 'weigh-ins',
            label: 'Weigh-ins',
            accessibilityLabel: 'Weigh-ins for a calorie-budget review',
            current: historyProgress.weightPoints,
            required: historyProgress.requiredWeightPoints,
            displayValue: `${historyProgress.weightPoints} of ${historyProgress.requiredWeightPoints}`,
            accessibilityValue: `${historyProgress.weightPoints} of ${historyProgress.requiredWeightPoints} weigh-ins`
        }] : [])
    ].filter((requirement) => requirement.current < requirement.required) : [];
    let nonActionableSummary = evaluation.summary;
    let calibrationRateExplanation: string | null = null;
    if (isBuildingBudgetReview && observedPaceKg !== null && evaluation.selectedWindowDays) {
        let rateDescription = `an average change rate of ${observedPace}`;
        if (observedDirection === 'loss') rateDescription = `an average loss rate of ${observedPace}`;
        if (observedDirection === 'gain') rateDescription = `an average gain rate of ${observedPace}`;
        nonActionableSummary = `Over the ${evaluation.selectedWindowDays} days ending ${formatDateOnlyForDisplay(evaluation.asOfDate)}, your smoothed weight trend had ${rateDescription}.`;
        calibrationRateExplanation = `This weekly rate is fitted across Calibration's full ${evaluation.selectedWindowDays}-day window. The Trend chart's 7-day number is the total change between the visible endpoints, so it is a different measurement and the values are not expected to match.`;
    }

    return (
        <>
            <AppCard {...props} style={style}>
                <CardHeader title="Calibration" metadata={cardDescription} density="compact" />
                {scheduledChange ? (
                    <View style={styles.scheduledPanel}>
                        <View
                            role="status"
                            accessibilityLiveRegion="polite"
                            style={styles.scheduledRow}
                        >
                            <Ionicons
                                name={scheduledChangeIsOnHold ? 'alert-circle' : 'checkmark-circle'}
                                size={20}
                                color={scheduledChangeIsOnHold ? theme.colors.danger : theme.colors.success}
                            />
                            <AppText style={styles.scheduledText}>
                                {scheduledChange.dailyCalorieBudgetKcal === null
                                    ? 'No updated calorie budget will start until you replace your calorie plan.'
                                    : `Your daily calorie budget will be ${scheduledChange.dailyCalorieBudgetKcal.toLocaleString()} kcal starting ${formatDateOnlyForDisplay(scheduledChange.effectiveLocalDate)}.`}
                            </AppText>
                        </View>
                        {scheduledChange.recommendationId !== null && (
                            <View style={styles.scheduledReview}>
                                <AppText variant="muted">
                                    {scheduledReviewMessage}
                                </AppText>
                                <AppButton
                                    title={isCancelling ? 'Undoing...' : 'Undo and review'}
                                    accessibilityLabel="Undo scheduled calorie budget update and review the suggestion again"
                                    variant="secondary"
                                    disabled={isCancelling}
                                    accessibilityState={{ busy: isCancelling }}
                                    leftIcon={<Ionicons name="arrow-undo-outline" size={18} color={theme.colors.onSurface} />}
                                    onPress={() => void cancelScheduledChange()}
                                    style={styles.scheduledAction}
                                />
                            </View>
                        )}
                        {cancelError && (
                            <AppText accessibilityRole="alert" style={styles.error}>
                                {getSafeActionErrorMessage(cancelError, 'Unable to undo this scheduled update.')}
                            </AppText>
                        )}
                    </View>
                ) : actionableRecommendation ? (
                    <>
                        <View style={[
                            styles.recommendationPanels,
                            stackRecommendation && styles.recommendationPanelsStacked
                        ]} testID="calibration-recommendation-panels">
                            <View style={styles.pacePanel}>
                                <AppText variant="metric">{observedPaceWithDirection}</AppText>
                                <AppText variant="label">{selectedHistoryDays}-day average weight-change rate</AppText>
                                <AppText variant="caption">
                                    Planned: {plannedPace}{plannedDirection === 'stable' ? '' : ` ${plannedDirection}`}
                                </AppText>
                            </View>
                            <View style={styles.budgetPanel}>
                                <AppText variant="metric" style={styles.budgetPanelText}>
                                    {actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal
                                </AppText>
                                <AppText variant="label" style={styles.budgetPanelText}>suggested daily budget</AppText>
                                <AppText variant="caption" style={styles.budgetPanelText}>
                                    {describeCalorieBudgetChange(
                                        actionableRecommendation.adjustmentStepKcal,
                                        actionableRecommendation.currentTargetKcal
                                    )}
                                </AppText>
                                {restoresBaselineBudget && (
                                    <AppText variant="caption" style={styles.budgetPanelText}>
                                        This returns you to your previous {actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal daily budget.
                                    </AppText>
                                )}
                            </View>
                        </View>
                        <View style={styles.assuranceRow}>
                            <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                            <AppText variant="muted">
                                If applied, your new budget starts {effectiveDateLabel}. Your weight goal stays the same.
                            </AppText>
                        </View>
                        <View
                            testID="calibration-recommendation-actions"
                            style={[styles.actions, stackRecommendation && styles.actionsStacked]}
                        >
                            <AppButton
                                title={isApplying ? 'Applying...' : applyButtonTitle}
                                disabled={isApplying}
                                accessibilityState={{ busy: isApplying }}
                                leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                                onPress={() => void applyRecommendation()}
                                style={styles.action}
                            />
                            <AppButton
                                title="See why"
                                accessibilityLabel="See evidence behind this budget suggestion"
                                variant="secondary"
                                disabled={isApplying}
                                accessibilityState={{ busy: isApplying }}
                                leftIcon={<Ionicons name="information-circle-outline" size={18} color={theme.colors.onSurface} />}
                                onPress={openReview}
                                style={styles.action}
                            />
                        </View>
                        {applyError && (
                            <AppText accessibilityRole="alert" style={styles.error}>
                                {getSafeActionErrorMessage(applyError, 'Unable to apply this recommendation.')}
                            </AppText>
                        )}
                    </>
                ) : (
                    <>
                        <View style={styles.insightSummary}>
                            {isBuildingBudgetReview && <AppText variant="label">Available now</AppText>}
                            <AppText variant="muted">{nonActionableSummary}</AppText>
                            {calibrationRateExplanation && (
                                <AppText variant="caption">{calibrationRateExplanation}</AppText>
                            )}
                        </View>
                        {historyProgress && (
                            <View style={styles.historyProgress}>
                                <AppText variant="label">{historyProgressTitle}</AppText>
                                <AppText variant="muted">{historyProgressDescription}</AppText>
                                {historyRequirements.map((requirement) => (
                                    <View key={requirement.key} style={styles.historyRequirement}>
                                        <View style={styles.historyProgressHeader}>
                                            <AppText variant="muted">{requirement.label}</AppText>
                                            <AppText variant="caption">{requirement.displayValue}</AppText>
                                        </View>
                                        <ProgressBar
                                            accessible
                                            accessibilityRole="progressbar"
                                            accessibilityLabel={requirement.accessibilityLabel}
                                            accessibilityValue={{
                                                min: 0,
                                                max: requirement.required,
                                                now: Math.min(requirement.current, requirement.required),
                                                text: requirement.accessibilityValue
                                            }}
                                            value={Math.min(1, requirement.current / requirement.required)}
                                        />
                                    </View>
                                ))}
                                <AppText variant="caption">{historyTrackingValue}</AppText>
                            </View>
                        )}
                        {evaluation.selectedWindowDays && !historyProgress && (
                            <AppText variant="caption">{describeCalibrationEvidence(evaluation)}</AppText>
                        )}
                        {evaluation.nextStep && !historyProgress && (
                            <View style={styles.list}>
                                <AppText variant="label">Next step</AppText>
                                <AppText variant="muted">{evaluation.nextStep}</AppText>
                            </View>
                        )}
                        {evaluation.missingCriteria.length > 0 && !status?.recommendation && !evaluation.nextStep && (
                            <View style={styles.list}>
                                <AppText variant="label">Why no insight is available yet</AppText>
                                {evaluation.missingCriteria.map((criterion) => (
                                    <AppText key={criterion} variant="caption">- {criterion}</AppText>
                                ))}
                            </View>
                        )}
                    </>
                )}
            </AppCard>

            <BottomSheetModal
                visible={isReviewOpen}
                accessibilityLabel="Calibration suggestion details"
                showCloseButton
                showHandle={false}
                onRequestClose={closeReview}
            >
                <View style={styles.sheetContent}>
                {actionableRecommendation && (
                    <>
                        <SectionHeader
                            title={`Why we suggest ${actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal`}
                            description="Here is how your recent logs and window-average weight trend informed this suggestion."
                        />
                        <View style={styles.explanationSection}>
                            <AppText variant="label">What we observed</AppText>
                            <View style={styles.evidencePanel}>
                                <View style={[
                                    styles.evidenceRow,
                                    stackRecommendation && styles.evidenceRowStacked
                                ]}>
                                    <AppText variant="muted" style={styles.evidenceLabel}>Average logged</AppText>
                                    <AppText variant="subtitle" style={styles.evidenceValue}>{averageIntake}/day</AppText>
                                </View>
                                <View style={styles.evidenceDivider} />
                                <View style={[
                                    styles.evidenceRow,
                                    stackRecommendation && styles.evidenceRowStacked
                                ]}>
                                    <AppText variant="muted" style={styles.evidenceLabel}>
                                        Average weight-change rate ({selectedHistoryDays} days)
                                    </AppText>
                                    <AppText variant="subtitle" style={styles.evidenceValue}>{observedPaceWithDirection}</AppText>
                                </View>
                                <View style={styles.evidenceDivider} />
                                <View style={[
                                    styles.evidenceRow,
                                    stackRecommendation && styles.evidenceRowStacked
                                ]}>
                                    <AppText variant="muted" style={styles.evidenceLabel}>Planned weekly rate</AppText>
                                    <AppText variant="subtitle" style={styles.evidenceValue}>
                                        {plannedPace}{plannedDirection === 'stable' ? '' : ` ${plannedDirection}`}
                                    </AppText>
                                </View>
                            </View>
                        </View>
                        <View style={styles.explanationSection}>
                            <AppText variant="label">What the pattern suggests</AppText>
                            <AppText variant="muted">{recommendationReason}</AppText>
                        </View>
                        {budgetEstimateExplanation && (
                            <View style={styles.explanationSection}>
                                <AppText variant="label">
                                    Why start with {Math.abs(actionableRecommendation.adjustmentStepKcal).toLocaleString()} kcal?
                                </AppText>
                                <View style={styles.reasoningPanel}>
                                    <View style={styles.reasoningItem}>
                                        <AppText variant="label">Estimated change</AppText>
                                        <AppText variant="muted">{budgetEstimateExplanation.signal}</AppText>
                                    </View>
                                    <View style={styles.evidenceDivider} />
                                    <View style={styles.reasoningItem}>
                                        <AppText variant="label">Uncertainty</AppText>
                                        <AppText variant="muted">{budgetEstimateExplanation.range}</AppText>
                                    </View>
                                    <View style={styles.evidenceDivider} />
                                    <View style={styles.reasoningItem}>
                                        <AppText variant="label">{budgetEstimateExplanation.firstStepLabel}</AppText>
                                        <AppText variant="muted">{budgetEstimateExplanation.firstStep}</AppText>
                                    </View>
                                </View>
                            </View>
                        )}
                        <View style={styles.safetyRow}>
                            <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.primary} />
                            <View style={styles.safetyText}>
                                <AppText variant="label">Evidence and safety</AppText>
                                <AppText variant="caption">
                                    {describeCalibrationEvidenceForReview(evaluation)} Calibrate applies a conservative BMR-based limit to every calorie-budget suggestion.
                                </AppText>
                            </View>
                        </View>
                        <View style={styles.decisionSummary}>
                            <AppText variant="label">
                                {effectiveLocalDate === tomorrow ? 'Proposed budget for tomorrow' : 'Proposed budget update'}
                            </AppText>
                            <View style={styles.budgetTransition}>
                                <View style={styles.transitionBudget}>
                                    <AppText variant="caption" style={styles.budgetPanelText}>Current</AppText>
                                    <AppText variant="subtitle" style={styles.budgetPanelText}>
                                        {actionableRecommendation.currentTargetKcal.toLocaleString()} kcal
                                    </AppText>
                                </View>
                                <Ionicons name="arrow-forward" size={20} color={theme.colors.onSuccessContainer} />
                                <View style={styles.transitionBudget}>
                                    <AppText variant="caption" style={styles.budgetPanelText}>Proposed</AppText>
                                    <AppText variant="subtitle" style={styles.budgetPanelText}>
                                        {actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal
                                    </AppText>
                                </View>
                            </View>
                            <AppText variant="caption" style={styles.budgetPanelText}>Starts {effectiveDateLabel} if applied. Your weight goal stays the same.</AppText>
                        </View>
                    </>
                )}
                {evaluation.missingCriteria.length > 0 && (
                    <View style={styles.list}>
                        {evaluation.missingCriteria.map((criterion) => (
                            <AppText key={criterion} variant="caption">- {criterion}</AppText>
                        ))}
                    </View>
                )}
                {applyError && (
                    <AppText accessibilityRole="alert" style={styles.error}>
                        {getSafeActionErrorMessage(applyError, 'Unable to apply this recommendation.')}
                    </AppText>
                )}
                <View style={[styles.actions, stackRecommendation && styles.actionsStacked]}>
                    <AppButton
                        title={isApplying ? 'Applying...' : reviewApplyButtonTitle}
                        disabled={isApplying}
                        accessibilityState={{ busy: isApplying }}
                        leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                        onPress={() => void applyRecommendation()}
                        style={styles.action}
                    />
                    <AppButton
                        title="Close"
                        variant="secondary"
                        disabled={isApplying}
                        accessibilityState={{ busy: isApplying }}
                        onPress={closeReview}
                        style={styles.action}
                    />
                </View>
                </View>
            </BottomSheetModal>
        </>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    recommendationPanels: {
        flexDirection: 'row',
        gap: spacing.md
    },
    recommendationPanelsStacked: {
        flexDirection: 'column'
    },
    pacePanel: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs,
        borderRadius: theme.radius.md,
        padding: spacing.lg,
        backgroundColor: theme.colors.surfaceContainer
    },
    budgetPanel: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs,
        borderRadius: theme.radius.md,
        padding: spacing.lg,
        backgroundColor: theme.colors.successContainer
    },
    budgetPanelText: {
        color: theme.colors.onSuccessContainer
    },
    assuranceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    sheetContent: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: 800,
        gap: spacing.md
    },
    explanationSection: {
        gap: spacing.xs
    },
    evidencePanel: {
        gap: spacing.sm,
        borderRadius: theme.radius.md,
        padding: spacing.md,
        backgroundColor: theme.colors.surfaceContainer
    },
    evidenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    evidenceRowStacked: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: spacing.xs
    },
    evidenceLabel: {
        flex: 1,
        minWidth: 0
    },
    evidenceValue: {
        flexShrink: 1,
        textAlign: 'right'
    },
    evidenceDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.outlineVariant
    },
    reasoningPanel: {
        gap: spacing.sm,
        borderRadius: theme.radius.md,
        padding: spacing.md,
        backgroundColor: theme.colors.surfaceContainer
    },
    reasoningItem: {
        gap: spacing.xs,
    },
    safetyRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm
    },
    safetyText: {
        flex: 1,
        gap: spacing.xs
    },
    decisionSummary: {
        gap: spacing.xs,
        borderRadius: theme.radius.md,
        padding: spacing.md,
        backgroundColor: theme.colors.successContainer
    },
    budgetTransition: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    transitionBudget: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    scheduledRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm
    },
    scheduledPanel: {
        gap: spacing.md
    },
    scheduledText: {
        flex: 1,
        color: theme.colors.primary,
        fontWeight: '700'
    },
    scheduledReview: {
        gap: spacing.sm
    },
    scheduledAction: {
        alignSelf: 'flex-start'
    },
    list: {
        gap: spacing.xs
    },
    insightSummary: {
        gap: spacing.xs
    },
    historyProgress: {
        gap: spacing.md
    },
    historyRequirement: {
        gap: spacing.xs
    },
    historyProgressHeader: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionsStacked: {
        flexDirection: 'column'
    },
    action: {
        flex: 1
    },
    error: {
        color: theme.colors.danger
    }
    });
}
