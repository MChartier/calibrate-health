import React from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { CardHeader } from './CardHeader';
import { spacing, useAppTheme, type AppThemeColors } from '../theme';
import { formatNumber } from '../utils/format';

type CalorieBalanceCardProps = ViewProps & {
    totalCalories: number;
    targetCalories: number | null | undefined;
    unavailableLabel?: string;
    compact?: boolean;
};

const GAUGE_SIZE = 94;
const GAUGE_STROKE = 9;
// Today gives the actionable percentage more prominence while keeping the card compact.
const COMPACT_GAUGE_SIZE = 88;
const COMPACT_GAUGE_STROKE = 9;

function getBalanceTone(remaining: number | null): 'primary' | 'danger' {
    if (remaining === null) return 'primary';
    if (remaining < 0) return 'danger';
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
    const progressValue = hasTarget ? Math.min(totalCalories / targetCalories, 1) : null;
    const tone = getBalanceTone(remaining);
    const balanceValue = remaining === null ? '-' : formatNumber(Math.abs(remaining), 0);
    const balanceLabel = remaining === null ? unavailableLabel : isOver ? 'kcal over target' : 'kcal remaining';
    const balanceSummary = remaining === null ? balanceLabel : `${balanceValue} ${balanceLabel}`;
    const stackHero = width < 360 || fontScale >= 1.6;

    return (
        <AppCard
            {...props}
            density={compact ? 'compact' : 'comfortable'}
            accessible
            accessibilityLabel={hasTarget
                ? `Daily balance. ${balanceSummary}. ${formatNumber(totalCalories, 0)} eaten out of ${formatNumber(targetCalories, 0)} calorie target.`
                : `Daily balance. ${balanceSummary}. ${formatNumber(totalCalories, 0)} calories logged.`}
            style={style}
        >
            <View style={[styles.hero, compact && styles.heroCompact, stackHero && styles.heroStacked]}>
                {progressValue !== null && (
                    <CalorieGauge value={progressValue} tone={tone} compact={compact} colors={colors} styles={styles} />
                )}
                <View style={[styles.balanceCopy, stackHero && styles.balanceCopyStacked]}>
                    <CardHeader title="Daily balance" density="compact" />
                    {remaining === null ? (
                        <>
                            <AppText style={styles.unavailable}>{balanceLabel}</AppText>
                            <AppText variant="muted">{formatNumber(totalCalories, 0)} kcal logged</AppText>
                        </>
                    ) : (
                        <>
                            <AppText testID="calorie-balance-value" style={[
                                styles.balanceValue,
                                compact && styles.balanceValueCompact,
                                styles[`${tone}Text`]
                            ]}>{balanceValue}</AppText>
                            <AppText style={[styles.balanceLabel, isOver && styles.dangerText]}>{balanceLabel}</AppText>
                        </>
                    )}
                </View>
            </View>
        </AppCard>
    );
};

type CalorieBalanceStyles = ReturnType<typeof createStyles>;

const CalorieGauge: React.FC<{
    value: number;
    tone: 'primary' | 'danger';
    compact: boolean;
    colors: AppThemeColors;
    styles: CalorieBalanceStyles;
}> = ({ value, tone, compact, colors, styles }) => {
    const percent = Math.round(value * 100);
    const toneColor = tone === 'danger' ? colors.danger : colors.primary;
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
                    testID="calorie-gauge-progress"
                    stroke={toneColor}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${gaugeCircumference} ${gaugeCircumference}`}
                    strokeDashoffset={dashOffset}
                    transform={rotationTransform}
                />
            </Svg>
            <View style={styles.gaugeLabel}>
                <AppText style={styles.gaugePercent}>{`${percent}%`}</AppText>
                <AppText style={styles.gaugeCaption}>eaten</AppText>
            </View>
        </View>
    );
};

function createStyles(colors: AppThemeColors) {
    return StyleSheet.create({
    primaryText: {
        color: colors.primary
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
        alignItems: 'flex-start',
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
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '800'
    },
    gaugeCaption: {
        color: colors.muted,
        fontSize: 13,
        lineHeight: 18
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
        fontSize: 34,
        lineHeight: 40
    },
    balanceLabel: {
        color: colors.muted,
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '600'
    },
    unavailable: {
        color: colors.muted,
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '700'
    }
    });
}
