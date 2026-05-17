import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';
import { colors, radius, spacing } from '../theme';
import { formatNumber } from '../utils/format';

type CalorieBalanceCardProps = ViewProps & {
    totalCalories: number;
    targetCalories: number | null | undefined;
};

const LOW_REMAINING_CALORIE_THRESHOLD = 125; // Warn near the target where the remaining number is most actionable.

function getBalanceTone(remaining: number | null): 'primary' | 'warning' | 'danger' {
    if (remaining === null) return 'primary';
    if (remaining < 0) return 'danger';
    if (remaining <= LOW_REMAINING_CALORIE_THRESHOLD) return 'warning';
    return 'primary';
}

/**
 * Native log summary modeled after the PWA calorie card.
 *
 * Empty days keep the large motivating balance; once food is logged, the card
 * becomes more scannable by surfacing eaten, remaining, and target together.
 */
export const CalorieBalanceCard: React.FC<CalorieBalanceCardProps> = ({
    totalCalories,
    targetCalories,
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
    const hasLoggedFood = totalCalories > 0;

    return (
        <AppCard {...props} style={style}>
            <View style={[styles.balanceLine, hasLoggedFood && styles.balanceLineCompact]}>
                <AppText style={[styles.balanceNumber, hasLoggedFood && styles.balanceNumberLogged, styles[`${tone}Text`]]}>{balanceValue}</AppText>
                <AppText style={[styles.balanceUnit, hasLoggedFood && styles.balanceUnitLogged]}>kcal</AppText>
                <AppText style={[styles.balanceLabel, hasLoggedFood && styles.balanceUnitLogged]}>{balanceLabel.replace('kcal ', '')}</AppText>
            </View>
            <View style={styles.progressGroup}>
                <ProgressBar
                    accessibilityLabel={`${formatNumber(totalCalories, 0)} kcal eaten out of ${formatNumber(targetCalories, 0)} kcal target`}
                    value={progressValue}
                    tone={tone}
                    style={styles.progress}
                />
                <View style={styles.statRow}>
                    <CalorieStat label="Eaten" value={formatNumber(totalCalories, 0)} />
                    <CalorieStat label={isOver ? 'Over' : 'Left'} value={remaining === null ? '-' : formatNumber(Math.abs(remaining), 0)} tone={tone} />
                    <CalorieStat label="Target" value={hasTarget ? formatNumber(targetCalories, 0) : '-'} />
                </View>
            </View>
        </AppCard>
    );
};

const CalorieStat: React.FC<{ label: string; value: string; tone?: 'primary' | 'warning' | 'danger' }> = ({
    label,
    value,
    tone
}) => (
    <View style={styles.stat}>
        <AppText variant="caption">{label}</AppText>
        <AppText style={[styles.statValue, tone && styles[`${tone}Text`]]}>{value}</AppText>
    </View>
);

const styles = StyleSheet.create({
    balanceLine: {
        flexDirection: 'row',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    balanceNumber: {
        fontSize: 48,
        lineHeight: 56,
        fontWeight: '900',
        letterSpacing: 0
    },
    balanceNumberLogged: {
        fontSize: 38,
        lineHeight: 44
    },
    balanceUnit: {
        color: colors.warning,
        fontSize: 22,
        fontWeight: '900'
    },
    balanceUnitLogged: {
        fontSize: 18
    },
    balanceLabel: {
        color: colors.muted,
        fontSize: 22,
        fontWeight: '900'
    },
    balanceLineCompact: {
        marginBottom: -spacing.xs
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
    statRow: {
        flexDirection: 'row',
        gap: spacing.sm
    },
    stat: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xs
    },
    statValue: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '900'
    }
});
