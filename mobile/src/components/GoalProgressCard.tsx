import React from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GoalEntry, MetricEntry } from '@calibrate/api-client';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';
import { SectionHeader } from './SectionHeader';
import { colors, radius, spacing } from '../theme';
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

/**
 * Native goal tracker with progress and projection parity with the PWA card.
 */
export const GoalProgressCard: React.FC<GoalProgressCardProps> = ({
    title = 'Current goal',
    goal,
    latestMetric,
    user,
    targetCalories,
    onEditGoal,
    style,
    ...props
}) => {
    if (!goal) {
        return (
            <AppCard {...props} style={style}>
                <View style={styles.headerRow}>
                    <SectionHeader title={title} description="Latest active goal and calorie plan." style={styles.headerText} />
                    {onEditGoal && <GoalActionButton label="Set goal" onPress={onEditGoal} />}
                </View>
                <AppText variant="muted">No goal configured yet.</AppText>
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
        <AppCard {...props} style={style}>
            <View style={styles.headerRow}>
                <SectionHeader title={title} description={describeGoalPlan(goal)} style={styles.headerText} />
                {onEditGoal && <GoalActionButton label="Set a new goal" onPress={onEditGoal} />}
            </View>
            <View style={styles.goalEndpoints}>
                <AppText variant="muted">Start {formatWeight(goal.start_weight, user?.weight_unit)}</AppText>
                <AppText variant="muted">Goal {formatWeight(goal.target_weight, user?.weight_unit)}</AppText>
            </View>
            <ProgressBar value={(progress?.percent ?? 0) / 100} tone={progress?.isComplete ? 'primary' : 'warning'} />
            <View style={styles.goalEndpoints}>
                <AppText variant="body">Current {formatWeight(currentWeight, user?.weight_unit)}</AppText>
                <AppText variant="body">{progress ? `${Math.round(progress.percent)}%` : 'Log weight'}</AppText>
            </View>
            <View style={styles.projectionBlock}>
                <AppText variant="caption">Projected goal date</AppText>
                <AppText variant="subtitle">{projection}</AppText>
            </View>
            {typeof targetCalories === 'number' && (
                <AppText variant="caption">Current target: {Math.round(targetCalories).toLocaleString()} kcal/day</AppText>
            )}
        </AppCard>
    );
};

const GoalActionButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
    <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
    >
        <Ionicons name="flag-outline" size={16} color={colors.primaryDark} />
        <AppText numberOfLines={1} adjustsFontSizeToFit style={styles.actionText}>{label}</AppText>
    </Pressable>
);

const styles = StyleSheet.create({
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    headerText: {
        flex: 1,
        minWidth: 0
    },
    actionButton: {
        minHeight: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.md,
        borderColor: colors.primary,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: spacing.md
    },
    actionText: {
        color: colors.primaryDark,
        fontWeight: '900',
        flexShrink: 1
    },
    pressed: {
        backgroundColor: colors.surfacePressed
    },
    goalEndpoints: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    projectionBlock: {
        gap: spacing.xs
    }
});
