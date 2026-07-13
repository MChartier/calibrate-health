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

function getBalanceTone(remaining: number | null): 'primary' | 'warning' | 'danger' {
    if (remaining === null) return 'warning';
    if (remaining < 0) return 'danger';
    return 'warning';
}

/**
 * Native log summary modeled after the PWA calorie card.
 *
 * Empty and populated days intentionally share one structure so changing dates
 * does not shift the card height or move the Food Log below it.
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
    const progressValue = hasTarget ? Math.min(totalCalories / targetCalories, 1) : 0;
    const balanceValue = remaining === null ? '-' : formatNumber(Math.abs(remaining), 0);
    const balanceLabel = remaining === null ? 'kcal target unavailable' : isOver ? 'kcal over' : 'kcal left';
    const balanceSummary = remaining === null ? 'Target unavailable' : `${balanceValue} ${balanceLabel}`;

    return (
        <AppCard {...props} style={style}>
            <View style={styles.compactHeader}>
                <View>
                    <AppText variant="caption">{isOver ? 'Over target' : 'Remaining'}</AppText>
                    <AppText style={[styles.compactBalance, styles[`${tone}Text`]]}>{balanceSummary}</AppText>
                </View>
                <AppText variant="caption">{Math.round(progressValue * 100)}%</AppText>
            </View>
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
    primaryText: {
        color: colors.primary
    },
    warningText: {
        color: colors.warning
    },
    dangerText: {
        color: colors.danger
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
        fontSize: 15,
        fontWeight: '900'
    },
    compactHeader: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    compactBalance: {
        fontSize: 24,
        lineHeight: 30,
        fontWeight: '900'
    }
});
