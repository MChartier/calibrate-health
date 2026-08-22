import React, { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalibrationStatusResponse } from '@calibrate/api-client';
import type {
    CalibrationInterval,
    CalibrationReadinessRequirement,
    CalibrationSignalWindow
} from '@calibrate/shared/calibration';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from './AsyncStateBoundary';
import { BottomSheetModal } from './BottomSheetModal';
import { CardHeader } from './CardHeader';
import { ProgressBar } from './ProgressBar';
import { CalibrationSignalPanel } from '../calibration/CalibrationSignalPanel';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';
import { useAuth } from '../auth/AuthContext';
import { getErrorPresentation, getSafeActionErrorMessage } from '../errors/presentation';
import { usePendingCalibrationEvidenceMutation } from '../offline/usePendingCalibrationEvidenceMutation';
import { addDaysToDateOnly, formatDateOnlyForDisplay, getTodayDate } from '../utils/dates';
import { spacing, type AppTheme, useAppTheme } from '../theme';

const SIGNAL_GRID_BREAKPOINT = 760; // Keeps both range plots and metric labels readable before stacking.
const POUNDS_PER_KILOGRAM = 2.2046226218;

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
export const CalibrationInsightCard: React.FC<CalibrationInsightCardProps> = ({
    suppressStaleNotice,
    ...props
}) => {
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
            <AppCard {...props} density="compact">
                <CardHeader title="Calibration" metadata="Updating measured signals..." density="compact" />
                <AppText variant="muted">
                    Your latest food and weight changes are syncing before these comparisons update.
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
            resourceLabel="calibration signals"
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

function formatWeightChange(valueKg: number, unit: 'KG' | 'LB'): string {
    const value = unit === 'LB' ? valueKg * POUNDS_PER_KILOGRAM : valueKg;
    const suffix = unit === 'LB' ? 'lb' : 'kg';
    if (Math.abs(value) < 0.005) return '0.00 ' + suffix;
    return Math.abs(value).toFixed(2) + ' ' + suffix + ' ' + (value < 0 ? 'loss' : 'gain');
}

function formatWeightRate(valueKg: number | null, unit: 'KG' | 'LB'): string {
    if (valueKg === null) return 'Not available';
    return formatWeightChange(valueKg, unit) + '/week';
}

function formatCalorieInterval(interval: CalibrationInterval | null): string {
    if (!interval) return 'Not available';
    const midpoint = Math.round(interval.midpoint);
    if (Math.abs(midpoint) < 25) return 'Near balance';
    return Math.abs(midpoint).toLocaleString() + ' kcal/day ' + (midpoint > 0 ? 'deficit' : 'surplus');
}

function formatSignedCalorieRange(interval: CalibrationInterval | null): string {
    if (!interval) return 'Not available';
    return Math.round(interval.low).toLocaleString() + ' to ' +
        Math.round(interval.high).toLocaleString() + ' kcal/day';
}

function getRequirementLabel(requirement: CalibrationReadinessRequirement): string {
    const current = requirement.current;
    const required = requirement.required;
    switch (requirement.code) {
        case 'complete_food_days':
            return current !== null && required !== null
                ? current + ' of ' + required + ' well-tracked food days'
                : 'Food-log range still wide';
        case 'weight_span_days':
            return current !== null && required !== null
                ? current + ' of ' + required + ' days of weight history'
                : 'More weight history needed';
        case 'weight_points':
            return current !== null && required !== null
                ? current + ' of ' + required + ' weigh-ins'
                : 'More weigh-ins needed';
        case 'current_weigh_in':
            return 'Add a current weigh-in';
        case 'food_uncertainty':
            return 'Food-log range still wide';
        case 'weight_uncertainty':
            return 'Weight-trend range still wide';
        case 'adult_only':
            return 'Target adjustments are available to adults only';
        case 'safety_floor':
            return 'The calorie-budget safety limit prevents a lower target';
    }
}

const RequirementList: React.FC<{
    requirements: CalibrationReadinessRequirement[];
}> = ({ requirements }) => {
    const theme = useAppTheme();
    const visible = requirements.filter((requirement) => requirement.status !== 'complete');
    if (visible.length === 0) return null;
    return (
        <View style={styles.requirementList}>
            {visible.map((requirement) => (
                <View key={requirement.code} style={styles.requirementRow}>
                    <Ionicons
                        name={requirement.status === 'blocked' ? 'alert-circle-outline' : 'ellipse-outline'}
                        size={16}
                        color={requirement.status === 'blocked'
                            ? theme.colors.warning
                            : theme.colors.onSurfaceVariant}
                    />
                    <AppText variant="caption" style={styles.requirementText}>
                        {getRequirementLabel(requirement)}
                    </AppText>
                </View>
            ))}
        </View>
    );
};

const ReadinessPanel: React.FC<{
    recent: CalibrationSignalWindow;
    progressDays: number;
    requiredDays: number;
    requirements: CalibrationReadinessRequirement[];
}> = ({ recent, progressDays, requiredDays, requirements }) => {
    const theme = useAppTheme();
    return (
        <View style={styles.readinessPanel}>
            <View style={styles.readinessHeader}>
                <View style={styles.readinessTitle}>
                    <AppText variant="subtitle">Building your weekly signal</AppText>
                    <AppText variant="muted">
                        Complete food logs and weigh-ins unlock the measured weight comparison.
                    </AppText>
                </View>
                <AppText variant="label">{progressDays} of {requiredDays} days</AppText>
            </View>
            <ProgressBar
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Weekly calibration signal progress"
                accessibilityValue={{
                    min: 0,
                    max: requiredDays,
                    now: progressDays,
                    text: progressDays + ' of ' + requiredDays + ' evidence days'
                }}
                value={Math.min(1, progressDays / requiredDays)}
            />
            <RequirementList requirements={requirements} />
            {recent.estimatedDailyDeficitKcal && (
                <View style={[styles.availableBalance, { backgroundColor: theme.colors.infoContainer }]}>
                    <Ionicons name="flash-outline" size={20} color={theme.colors.onInfoContainer} />
                    <View style={styles.availableBalanceText}>
                        <AppText variant="caption" style={{ color: theme.colors.onInfoContainer }}>Available now</AppText>
                        <AppText variant="subtitle" style={{ color: theme.colors.onInfoContainer }}>
                            {formatCalorieInterval(recent.estimatedDailyDeficitKcal)}
                        </AppText>
                        <AppText variant="caption" style={{ color: theme.colors.onInfoContainer }}>
                            Estimated from completed food history versus profile-estimated calories out.
                        </AppText>
                    </View>
                </View>
            )}
        </View>
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
    const themedStyles = React.useMemo(() => createStyles(theme), [theme]);
    const { width, fontScale } = useWindowDimensions();
    const stackPanels = width < SIGNAL_GRID_BREAKPOINT || fontScale >= 1.3;
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [applyError, setApplyError] = useState<Error | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancelError, setCancelError] = useState<Error | null>(null);
    const evaluation = status?.evaluation;
    const signals = evaluation?.signals;
    const recommendation = evaluation?.recommendation;
    const actionableRecommendation = status?.recommendation && recommendation ? recommendation : null;
    const scheduledChange = status?.scheduledChange;
    const scheduledChangeIsOnHold = scheduledChange?.dailyCalorieBudgetKcal === null;

    useEffect(() => {
        if (!isReviewOpen || !status || actionableRecommendation) return;
        setApplyError(null);
        setIsReviewOpen(false);
    }, [actionableRecommendation, isReviewOpen, status]);

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
        const presentation = getErrorPresentation(error, 'calibration signals');
        return (
            <AppCard {...props} density="compact" style={style}>
                <CardHeader title="Calibration" metadata="Unable to update measured signals" density="compact" />
                <AppText accessibilityRole="alert" style={themedStyles.error}>{presentation.message}</AppText>
                {presentation.requestId && <AppText variant="caption">Reference: {presentation.requestId}</AppText>}
                {onRetry && <AppButton title="Retry" variant="secondary" onPress={onRetry} />}
            </AppCard>
        );
    }

    if (isLoading || !evaluation) {
        return (
            <AppCard {...props} density="compact" style={style} accessibilityLabel="Loading calibration signals">
                <CardHeader title="Calibration" metadata="Updating through your latest completed day..." density="compact" />
            </AppCard>
        );
    }

    if (!signals) {
        return (
            <AppCard {...props} density="compact" style={style}>
                <CardHeader title="Calibration" metadata="Measured signals are unavailable" density="compact" />
                <AppText variant="muted">Refresh to load the latest structured progress comparison.</AppText>
                {onRetry && <AppButton title="Retry" variant="secondary" onPress={onRetry} />}
            </AppCard>
        );
    }

    const effectiveLocalDate = status?.recommendation?.effectiveLocalDate ?? null;
    const tomorrow = addDaysToDateOnly(todayDate ?? getTodayDate(timezone), 1);
    let effectiveDateLabel = 'on the next local day';
    if (effectiveLocalDate === tomorrow) effectiveDateLabel = 'tomorrow';
    else if (effectiveLocalDate) effectiveDateLabel = 'on ' + formatDateOnlyForDisplay(effectiveLocalDate);
    const weeklyReady = signals.readiness.weeklySignals.status === 'available';
    const targetReadiness = signals.readiness.targetReview;
    const showTargetReadiness = targetReadiness.status === 'building' || targetReadiness.status === 'limited';
    const selectedHistoryDays = evaluation.selectedWindowDays ?? evaluation.dataQuality.observationDays;
    const observedWeekly = evaluation.estimates.observedWeeklyWeightChangeKg?.midpoint ?? null;
    const applyTitle = actionableRecommendation
        ? 'Apply ' + actionableRecommendation.recommendedTargetKcal.toLocaleString() + ' kcal'
        : 'Apply suggested budget';

    return (
        <>
            <AppCard {...props} density="compact" style={style}>
                <CardHeader
                    title="Calibration"
                    metadata={'Updated through ' + formatDateOnlyForDisplay(evaluation.asOfDate)}
                    density="compact"
                />

                {scheduledChange && (
                    <View style={[
                        themedStyles.scheduledBanner,
                        scheduledChangeIsOnHold && themedStyles.scheduledBannerWarning
                    ]}>
                        <Ionicons
                            name={scheduledChangeIsOnHold ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                            size={20}
                            color={scheduledChangeIsOnHold ? theme.colors.warning : theme.colors.success}
                        />
                        <View style={styles.scheduledCopy}>
                            <AppText variant="label">
                                {scheduledChangeIsOnHold ? 'Saved update on hold' : 'Calorie budget update scheduled'}
                            </AppText>
                            <AppText variant="caption">
                                {scheduledChange.dailyCalorieBudgetKcal === null
                                    ? 'No updated budget starts until the calorie plan is replaced.'
                                    : scheduledChange.dailyCalorieBudgetKcal.toLocaleString() +
                                        ' kcal/day starts ' +
                                        formatDateOnlyForDisplay(scheduledChange.effectiveLocalDate) + '.'}
                            </AppText>
                        </View>
                        {scheduledChange.recommendationId !== null && (
                            <AppButton
                                title={isCancelling ? 'Undoing...' : 'Undo'}
                                accessibilityLabel="Undo scheduled calorie budget update"
                                variant="secondary"
                                disabled={isCancelling}
                                accessibilityState={{ busy: isCancelling }}
                                onPress={() => void cancelScheduledChange()}
                            />
                        )}
                    </View>
                )}
                {cancelError && (
                    <AppText accessibilityRole="alert" style={themedStyles.error}>
                        {getSafeActionErrorMessage(cancelError, 'Unable to undo this scheduled update.')}
                    </AppText>
                )}

                {weeklyReady ? (
                    <View
                        testID="calibration-signal-grid"
                        style={[styles.signalGrid, stackPanels && styles.signalGridStacked]}
                    >
                        <CalibrationSignalPanel signal={signals.recent} weightUnit={evaluation.weightUnit} />
                        <CalibrationSignalPanel
                            signal={signals.longTerm}
                            weightUnit={evaluation.weightUnit}
                            showDeficitRange
                        />
                    </View>
                ) : (
                    <ReadinessPanel
                        recent={signals.recent}
                        progressDays={signals.readiness.weeklySignals.progressDays}
                        requiredDays={signals.readiness.weeklySignals.requiredDays}
                        requirements={signals.readiness.weeklySignals.requirements}
                    />
                )}

                {weeklyReady && showTargetReadiness && (
                    <View style={themedStyles.targetReadiness}>
                        <View style={styles.readinessHeader}>
                            <View style={styles.readinessTitle}>
                                <AppText variant="label">
                                    {targetReadiness.status === 'building'
                                        ? 'Calorie-target review'
                                        : 'More confidence needed'}
                                </AppText>
                                {targetReadiness.status === 'building' && (
                                    <AppText variant="caption">
                                        {targetReadiness.progressDays} of {targetReadiness.requiredDays} days
                                    </AppText>
                                )}
                            </View>
                            {targetReadiness.status === 'building' && (
                                <ProgressBar
                                    accessible
                                    accessibilityRole="progressbar"
                                    accessibilityLabel="Calorie target review progress"
                                    accessibilityValue={{
                                        min: 0,
                                        max: targetReadiness.requiredDays,
                                        now: targetReadiness.progressDays,
                                        text: targetReadiness.progressDays + ' of ' +
                                            targetReadiness.requiredDays + ' days'
                                    }}
                                    value={Math.min(1, targetReadiness.progressDays / targetReadiness.requiredDays)}
                                    style={styles.targetProgress}
                                />
                            )}
                        </View>
                        <RequirementList requirements={targetReadiness.requirements} />
                    </View>
                )}

                {actionableRecommendation && !scheduledChange && (
                    <View style={themedStyles.adjustmentPanel} testID="calibration-recommendation-panels">
                        <View style={styles.adjustmentHeader}>
                            <View style={styles.adjustmentTitle}>
                                <View style={styles.adjustmentLabelRow}>
                                    <Ionicons name="options-outline" size={18} color={theme.colors.onSuccessContainer} />
                                    <AppText variant="label" style={themedStyles.adjustmentText}>
                                        High-confidence target adjustment
                                    </AppText>
                                </View>
                                <AppText variant="caption" style={themedStyles.adjustmentText}>
                                    Based on the latest {selectedHistoryDays}-day calibration window
                                </AppText>
                            </View>
                            <View style={styles.budgetTransition}>
                                <View>
                                    <AppText variant="caption" style={themedStyles.adjustmentText}>Current</AppText>
                                    <AppText variant="subtitle" style={themedStyles.adjustmentText}>
                                        {actionableRecommendation.currentTargetKcal.toLocaleString()} kcal
                                    </AppText>
                                </View>
                                <Ionicons name="arrow-forward" size={20} color={theme.colors.onSuccessContainer} />
                                <View>
                                    <AppText variant="caption" style={themedStyles.adjustmentText}>Proposed</AppText>
                                    <AppText variant="subtitle" style={themedStyles.adjustmentText}>
                                        {actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal
                                    </AppText>
                                </View>
                            </View>
                        </View>
                        <AppText variant="caption" style={themedStyles.adjustmentText}>
                            {Math.abs(actionableRecommendation.adjustmentStepKcal).toLocaleString()} kcal/day {actionableRecommendation.adjustmentStepKcal < 0 ? 'lower' : 'higher'}.
                            {' '}If applied, it starts {effectiveDateLabel}; your weight goal stays the same.
                        </AppText>
                        <View
                            testID="calibration-recommendation-actions"
                            style={[styles.actions, stackPanels && styles.actionsStacked]}
                        >
                            <AppButton
                                title={isApplying ? 'Applying...' : applyTitle}
                                disabled={isApplying}
                                accessibilityState={{ busy: isApplying }}
                                leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                                onPress={() => void applyRecommendation()}
                                style={styles.action}
                            />
                            <AppButton
                                title="Review adjustment"
                                accessibilityLabel="Review evidence behind this calorie target adjustment"
                                variant="secondary"
                                disabled={isApplying}
                                onPress={() => {
                                    setApplyError(null);
                                    setIsReviewOpen(true);
                                }}
                                style={styles.action}
                            />
                        </View>
                        {applyError && (
                            <AppText accessibilityRole="alert" style={themedStyles.error}>
                                {getSafeActionErrorMessage(applyError, 'Unable to apply this recommendation.')}
                            </AppText>
                        )}
                    </View>
                )}
            </AppCard>

            <BottomSheetModal
                visible={isReviewOpen}
                accessibilityLabel="Calibration target adjustment details"
                title={actionableRecommendation
                    ? 'Review ' + actionableRecommendation.recommendedTargetKcal.toLocaleString() + ' kcal target'
                    : 'Review target adjustment'}
                description={'Measured evidence from the latest ' + selectedHistoryDays + '-day calibration window.'}
                showCloseButton
                showHandle={false}
                onRequestClose={() => {
                    setApplyError(null);
                    setIsReviewOpen(false);
                }}
            >
                <View style={styles.sheetContent}>
                    {actionableRecommendation && (
                        <>
                            <View style={themedStyles.reviewMetrics}>
                                <View style={styles.reviewRow}>
                                    <AppText variant="muted">Observed weight rate</AppText>
                                    <AppText variant="label">
                                        {formatWeightRate(observedWeekly, evaluation.weightUnit)}
                                    </AppText>
                                </View>
                                <View style={themedStyles.divider} />
                                <View style={styles.reviewRow}>
                                    <AppText variant="muted">Average logged intake</AppText>
                                    <AppText variant="label">
                                        {evaluation.estimates.averageIntakeKcal
                                            ? Math.round(evaluation.estimates.averageIntakeKcal.midpoint).toLocaleString() +
                                                ' kcal/day'
                                            : 'Not available'}
                                    </AppText>
                                </View>
                                <View style={themedStyles.divider} />
                                <View style={styles.reviewRow}>
                                    <AppText variant="muted">Modeled target correction</AppText>
                                    <AppText variant="label">
                                        {formatSignedCalorieRange(evaluation.estimates.targetAdjustmentKcal)}
                                    </AppText>
                                </View>
                                <View style={themedStyles.divider} />
                                <View style={styles.reviewRow}>
                                    <AppText variant="muted">Conservative first step</AppText>
                                    <AppText variant="label">
                                        {Math.abs(actionableRecommendation.adjustmentStepKcal).toLocaleString() +
                                            ' kcal/day ' +
                                            (actionableRecommendation.adjustmentStepKcal < 0 ? 'lower' : 'higher')}
                                    </AppText>
                                </View>
                                <View style={themedStyles.divider} />
                                <View style={styles.reviewRow}>
                                    <AppText variant="muted">BMR-based safety limit</AppText>
                                    <AppText variant="label">
                                        {signals.minimumDailyCalorieTargetKcal === null
                                            ? 'Not available'
                                            : signals.minimumDailyCalorieTargetKcal.toLocaleString() +
                                                ' kcal/day minimum'}
                                    </AppText>
                                </View>
                            </View>
                            <View style={styles.safetyRow}>
                                <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.primary} />
                                <AppText variant="caption" style={styles.safetyText}>
                                    Suggestions require at least 14 days, a current weight trend, and a sufficiently
                                    narrow estimate. Every decrease is capped by the BMR-based calorie-budget limit.
                                </AppText>
                            </View>
                            <View style={themedStyles.reviewDecision}>
                                <AppText variant="label" style={themedStyles.adjustmentText}>Proposed target</AppText>
                                <View style={styles.budgetTransition}>
                                    <AppText variant="subtitle" style={themedStyles.adjustmentText}>
                                        {actionableRecommendation.currentTargetKcal.toLocaleString()} kcal
                                    </AppText>
                                    <Ionicons name="arrow-forward" size={20} color={theme.colors.onSuccessContainer} />
                                    <AppText variant="subtitle" style={themedStyles.adjustmentText}>
                                        {actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal
                                    </AppText>
                                </View>
                                <AppText variant="caption" style={themedStyles.adjustmentText}>
                                    Starts {effectiveDateLabel} only if you apply it.
                                </AppText>
                            </View>
                            {applyError && (
                                <AppText accessibilityRole="alert" style={themedStyles.error}>
                                    {getSafeActionErrorMessage(applyError, 'Unable to apply this recommendation.')}
                                </AppText>
                            )}
                            <View style={[styles.actions, stackPanels && styles.actionsStacked]}>
                                <AppButton
                                    title={isApplying ? 'Applying...' : applyTitle}
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
                                    onPress={() => {
                                        setApplyError(null);
                                        setIsReviewOpen(false);
                                    }}
                                    style={styles.action}
                                />
                            </View>
                        </>
                    )}
                </View>
            </BottomSheetModal>
        </>
    );
};

const styles = StyleSheet.create({
    signalGrid: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: spacing.md
    },
    signalGridStacked: {
        flexDirection: 'column'
    },
    readinessPanel: {
        gap: spacing.md
    },
    readinessHeader: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    readinessTitle: {
        flex: 1,
        minWidth: 220,
        gap: spacing.xs
    },
    requirementList: {
        gap: spacing.sm
    },
    requirementRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    requirementText: {
        flex: 1
    },
    availableBalance: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        borderRadius: 12,
        padding: spacing.md
    },
    availableBalanceText: {
        flex: 1,
        gap: spacing.xs
    },
    targetProgress: {
        flex: 1,
        minWidth: 180
    },
    scheduledCopy: {
        flex: 1,
        minWidth: 180,
        gap: spacing.xs
    },
    adjustmentHeader: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md
    },
    adjustmentTitle: {
        flex: 1,
        minWidth: 220,
        gap: spacing.xs
    },
    adjustmentLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    budgetTransition: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
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
    sheetContent: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: 760,
        gap: spacing.md
    },
    reviewRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    safetyRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm
    },
    safetyText: {
        flex: 1
    }
});

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        targetReadiness: {
            gap: spacing.md,
            borderRadius: theme.radius.md,
            padding: spacing.md,
            backgroundColor: theme.colors.surfaceContainerLow
        },
        scheduledBanner: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: spacing.md,
            borderRadius: theme.radius.md,
            padding: spacing.md,
            backgroundColor: theme.colors.successContainer
        },
        scheduledBannerWarning: {
            backgroundColor: theme.colors.warningContainer
        },
        adjustmentPanel: {
            gap: spacing.md,
            borderRadius: theme.radius.md,
            padding: spacing.lg,
            backgroundColor: theme.colors.successContainer
        },
        adjustmentText: {
            color: theme.colors.onSuccessContainer
        },
        reviewMetrics: {
            gap: spacing.sm,
            borderRadius: theme.radius.md,
            padding: spacing.md,
            backgroundColor: theme.colors.surfaceContainer
        },
        divider: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: theme.colors.outlineVariant
        },
        reviewDecision: {
            gap: spacing.sm,
            borderRadius: theme.radius.md,
            padding: spacing.md,
            backgroundColor: theme.colors.successContainer
        },
        error: {
            color: theme.colors.danger
        }
    });
}
