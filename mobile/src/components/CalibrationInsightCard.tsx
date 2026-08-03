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
import { BottomSheetModal } from './BottomSheetModal';
import { ProgressBar } from './ProgressBar';
import { SectionHeader } from './SectionHeader';
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

const RECOMMENDATION_STACK_BREAKPOINT = 560; // Keeps paired panels and action labels legible on compact screens.

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
export const CalibrationInsightCard: React.FC<ViewProps> = (props) => {
    const { api, user } = useAuth();
    const queryClient = useQueryClient();
    const statusQuery = useQuery({
        queryKey: calibrationStatusQueryKey,
        queryFn: () => api.getCalibrationStatus()
    });

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
        <CalibrationInsightCardView
            {...props}
            status={statusQuery.data}
            isLoading={statusQuery.isLoading}
            error={statusQuery.error}
            timezone={user?.timezone}
            onRetry={() => void statusQuery.refetch()}
            onApplyRecommendation={applyRecommendation}
            onCancelScheduledChange={cancelScheduledChange}
        />
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
        return (
            <AppCard {...props} style={style}>
                <SectionHeader title="Calibration" description="Unable to evaluate your latest history." />
                <AppText style={styles.error}>{error.message}</AppText>
                {onRetry && <AppButton title="Try again" variant="secondary" onPress={onRetry} />}
            </AppCard>
        );
    }

    if (isLoading || !evaluation) {
        return (
            <AppCard {...props} style={style} accessibilityLabel="Loading calibration insight">
                <SectionHeader title="Calibration" description="Checking your latest completed history..." />
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
    const recommendationReason = actionableRecommendation
        ? `Your logged intake and weight trend are moving at a different pace than planned. If this pattern continues, a slightly ${actionableRecommendation.adjustmentStepKcal < 0 ? 'lower' : 'higher'} daily budget could bring your pace closer to plan.`
        : null;
    const budgetEstimateExplanation = actionableRecommendation
        ? describeCalorieBudgetEstimate(
            evaluation.estimates.targetAdjustmentKcal,
            actionableRecommendation.currentTargetAdjustmentKcal,
            actionableRecommendation.adjustmentStepKcal
        )
        : null;
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
    const cardDescription = scheduledChange && !actionableRecommendation
        ? 'Your calorie budget update is scheduled'
        : evaluation.headline;
    const scheduledReviewMessage = recommendation
        ? `Your current ${recommendation.currentTargetKcal.toLocaleString()} kcal budget stays in place until then. Changed your mind? Undo this update before it starts to review the suggestion again.`
        : 'Changed your mind? Undo this update before it starts to keep your current budget and review the suggestion again.';

    return (
        <>
            <AppCard {...props} style={style}>
                <SectionHeader
                    title="Calibration"
                    description={cardDescription}
                />
                {scheduledChange ? (
                    <View style={styles.scheduledPanel}>
                        <View
                            role="status"
                            accessibilityLiveRegion="polite"
                            style={styles.scheduledRow}
                        >
                            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                            <AppText style={styles.scheduledText}>
                                {scheduledChange.dailyCalorieBudgetKcal === null
                                    ? `Your updated daily calorie budget starts ${formatDateOnlyForDisplay(scheduledChange.effectiveLocalDate)}.`
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
                                {cancelError.message}
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
                                <AppText variant="label">{selectedHistoryDays}-day pace</AppText>
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
                            <AppText accessibilityRole="alert" style={styles.error}>{applyError.message}</AppText>
                        )}
                    </>
                ) : (
                    <>
                        <AppText variant="muted">{evaluation.summary}</AppText>
                        {evaluation.historyProgress && (
                            <View style={styles.historyProgress}>
                                <View style={styles.historyProgressHeader}>
                                    <AppText variant="label">Progress toward your first pace check</AppText>
                                    <AppText variant="caption">
                                        {evaluation.historyProgress.observedDays} of {evaluation.historyProgress.requiredDays} days
                                    </AppText>
                                </View>
                                <ProgressBar
                                    accessible
                                    accessibilityRole="progressbar"
                                    accessibilityLabel="History for your first pace check"
                                    accessibilityValue={{
                                        min: 0,
                                        max: evaluation.historyProgress.requiredDays,
                                        now: evaluation.historyProgress.observedDays,
                                        text: `${evaluation.historyProgress.observedDays} of ${evaluation.historyProgress.requiredDays} days`
                                    }}
                                    value={evaluation.historyProgress.observedDays / evaluation.historyProgress.requiredDays}
                                />
                            </View>
                        )}
                        {evaluation.selectedWindowDays && (
                            <AppText variant="caption">{describeCalibrationEvidence(evaluation)}</AppText>
                        )}
                        {evaluation.nextStep && (
                            <View style={styles.list}>
                                <AppText variant="label">Next step</AppText>
                                <AppText variant="muted">{evaluation.nextStep}</AppText>
                            </View>
                        )}
                        {evaluation.missingCriteria.length > 0 && !status?.recommendation && !evaluation.nextStep && (
                            <View style={styles.list}>
                                <AppText variant="label">What would improve this insight</AppText>
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
                            description="Here is how your recent logs and weight trend informed this suggestion."
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
                                    <AppText variant="muted" style={styles.evidenceLabel}>Recent pace</AppText>
                                    <AppText variant="subtitle" style={styles.evidenceValue}>{observedPaceWithDirection}</AppText>
                                </View>
                                <View style={styles.evidenceDivider} />
                                <View style={[
                                    styles.evidenceRow,
                                    stackRecommendation && styles.evidenceRowStacked
                                ]}>
                                    <AppText variant="muted" style={styles.evidenceLabel}>Planned pace</AppText>
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
                                        <AppText variant="label">Recommended first step</AppText>
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
                                    {describeCalibrationEvidenceForReview(evaluation)} Calibrate checks every suggestion against a BMR-based safety floor before showing it.
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
                    <AppText accessibilityRole="alert" style={styles.error}>{applyError.message}</AppText>
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
    historyProgress: {
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
