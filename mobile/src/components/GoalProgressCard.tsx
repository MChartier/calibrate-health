import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { GoalEntry, MetricEntry } from '@calibrate/api-client';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';
import { SectionHeader } from './SectionHeader';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';
import { computeGoalProgress, computeGoalProjection, getGoalModeFromDailyDeficit } from '../utils/goals';
import { formatSignedCalories, formatWeight, formatWeightUnit } from '../utils/format';
import type { UserClientPayload } from '@calibrate/api-client';

type GoalProgressCardProps = ViewProps & {
    title?: string;
    goal: GoalEntry | null | undefined;
    latestMetric: MetricEntry | null | undefined;
    user: UserClientPayload | null;
    targetCalories?: number | null;
    onEditGoal?: () => void;
};

function formatMetricDate(value: string | null | undefined): string {
    if (!value) return 'No weigh-in yet';
    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return datePart;
    return `Updated ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(parsed)}`;
}

function describeGoalPlan(goal: GoalEntry): string {
    const mode = getGoalModeFromDailyDeficit(goal.daily_deficit);
    const dailyChange = formatSignedCalories(-goal.daily_deficit);
    switch (mode) {
        case 'gain':
            return `Gaining weight with a ${dailyChange}/day plan.`;
        case 'maintain':
            return 'Maintaining weight with a steady calorie target.';
        default:
            return `Losing weight with a ${dailyChange}/day plan.`;
    }
}

/** Compact native snapshot that keeps current weight and goal projection together. */
export const GoalProgressCard: React.FC<GoalProgressCardProps> = ({
    title = 'Progress snapshot',
    goal,
    latestMetric,
    user,
    targetCalories,
    onEditGoal,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    if (!goal) {
        return (
            <AppCard {...props} style={[styles.card, style]}>
                <View style={styles.headingRow}>
                    <SectionHeader
                        title={title}
                        description={formatMetricDate(latestMetric?.date)}
                        style={styles.heading}
                    />
                    {onEditGoal && <GoalActionButton label="Set goal" onPress={onEditGoal} theme={theme} />}
                </View>
                <View style={styles.metricsRow}>
                    <View style={styles.metricBlock}>
                        <AppText variant="muted">Current weight</AppText>
                        <AppText variant="screenTitle" style={styles.currentWeight}>
                            {formatWeight(latestMetric?.weight, user?.weight_unit)}
                        </AppText>
                    </View>
                    <View style={styles.projectionBlock}>
                        <AppText variant="muted">Goal projection</AppText>
                        <AppText variant="screenTitle" style={styles.projectionValue}>Not configured</AppText>
                    </View>
                </View>
                <AppText variant="muted">Set a goal to add progress and projection details.</AppText>
            </AppCard>
        );
    }

    const unitLabel = formatWeightUnit(user?.weight_unit);
    const currentWeight = latestMetric?.weight ?? null;
    const progress = computeGoalProgress({
        startWeight: goal.start_weight,
        targetWeight: goal.target_weight,
        currentWeight
    });
    const projection = computeGoalProjection({
        startWeight: goal.start_weight,
        targetWeight: goal.target_weight,
        currentWeight,
        dailyDeficit: goal.daily_deficit,
        unitLabel
    });

    return (
        <AppCard {...props} style={[styles.card, style]}>
            <View style={styles.headingRow}>
                <SectionHeader
                    title={title}
                    description={formatMetricDate(latestMetric?.date)}
                    style={styles.heading}
                />
                {onEditGoal && <GoalActionButton label="Edit goal" onPress={onEditGoal} theme={theme} />}
            </View>
            <View style={styles.metricsRow}>
                <View style={styles.metricBlock}>
                    <AppText variant="muted">Current weight</AppText>
                    <AppText variant="screenTitle" style={styles.currentWeight}>
                        {formatWeight(currentWeight, user?.weight_unit)}
                    </AppText>
                </View>
                <View style={styles.projectionBlock}>
                    <AppText variant="muted">Goal projection</AppText>
                    <AppText variant="screenTitle" style={styles.projectionValue}>{projection}</AppText>
                </View>
            </View>
            <AppText variant="muted">{describeGoalPlan(goal)}</AppText>
            <ProgressBar value={(progress?.percent ?? 0) / 100} tone="primary" />
            <View style={styles.goalEndpoints}>
                <AppText variant="muted">Start {formatWeight(goal.start_weight, user?.weight_unit)}</AppText>
                {progress && (
                    <AppText variant="muted" style={styles.progressSummary}>
                        {Math.round(progress.percent)}% complete
                    </AppText>
                )}
                <AppText variant="muted">Goal {formatWeight(goal.target_weight, user?.weight_unit)}</AppText>
            </View>
            {!progress && <AppText variant="muted">Log weight on Today to calculate progress.</AppText>}
            {typeof targetCalories === 'number' && (
                <AppText variant="muted">Current target: {Math.round(targetCalories).toLocaleString()} kcal/day</AppText>
            )}
        </AppCard>
    );
};

const GoalActionButton: React.FC<{ label: string; onPress: () => void; theme: AppTheme }> = ({ label, onPress, theme }) => {
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
            <Ionicons name="flag-outline" size={16} color={theme.colors.primary} />
            <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit style={styles.actionText}>{label}</AppText>
        </Pressable>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    card: {
        gap: spacing.sm
    },
    headingRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    heading: {
        flex: 1,
        minWidth: 0
    },
    actionButton: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.md,
        borderColor: theme.colors.primary,
        borderWidth: theme.stroke.control,
        paddingHorizontal: spacing.md
    },
    actionText: {
        color: theme.colors.primary,
        fontWeight: '900',
        flexShrink: 1
    },
    pressed: {
        backgroundColor: theme.colors.surfacePressed
    },
    metricsRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: spacing.sm
    },
    metricBlock: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: theme.colors.primaryContainer,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    currentWeight: {
        color: theme.colors.onPrimaryContainer
    },
    goalEndpoints: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    projectionBlock: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: theme.colors.warningContainer,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    projectionValue: {
        color: theme.colors.onWarningContainer
    },
    progressSummary: {
        fontWeight: '700',
        textAlign: 'center'
    }
});
