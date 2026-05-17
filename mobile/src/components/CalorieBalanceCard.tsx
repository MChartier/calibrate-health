import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';
import { colors, spacing } from '../theme';
import { formatNumber } from '../utils/format';

type CalorieBalanceCardProps = ViewProps & {
    totalCalories: number;
    targetCalories: number | null | undefined;
    disabled?: boolean;
    onAddFood: () => void;
};

const LOW_REMAINING_CALORIE_THRESHOLD = 125; // Warn near the target where the remaining number is most actionable.

function getBalanceTone(remaining: number | null): 'primary' | 'warning' | 'danger' {
    if (remaining === null) return 'primary';
    if (remaining < 0) return 'danger';
    if (remaining <= LOW_REMAINING_CALORIE_THRESHOLD) return 'warning';
    return 'primary';
}

/**
 * Native log summary modeled after the PWA calorie card: one large balance, one labeled bar, one logged/target line.
 */
export const CalorieBalanceCard: React.FC<CalorieBalanceCardProps> = ({
    totalCalories,
    targetCalories,
    disabled,
    onAddFood,
    style,
    ...props
}) => {
    const hasTarget = typeof targetCalories === 'number' && Number.isFinite(targetCalories) && targetCalories > 0;
    const remaining = hasTarget ? Math.round(targetCalories - totalCalories) : null;
    const isOver = remaining !== null && remaining < 0;
    const tone = getBalanceTone(remaining);
    const gaugeMax = hasTarget ? Math.max(targetCalories, totalCalories, 1) : Math.max(totalCalories, 1);
    const progressValue = hasTarget ? Math.min(totalCalories, targetCalories) / gaugeMax : 0;
    const balanceValue = remaining === null ? '-' : formatNumber(Math.abs(remaining), 0);
    const balanceLabel = remaining === null ? 'kcal target unavailable' : isOver ? 'kcal over' : 'kcal left';

    return (
        <AppCard {...props} style={style}>
            <View style={styles.balanceLine}>
                <AppText style={[styles.balanceNumber, styles[`${tone}Text`]]}>{balanceValue}</AppText>
                <AppText style={styles.balanceUnit}>kcal</AppText>
                <AppText style={styles.balanceLabel}>{balanceLabel.replace('kcal ', '')}</AppText>
            </View>
            <View style={styles.progressGroup}>
                <ProgressBar
                    accessibilityLabel={`${formatNumber(totalCalories, 0)} kcal eaten out of ${formatNumber(targetCalories, 0)} kcal target`}
                    value={progressValue}
                    tone={tone}
                    style={styles.progress}
                />
                <AppText variant="label" style={styles.loggedLine}>
                    {formatNumber(totalCalories, 0)} eaten | {hasTarget ? formatNumber(targetCalories, 0) : '-'} target
                </AppText>
            </View>
            <AppButton
                title="Add food"
                disabled={disabled}
                leftIcon={<Ionicons name="add" size={18} color="#ffffff" />}
                onPress={onAddFood}
            />
        </AppCard>
    );
};

const styles = StyleSheet.create({
    balanceLine: {
        flexDirection: 'row',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    balanceNumber: {
        fontSize: 56,
        lineHeight: 64,
        fontWeight: '900',
        letterSpacing: 0
    },
    balanceUnit: {
        color: colors.warning,
        fontSize: 24,
        fontWeight: '900'
    },
    balanceLabel: {
        color: colors.muted,
        fontSize: 24,
        fontWeight: '900'
    },
    primaryText: {
        color: colors.primary
    },
    warningText: {
        color: colors.warning
    },
    dangerText: {
        color: colors.danger
    },
    progressGroup: {
        gap: spacing.md
    },
    progress: {
        height: 10
    },
    loggedLine: {
        textAlign: 'center'
    }
});
