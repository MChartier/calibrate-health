import React, { useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
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
    describeCalibrationEvidence,
    formatCalorieBudgetChange,
    formatWeightPace
} from '../calibration/presentation';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';
import { colors, spacing } from '../theme';

/** On-demand calibration insight and explicit target-adjustment approval. */
export const CalibrationInsightCard: React.FC<ViewProps> = ({ style, ...props }) => {
    const { api } = useAuth();
    const queryClient = useQueryClient();
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

    return (
        <>
            <AppCard {...props} style={style}>
                <SectionHeader
                    title="Calibration"
                    description={scheduledChange ? 'Your calorie budget update is scheduled' : evaluation.headline}
                />
                {scheduledChange ? (
                    <View style={styles.scheduledRow}>
                        <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
                        <AppText style={styles.scheduledText}>
                            {scheduledChange.dailyCalorieBudgetKcal === null
                                ? `Your updated daily calorie budget starts ${formatDateOnlyForDisplay(scheduledChange.effectiveLocalDate)}.`
                                : `Your daily calorie budget will be ${scheduledChange.dailyCalorieBudgetKcal.toLocaleString()} kcal starting ${formatDateOnlyForDisplay(scheduledChange.effectiveLocalDate)}.`}
                        </AppText>
                    </View>
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
                {status?.recommendation && recommendation && (
                    <AppButton
                        title="Review suggested budget"
                        variant="secondary"
                        leftIcon={<Ionicons name="options-outline" size={18} color={colors.text} />}
                        onPress={openReview}
                    />
                )}
            </AppCard>

            <BottomSheetModal visible={isReviewOpen} onRequestClose={closeReview}>
                <SectionHeader
                    title="Review calorie budget"
                    description="Compare the current and suggested daily budgets. Your weight goal stays the same."
                />
                {recommendation && (
                    <>
                        <View style={styles.tileRow}>
                            <MetricTile label="current budget" value={`${recommendation.currentTargetKcal.toLocaleString()} kcal`} />
                            <MetricTile label="suggested budget" value={`${recommendation.recommendedTargetKcal.toLocaleString()} kcal`} tone="success" />
                        </View>
                        <View style={styles.tileRow}>
                            <MetricTile label="observed pace" value={formatWeightPace(evaluation.estimates.observedWeeklyWeightChangeKg, evaluation.weightUnit)} />
                            <MetricTile label="proposed change" value={formatCalorieBudgetChange(recommendation.adjustmentStepKcal)} />
                        </View>
                    </>
                )}
                <AppText variant="label">Evidence</AppText>
                <AppText variant="muted">{describeCalibrationEvidence(evaluation)}</AppText>
                {evaluation.missingCriteria.length > 0 && (
                    <View style={styles.list}>
                        {evaluation.missingCriteria.map((criterion) => (
                            <AppText key={criterion} variant="caption">- {criterion}</AppText>
                        ))}
                    </View>
                )}
                <AppText variant="caption">
                    If you apply this budget, it starts on your next local day. You can review future suggestions the same way.
                </AppText>
                {applyRecommendation.error && <AppText style={styles.error}>{applyRecommendation.error.message}</AppText>}
                <View style={styles.actions}>
                    <AppButton
                        title="Not now"
                        variant="secondary"
                        disabled={applyRecommendation.isPending}
                        onPress={closeReview}
                        style={styles.action}
                    />
                    <AppButton
                        title={applyRecommendation.isPending ? 'Applying...' : 'Apply tomorrow'}
                        disabled={!recommendation || applyRecommendation.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" />}
                        onPress={() => applyRecommendation.mutate()}
                        style={styles.action}
                    />
                </View>
            </BottomSheetModal>
        </>
    );
};

const styles = StyleSheet.create({
    tileRow: {
        flexDirection: 'row',
        gap: spacing.md
    },
    scheduledRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm
    },
    scheduledText: {
        flex: 1,
        color: colors.primaryDark,
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
    action: {
        flex: 1
    },
    error: {
        color: colors.danger
    }
});
