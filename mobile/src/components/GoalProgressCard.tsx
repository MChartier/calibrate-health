import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { GoalEntry, MetricEntry, UserClientPayload } from '@calibrate/api-client';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { CompactCardHeader } from './CompactCardHeader';
import { ProgressBar } from './ProgressBar';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';
import { formatDateOnlyForDisplay } from '../utils/dates';
import {
    computeGoalProgress,
    computeGoalProjection,
    formatDailyGoalChange,
    getGoalModeFromDailyDeficit,
    getGoalReachedDate
} from '../utils/goals';
import { formatWeight, formatWeightUnit } from '../utils/format';

type GoalProgressCardProps = ViewProps & {
    title?: string;
    goal: GoalEntry | null | undefined;
    latestMetric: MetricEntry | null | undefined;
    metrics?: ReadonlyArray<MetricEntry>;
    user: UserClientPayload | null;
    targetCalories?: number | null;
    onEditGoal?: () => void;
    onSetNextGoal?: () => void;
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
    const dailyChange = `${Math.abs(goal.daily_deficit).toLocaleString()} kcal`;
    switch (mode) {
        case 'gain':
            return `Gaining weight with a ${dailyChange}/day surplus.`;
        case 'maintain':
            return 'Maintaining weight with a steady calorie target.';
        default:
            return `Losing weight with a ${dailyChange}/day deficit.`;
    }
}

/** Compact native snapshot that keeps current weight and goal projection together. */
export const GoalProgressCard: React.FC<GoalProgressCardProps> = ({
    title = 'Snapshot',
    goal,
    latestMetric,
    metrics,
    user,
    targetCalories,
    onEditGoal,
    onSetNextGoal,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    if (!goal) {
        return (
            <AppCard {...props} style={[styles.card, style]}>
                <CompactCardHeader
                    title={title}
                    metadata={formatMetricDate(latestMetric?.date)}
                    headingTestID="snapshot-heading-line"
                    action={onEditGoal && <GoalActionButton label="Set goal" onPress={onEditGoal} theme={theme} />}
                />
                <View style={styles.metricsRow}>
                    <View style={styles.metricBlock}>
                        <AppText variant="muted">Current weight</AppText>
                        <AppText variant="screenTitle" style={styles.currentWeight}>
                            {formatWeight(latestMetric?.weight, user?.weight_unit)}
                        </AppText>
                    </View>
                    <View testID="goal-projection" style={styles.projectionBlock}>
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
    const goalMode = getGoalModeFromDailyDeficit(goal.daily_deficit);
    const isMaintenance = goalMode === 'maintain';
    const reachedDate = getGoalReachedDate({
        goal,
        metrics: metrics ?? (latestMetric ? [latestMetric] : []),
        timezone: user?.timezone
    });
    const hasReachedGoal = reachedDate !== null;
    const progress = isMaintenance || hasReachedGoal
        ? null
        : computeGoalProgress({
            startWeight: goal.start_weight,
            targetWeight: goal.target_weight,
            currentWeight
        });
    const projection = isMaintenance || hasReachedGoal
        ? null
        : computeGoalProjection({
            startWeight: goal.start_weight,
            targetWeight: goal.target_weight,
            currentWeight,
            dailyDeficit: goal.daily_deficit,
            unitLabel
        });

    let goalAction: React.ReactNode = null;
    if (hasReachedGoal && onSetNextGoal) {
        goalAction = <GoalActionButton label="Set next goal" onPress={onSetNextGoal} theme={theme} />;
    } else if (onEditGoal) {
        goalAction = <GoalActionButton label="Edit goal" onPress={onEditGoal} theme={theme} />;
    }

    let goalStatus: React.ReactNode;
    if (isMaintenance) {
        goalStatus = (
            <View style={styles.statusBlock}>
                <AppText variant="muted">Goal status</AppText>
                <AppText variant="screenTitle" style={styles.statusValue}>Ongoing</AppText>
            </View>
        );
    } else if (hasReachedGoal) {
        goalStatus = (
            <View style={styles.reachedBlock}>
                <AppText variant="muted">Goal status</AppText>
                <AppText variant="screenTitle" style={styles.reachedValue}>Reached</AppText>
            </View>
        );
    } else {
        goalStatus = (
            <View testID="goal-projection" style={styles.projectionBlock}>
                <AppText variant="muted">Goal projection</AppText>
                <AppText variant="screenTitle" style={styles.projectionValue}>{projection}</AppText>
            </View>
        );
    }

    let progressDetails: React.ReactNode;
    if (isMaintenance) {
        progressDetails = (
            <AppText variant="muted">
                Maintenance is ongoing, with no completion percentage or projected end date.
            </AppText>
        );
    } else if (hasReachedGoal) {
        progressDetails = (
            <>
                <ProgressBar value={1} tone="primary" />
                <View style={styles.goalEndpoints}>
                    <AppText variant="muted">Start {formatWeight(goal.start_weight, user?.weight_unit)}</AppText>
                    <AppText variant="muted" style={styles.progressSummary}>100% reached</AppText>
                    <AppText variant="muted">Goal {formatWeight(goal.target_weight, user?.weight_unit)}</AppText>
                </View>
                <AppText variant="muted">
                    Goal reached on {formatDateOnlyForDisplay(reachedDate)}.
                </AppText>
                <View style={styles.planWarning}>
                    <Ionicons name="information-circle-outline" size={18} color={theme.colors.onWarningContainer} />
                    <AppText style={styles.planWarningText}>
                        Your {formatDailyGoalChange(goal.daily_deficit)} plan remains active until you set another goal.
                    </AppText>
                </View>
            </>
        );
    } else {
        progressDetails = (
            <>
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
            </>
        );
    }

    return (
        <AppCard {...props} style={[styles.card, style]}>
            <CompactCardHeader
                title={title}
                metadata={formatMetricDate(latestMetric?.date)}
                headingTestID="snapshot-heading-line"
                action={goalAction}
            />
            <View style={styles.metricsRow}>
                <View style={styles.metricBlock}>
                    <AppText variant="muted">Current weight</AppText>
                    <AppText variant="screenTitle" style={styles.currentWeight}>
                        {formatWeight(currentWeight, user?.weight_unit)}
                    </AppText>
                </View>
                {goalStatus}
            </View>
            <AppText variant="muted">{describeGoalPlan(goal)}</AppText>
            {progressDetails}
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
        // A projection is informational; warning colors remain reserved for actionable caution states.
        backgroundColor: theme.colors.infoContainer,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    projectionValue: {
        color: theme.colors.onInfoContainer
    },
    statusBlock: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surfaceContainer,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    statusValue: {
        color: theme.colors.onSurface
    },
    reachedBlock: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: theme.colors.successContainer,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    reachedValue: {
        color: theme.colors.onSuccessContainer
    },
    planWarning: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: theme.colors.warningContainer,
        padding: spacing.md
    },
    planWarningText: {
        flex: 1,
        color: theme.colors.onWarningContainer
    },
    progressSummary: {
        fontWeight: '700',
        textAlign: 'center'
    }
});
