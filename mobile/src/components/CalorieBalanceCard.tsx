import React from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { radius, spacing, useAppTheme, type AppThemeColors } from '../theme';
import { formatNumber } from '../utils/format';

type CalorieBalanceCardProps = ViewProps & {
    totalCalories: number;
    targetCalories: number | null | undefined;
    unavailableLabel?: string;
    compact?: boolean;
};

const GAUGE_SIZE = 94;
const GAUGE_STROKE = 9;
// Today uses a denser gauge so the whole dashboard fits above the bottom navigation.
const COMPACT_GAUGE_SIZE = 76;
const COMPACT_GAUGE_STROKE = 8;

function getBalanceTone(remaining: number | null, progress: number): 'primary' | 'warning' | 'danger' {
    if (remaining === null) return 'primary';
    if (remaining < 0) return 'danger';
    if (progress >= 0.85) return 'warning';
    return 'primary';
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
    unavailableLabel = 'Target unavailable',
    compact = false,
    style,
    ...props
}) => {
    const { colors } = useAppTheme();
    const styles = React.useMemo(() => createStyles(colors), [colors]);
    const { width, fontScale } = useWindowDimensions();
    const hasTarget = typeof targetCalories === 'number' && Number.isFinite(targetCalories) && targetCalories > 0;
    const remaining = hasTarget ? Math.round(targetCalories - totalCalories) : null;
    const isOver = remaining !== null && remaining < 0;
    const progressValue = hasTarget ? Math.min(totalCalories / targetCalories, 1) : 0;
    const tone = getBalanceTone(remaining, progressValue);
    const balanceValue = remaining === null ? '-' : formatNumber(Math.abs(remaining), 0);
    const balanceLabel = remaining === null ? unavailableLabel : isOver ? 'kcal over target' : 'kcal remaining';
    const balanceSummary = remaining === null ? balanceLabel : `${balanceValue} ${balanceLabel}`;
    const stackHero = width < 360 || fontScale >= 1.6;

    return (
        <AppCard
            {...props}
            accessible
            accessibilityLabel={hasTarget
                ? `${balanceSummary}. ${formatNumber(totalCalories, 0)} eaten out of ${formatNumber(targetCalories, 0)} calorie target.`
                : `${balanceSummary}. ${formatNumber(totalCalories, 0)} calories logged.`}
            style={[compact && styles.cardCompact, style]}
        >
            <View style={[styles.hero, compact && styles.heroCompact, stackHero && styles.heroStacked]}>
                <CalorieGauge value={progressValue} tone={tone} compact={compact} colors={colors} styles={styles} />
                <View style={[styles.balanceCopy, stackHero && styles.balanceCopyStacked]}>
                    <AppText variant="label">Daily balance</AppText>
                    {remaining === null ? (
                        <AppText style={styles.unavailable}>{balanceLabel}</AppText>
                    ) : (
                        <>
                            <AppText style={[
                                styles.balanceValue,
                                compact && styles.balanceValueCompact,
                                styles[`${tone}Text`]
                            ]}>{balanceValue}</AppText>
                            <AppText style={[styles.balanceLabel, isOver && styles.dangerText]}>{balanceLabel}</AppText>
                        </>
                    )}
                </View>
            </View>
            <View style={styles.statRow}>
                <CalorieStat label="Eaten" value={formatNumber(totalCalories, 0)} compact={compact} styles={styles} />
                <CalorieStat label="Target" value={hasTarget ? formatNumber(targetCalories, 0) : '-'} compact={compact} styles={styles} />
            </View>
        </AppCard>
    );
};

type CalorieBalanceStyles = ReturnType<typeof createStyles>;

const CalorieGauge: React.FC<{
    value: number;
    tone: 'primary' | 'warning' | 'danger';
    compact: boolean;
    colors: AppThemeColors;
    styles: CalorieBalanceStyles;
}> = ({ value, tone, compact, colors, styles }) => {
    const percent = Math.round(value * 100);
    const toneColor = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warningDark : colors.primary;
    const size = compact ? COMPACT_GAUGE_SIZE : GAUGE_SIZE;
    const stroke = compact ? COMPACT_GAUGE_STROKE : GAUGE_STROKE;
    const gaugeRadius = (size - stroke) / 2;
    const gaugeCircumference = 2 * Math.PI * gaugeRadius;
    const dashOffset = gaugeCircumference * (1 - value);
    // SVG rotation keeps the progress arc's zero point at 12 o'clock on native and web.
    const rotationTransform = `rotate(-90 ${size / 2} ${size / 2})`;

    return (
        <View accessibilityElementsHidden style={[styles.gauge, { width: size, height: size }]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={gaugeRadius}
                    fill="none"
                    stroke={colors.surfaceAlt}
                    strokeWidth={stroke}
                />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={gaugeRadius}
                    fill="none"
                    stroke={toneColor}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${gaugeCircumference} ${gaugeCircumference}`}
                    strokeDashoffset={dashOffset}
                    transform={rotationTransform}
                />
            </Svg>
            <View style={styles.gaugeLabel}>
                <AppText style={styles.gaugePercent}>{percent}%</AppText>
                <AppText variant="caption">eaten</AppText>
            </View>
        </View>
    );
};

const CalorieStat: React.FC<{
    label: string;
    value: string;
    compact: boolean;
    styles: CalorieBalanceStyles;
}> = ({ label, value, compact, styles }) => (
    <View style={[styles.stat, compact && styles.statCompact]}>
        <AppText variant="caption">{label}</AppText>
        <AppText style={styles.statValue}>{value}</AppText>
    </View>
);

function createStyles(colors: AppThemeColors) {
    return StyleSheet.create({
    cardCompact: {
        padding: spacing.md,
        gap: spacing.sm
    },
    primaryText: {
        color: colors.primary
    },
    warningText: {
        color: colors.warningDark
    },
    dangerText: {
        color: colors.danger
    },
    hero: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xl
    },
    heroCompact: {
        gap: spacing.lg
    },
    heroStacked: {
        flexDirection: 'column',
        alignItems: 'flex-start'
    },
    gauge: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    gaugeLabel: {
        position: 'absolute',
        inset: 0,
        alignItems: 'center',
        justifyContent: 'center'
    },
    gaugePercent: {
        color: colors.text,
        fontSize: 16,
        lineHeight: 20,
        fontWeight: '800'
    },
    balanceCopy: {
        flex: 1,
        minWidth: 0
    },
    balanceCopyStacked: {
        paddingTop: spacing.xs
    },
    balanceValue: {
        fontSize: 36,
        lineHeight: 42,
        fontWeight: '800'
    },
    balanceValueCompact: {
        fontSize: 30,
        lineHeight: 34
    },
    balanceLabel: {
        color: colors.muted,
        fontSize: 15,
        lineHeight: 21,
        fontWeight: '600'
    },
    unavailable: {
        color: colors.muted,
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '700'
    },
    statRow: {
        flexDirection: 'row',
        gap: spacing.md
    },
    stat: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm
    },
    statCompact: {
        paddingVertical: spacing.sm
    },
    statValue: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '800'
    }
    });
}
