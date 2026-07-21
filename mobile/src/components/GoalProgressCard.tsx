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
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    if (!goal) {
        return (
            <AppCard {...props} style={style}>
                <SectionHeader title={title} description="Latest active goal and calorie plan." />
                <AppText variant="muted">No goal configured yet.</AppText>
                {onEditGoal && (
                    <View style={styles.footerActionRow}>
                        <GoalActionButton label="Set goal" onPress={onEditGoal} theme={theme} />
                    </View>
                )}
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
            <SectionHeader title={title} description={describeGoalPlan(goal)} />
            <View style={styles.projectionBlock}>
                <AppText variant="caption">Projected goal date</AppText>
                <AppText variant="subtitle" style={styles.projectionValue}>{projection}</AppText>
            </View>
            <View style={styles.goalEndpoints}>
                <AppText variant="muted">Start {formatWeight(goal.start_weight, user?.weight_unit)}</AppText>
                <AppText variant="muted">Goal {formatWeight(goal.target_weight, user?.weight_unit)}</AppText>
            </View>
            <ProgressBar value={(progress?.percent ?? 0) / 100} tone="primary" />
            <View style={styles.goalEndpoints}>
                <AppText variant="body">Current {formatWeight(currentWeight, user?.weight_unit)}</AppText>
                <AppText variant="body">{progress ? `${Math.round(progress.percent)}%` : 'Log weight'}</AppText>
            </View>
            {typeof targetCalories === 'number' && (
                <AppText variant="caption">Current target: {Math.round(targetCalories).toLocaleString()} kcal/day</AppText>
            )}
            {onEditGoal && (
                <View style={styles.footerActionRow}>
                    <GoalActionButton label="Set a new goal" onPress={onEditGoal} theme={theme} />
                </View>
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
            <AppText numberOfLines={1} adjustsFontSizeToFit style={styles.actionText}>{label}</AppText>
        </Pressable>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    actionButton: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.md,
        borderColor: theme.colors.primary,
        borderWidth: StyleSheet.hairlineWidth,
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
    footerActionRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end'
    },
    goalEndpoints: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    projectionBlock: {
        gap: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: theme.colors.warningContainer,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    projectionValue: {
        color: theme.colors.onWarningContainer
    }
});
