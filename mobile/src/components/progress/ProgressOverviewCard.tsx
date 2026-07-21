import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { GoalEntry, MetricEntry, TrendMetricsResponse, UserClientPayload } from '@calibrate/api-client';
import { AppCard } from '../AppCard';
import { AppText } from '../AppText';
import { ProgressBar } from '../ProgressBar';
import { computeGoalProgress } from '../../utils/goals';
import { formatWeight, formatWeightUnit } from '../../utils/format';
import { radius, spacing, useAppTheme } from '../../theme';

type ProgressOverviewCardProps = {
    latestMetric: MetricEntry | null | undefined;
    trendMeta: TrendMetricsResponse['meta'] | null | undefined;
    goal: GoalEntry | null | undefined;
    user: UserClientPayload | null;
    hasWeightToday: boolean;
    onLogWeight: () => void;
};

function formatMetricDate(value: string | null | undefined): string {
    if (!value) return 'No weigh-in yet';
    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return datePart;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(parsed);
}

function describeWeeklyRate(rate: number | null | undefined, unit: string): string {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return 'Add more weigh-ins for a weekly trend';
    if (Math.abs(rate) < 0.005) return `Steady this week (${unit})`;
    const direction = rate > 0 ? '+' : '';
    return `${direction}${rate.toFixed(2)} ${unit} / week`;
}

export const ProgressOverviewCard: React.FC<ProgressOverviewCardProps> = ({
    latestMetric,
    trendMeta,
    goal,
    user,
    hasWeightToday,
    onLogWeight
}) => {
    const { colors } = useAppTheme();
    const unit = formatWeightUnit(user?.weight_unit);
    const progress = goal
        ? computeGoalProgress({
            startWeight: goal.start_weight,
            targetWeight: goal.target_weight,
            currentWeight: latestMetric?.weight ?? null
        })
        : null;

    return (
        <AppCard style={{ backgroundColor: colors.primaryContainer, borderColor: colors.outlineVariant }}>
            <View style={styles.headingRow}>
                <View style={styles.headingText}>
                    <AppText variant="label" style={{ color: colors.onPrimaryContainer }}>Progress snapshot</AppText>
                    <AppText variant="muted">Updated {formatMetricDate(latestMetric?.date)}</AppText>
                </View>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={hasWeightToday ? "Edit today's weight" : 'Log weight'}
                    onPress={onLogWeight}
                    style={({ pressed }) => [
                        styles.logButton,
                        { borderColor: colors.outline, backgroundColor: colors.surface },
                        pressed && { backgroundColor: colors.surfacePressed }
                    ]}
                >
                    <Ionicons name="add" size={20} color={colors.primary} />
                    <AppText variant="body" style={[styles.logButtonText, { color: colors.primary }]}>
                        {hasWeightToday ? 'Edit' : 'Log'}
                    </AppText>
                </Pressable>
            </View>

            <View style={styles.weightRow}>
                <AppText variant="metric" style={{ color: colors.onPrimaryContainer }}>
                    {formatWeight(latestMetric?.weight, user?.weight_unit)}
                </AppText>
                <View style={[styles.trendPill, { backgroundColor: colors.surface }]}>
                    <Ionicons name="analytics-outline" size={17} color={colors.primary} />
                    <AppText variant="caption" style={[styles.trendText, { color: colors.onSurface }]}>
                        {describeWeeklyRate(trendMeta?.weekly_rate, unit)}
                    </AppText>
                </View>
            </View>

            {goal ? (
                <View style={styles.goalBlock}>
                    <View style={styles.goalLabels}>
                        <AppText variant="body" style={styles.goalLabel}>Goal progress</AppText>
                        <AppText variant="body" style={styles.goalLabel}>
                            {progress ? `${Math.round(progress.percent)}%` : 'Log a weight'}
                        </AppText>
                    </View>
                    <ProgressBar value={(progress?.percent ?? 0) / 100} tone="primary" />
                    <View style={styles.goalLabels}>
                        <AppText variant="caption">Started {formatWeight(goal.start_weight, user?.weight_unit)}</AppText>
                        <AppText variant="caption">Goal {formatWeight(goal.target_weight, user?.weight_unit)}</AppText>
                    </View>
                </View>
            ) : (
                <AppText variant="muted">Set a goal below to track progress here.</AppText>
            )}
        </AppCard>
    );
};

const styles = StyleSheet.create({
    headingRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    headingText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    logButton: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: spacing.lg
    },
    logButtonText: {
        fontWeight: '700'
    },
    weightRow: {
        alignItems: 'flex-start',
        gap: spacing.sm
    },
    trendPill: {
        minHeight: 36,
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    trendText: {
        flexShrink: 1,
        fontWeight: '700'
    },
    goalBlock: {
        gap: spacing.sm
    },
    goalLabels: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    goalLabel: {
        fontWeight: '700'
    }
});
