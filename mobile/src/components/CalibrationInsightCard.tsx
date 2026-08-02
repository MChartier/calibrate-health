import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';
import { MetricTile } from './MetricTile';
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
import { formatDateOnlyForDisplay } from '../utils/dates';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';
import { spacing, type AppTheme, useAppTheme } from '../theme';

const RECOMMENDATION_STACK_BREAKPOINT = 560; // Keeps paired panels and action labels legible on compact screens.

/** On-demand calibration insight and explicit target-adjustment approval. */
export const CalibrationInsightCard: React.FC<ViewProps> = ({ style, ...props }) => {
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { width, fontScale } = useWindowDimensions();
    const stackRecommendation = width < RECOMMENDATION_STACK_BREAKPOINT || fontScale >= 1.4;
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const statusQuery = useQuery({
        queryKey: calibrationStatusQueryKey,
        queryFn: () => api.getCalibrationStatus()
    });
    const applyRecommendation = useMutation({
        mutationFn: () => {
            const recommendationId = statusQuery.data?.recommendation?.id;
            if (!recommendationId) throw new Error('This recommendation is no longer available.');
            return api.applyCalibrationRecommendation(recommendationId, Crypto.randomUUID());
        },
        onSuccess: async () => {
            setIsReviewOpen(false);
            await Promise.all([
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
                queryClient.invalidateQueries({ queryKey: calibrationStatusQueryKey }),
                queryClient.invalidateQueries({ queryKey: ['mobile-profile'] })
            ]);
        }
    });

    const status = statusQuery.data;
    const evaluation = status?.evaluation;
    const recommendation = evaluation?.recommendation;
    const scheduledChange = status?.scheduledChange;
    const closeReview = () => {
        applyRecommendation.reset();
        setIsReviewOpen(false);
    };
    const openReview = () => {
        applyRecommendation.reset();
        setIsReviewOpen(true);
    };

    if (statusQuery.error) {
        return (
            <AppCard {...props} style={style}>
                <SectionHeader title="Calibration" description="Unable to evaluate your latest history." />
                <AppText style={styles.error}>{statusQuery.error.message}</AppText>
                <AppButton title="Try again" variant="secondary" onPress={() => void statusQuery.refetch()} />
            </AppCard>
        );
    }

    if (statusQuery.isLoading || !evaluation) {
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
    const conciseHeadline = evaluation.headline.replace(' is trending ', ' is ');
    const headlineFinding = `${conciseHeadline.charAt(0).toLowerCase()}${conciseHeadline.slice(1)}`;
    const averageIntake = evaluation.estimates.averageIntakeKcal
        ? `${Math.round(evaluation.estimates.averageIntakeKcal.midpoint).toLocaleString()} kcal`
        : 'Not enough evidence';
    const recommendationReason = actionableRecommendation
        ? `Your recent ${selectedHistoryDays}-day trend shows ${headlineFinding}. Taken together with your food logs, this suggests the current daily budget estimate may be ${actionableRecommendation.adjustmentStepKcal < 0 ? 'too high' : 'lower than needed'} for your planned pace.`
        : null;
    const budgetEstimateExplanation = actionableRecommendation
        ? describeCalorieBudgetEstimate(
            evaluation.estimates.targetAdjustmentKcal,
            actionableRecommendation.currentTargetAdjustmentKcal,
            actionableRecommendation.adjustmentStepKcal
        )
        : null;
    const applyButtonTitle = actionableRecommendation
        ? `Apply ${actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal tomorrow`
        : 'Apply tomorrow';

    return (
        <>
            <AppCard {...props} style={style}>
                {actionableRecommendation ? (
                    <SectionHeader eyebrow="CALIBRATION SUGGESTION" title={evaluation.headline} />
                ) : (
                    <SectionHeader
                        title="Calibration"
                        description={scheduledChange ? 'Your calorie budget update is scheduled' : evaluation.headline}
                    />
                )}
                {scheduledChange ? (
                    <View style={styles.scheduledRow}>
                        <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                        <AppText style={styles.scheduledText}>
                            {scheduledChange.dailyCalorieBudgetKcal === null
                                ? `Your updated daily calorie budget starts ${formatDateOnlyForDisplay(scheduledChange.effectiveLocalDate)}.`
                                : `Your daily calorie budget will be ${scheduledChange.dailyCalorieBudgetKcal.toLocaleString()} kcal starting ${formatDateOnlyForDisplay(scheduledChange.effectiveLocalDate)}.`}
                        </AppText>
                    </View>
                ) : actionableRecommendation ? (
                    <>
                        <View style={[
                            styles.recommendationPanels,
                            stackRecommendation && styles.recommendationPanelsStacked
                        ]}>
                            <View style={styles.pacePanel}>
                                <AppText variant="metric">{observedPace}</AppText>
                                <AppText variant="label">your recent pace</AppText>
                                <AppText variant="caption">
                                    Plan: {plannedPace}{plannedDirection === 'stable' ? '' : ` ${plannedDirection}`}
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
                            <AppText variant="muted">Starts tomorrow. Your weight goal stays the same.</AppText>
                        </View>
                        <View style={[styles.actions, stackRecommendation && styles.actionsStacked]}>
                            <AppButton
                                title={applyRecommendation.isPending ? 'Applying...' : applyButtonTitle}
                                disabled={applyRecommendation.isPending}
                                leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                                onPress={() => applyRecommendation.mutate()}
                                style={styles.action}
                            />
                            <AppButton
                                title="See why"
                                accessibilityLabel="See evidence behind this budget suggestion"
                                variant="secondary"
                                disabled={applyRecommendation.isPending}
                                leftIcon={<Ionicons name="information-circle-outline" size={18} color={theme.colors.onSurface} />}
                                onPress={openReview}
                                style={styles.action}
                            />
                        </View>
                        {applyRecommendation.error && <AppText style={styles.error}>{applyRecommendation.error.message}</AppText>}
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

            <BottomSheetModal visible={isReviewOpen} onRequestClose={closeReview}>
                <View style={styles.sheetContent}>
                {actionableRecommendation && (
                    <>
                        <SectionHeader
                            title={`Why we suggest ${actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal`}
                            description="Here is how your recent logs and weight trend informed this suggestion."
                        />
                        <AppText variant="label">What we observed</AppText>
                        <View style={[
                            styles.observationGrid,
                            stackRecommendation && styles.observationGridStacked
                        ]}>
                            <MetricTile label="average logged per day" value={averageIntake} />
                            <MetricTile
                                label={observedDirection === null ? 'recent pace' : `recent ${observedDirection}`}
                                value={observedPace}
                            />
                            <MetricTile
                                label={plannedDirection === 'stable' ? 'planned pace' : `planned ${plannedDirection}`}
                                value={plannedPace}
                            />
                        </View>
                        <View style={styles.explanationSection}>
                            <AppText variant="label">How Calibrate reached this suggestion</AppText>
                            <AppText variant="muted">{recommendationReason}</AppText>
                        </View>
                        {budgetEstimateExplanation && (
                            <View style={styles.explanationSection}>
                                <AppText variant="label">
                                    Why a {Math.abs(actionableRecommendation.adjustmentStepKcal).toLocaleString()} kcal first step?
                                </AppText>
                                <AppText variant="muted">{budgetEstimateExplanation}</AppText>
                            </View>
                        )}
                        <View style={styles.explanationSection}>
                            <AppText variant="label">Evidence quality</AppText>
                            <AppText variant="muted">{describeCalibrationEvidenceForReview(evaluation)}</AppText>
                        </View>
                        <View style={styles.decisionSummary}>
                            <AppText variant="label">Tomorrow's budget</AppText>
                            <AppText variant="subtitle" style={styles.budgetPanelText}>
                                {actionableRecommendation.recommendedTargetKcal.toLocaleString()} kcal
                            </AppText>
                            <AppText variant="caption" style={styles.budgetPanelText}>Your weight goal stays the same.</AppText>
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
                {applyRecommendation.error && <AppText style={styles.error}>{applyRecommendation.error.message}</AppText>}
                <View style={[styles.actions, stackRecommendation && styles.actionsStacked]}>
                    <AppButton
                        title={applyRecommendation.isPending ? 'Applying...' : applyButtonTitle}
                        disabled={applyRecommendation.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                        onPress={() => applyRecommendation.mutate()}
                        style={styles.action}
                    />
                    <AppButton
                        title="Not now"
                        variant="secondary"
                        disabled={applyRecommendation.isPending}
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
    observationGrid: {
        flexDirection: 'row',
        gap: spacing.md
    },
    observationGridStacked: {
        flexDirection: 'column'
    },
    explanationSection: {
        gap: spacing.xs
    },
    decisionSummary: {
        gap: spacing.xs,
        borderRadius: theme.radius.md,
        padding: spacing.md,
        backgroundColor: theme.colors.successContainer
    },
    scheduledRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm
    },
    scheduledText: {
        flex: 1,
        color: theme.colors.primary,
        fontWeight: '700'
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
