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
import { SectionHeader } from './SectionHeader';
import { useAuth } from '../auth/AuthContext';
import {
    describeCalibrationEvidence,
    formatCalorieInterval,
    formatWeightPace
} from '../calibration/presentation';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { colors, spacing } from '../theme';

export const CALIBRATION_STATUS_QUERY_KEY = ['mobile-calibration-status'] as const;

/** On-demand calibration insight and explicit target-adjustment approval. */
export const CalibrationInsightCard: React.FC<ViewProps> = ({ style, ...props }) => {
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const statusQuery = useQuery({
        queryKey: CALIBRATION_STATUS_QUERY_KEY,
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
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: CALIBRATION_STATUS_QUERY_KEY }),
                queryClient.invalidateQueries({ queryKey: ['mobile-profile'] })
            ]);
        }
    });

    const status = statusQuery.data;
    const evaluation = status?.evaluation;
    const recommendation = evaluation?.recommendation;
    const scheduledChange = status?.scheduledChange;

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
                    description={evaluation.headline}
                />
                <AppText variant="muted">{evaluation.summary}</AppText>
                {evaluation.selectedWindowDays && (
                    <AppText variant="caption">{describeCalibrationEvidence(evaluation)}</AppText>
                )}
                {evaluation.missingCriteria.length > 0 && !status?.recommendation && (
                    <View style={styles.list}>
                        <AppText variant="label">What would improve this insight</AppText>
                        {evaluation.missingCriteria.map((criterion) => (
                            <AppText key={criterion} variant="caption">- {criterion}</AppText>
                        ))}
                    </View>
                )}
                {scheduledChange && (
                    <View style={styles.scheduledRow}>
                        <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
                        <AppText style={styles.scheduledText}>
                            Accepted adjustment {scheduledChange.targetAdjustmentKcal > 0 ? '+' : ''}{scheduledChange.targetAdjustmentKcal} kcal starts {formatDateOnlyForDisplay(scheduledChange.effectiveLocalDate)}.
                        </AppText>
                    </View>
                )}
                {status?.recommendation && recommendation && (
                    <AppButton
                        title="Review suggested target"
                        variant="secondary"
                        leftIcon={<Ionicons name="options-outline" size={18} color={colors.text} />}
                        onPress={() => setIsReviewOpen(true)}
                    />
                )}
            </AppCard>

            <BottomSheetModal visible={isReviewOpen} onRequestClose={() => setIsReviewOpen(false)}>
                <SectionHeader
                    title="Review calorie target"
                    description="This changes the calibrated target, not your configured deficit goal."
                />
                {recommendation && (
                    <>
                        <View style={styles.tileRow}>
                            <MetricTile label="current target" value={`${recommendation.currentTargetKcal.toLocaleString()} kcal`} />
                            <MetricTile label="suggested target" value={`${recommendation.recommendedTargetKcal.toLocaleString()} kcal`} tone="success" />
                        </View>
                        <View style={styles.tileRow}>
                            <MetricTile label="observed pace" value={formatWeightPace(evaluation.estimates.observedWeeklyWeightChangeKg)} />
                            <MetricTile label="estimated correction" value={formatCalorieInterval(evaluation.estimates.targetAdjustmentKcal)} />
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
                    If accepted, the adjustment takes effect on your next local day. Future evidence can support another bounded change.
                </AppText>
                {applyRecommendation.error && <AppText style={styles.error}>{applyRecommendation.error.message}</AppText>}
                <View style={styles.actions}>
                    <AppButton
                        title="Keep current target"
                        variant="secondary"
                        disabled={applyRecommendation.isPending}
                        onPress={() => setIsReviewOpen(false)}
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
