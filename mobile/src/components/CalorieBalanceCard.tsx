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
};

const GAUGE_SIZE = 94;
const GAUGE_STROKE = 9;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
// SVG rotation keeps the progress arc's zero point at 12 o'clock on native and web.
const GAUGE_ROTATION_TRANSFORM = `rotate(-90 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`;

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
            style={style}
        >
            <View style={[styles.hero, stackHero && styles.heroStacked]}>
                <CalorieGauge value={progressValue} tone={tone} colors={colors} styles={styles} />
                <View style={[styles.balanceCopy, stackHero && styles.balanceCopyStacked]}>
                    <AppText variant="label">Daily balance</AppText>
                    {remaining === null ? (
                        <AppText style={styles.unavailable}>{balanceLabel}</AppText>
                    ) : (
                        <>
                            <AppText style={[styles.balanceValue, styles[`${tone}Text`]]}>{balanceValue}</AppText>
                            <AppText style={[styles.balanceLabel, isOver && styles.dangerText]}>{balanceLabel}</AppText>
                        </>
                    )}
                </View>
            </View>
            <View style={styles.statRow}>
                <CalorieStat label="Eaten" value={formatNumber(totalCalories, 0)} styles={styles} />
                <CalorieStat label="Target" value={hasTarget ? formatNumber(targetCalories, 0) : '-'} styles={styles} />
            </View>
        </AppCard>
    );
};

type CalorieBalanceStyles = ReturnType<typeof createStyles>;

const CalorieGauge: React.FC<{
    value: number;
    tone: 'primary' | 'warning' | 'danger';
    colors: AppThemeColors;
    styles: CalorieBalanceStyles;
}> = ({ value, tone, colors, styles }) => {
    const percent = Math.round(value * 100);
    const toneColor = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warningDark : colors.primary;
    const dashOffset = GAUGE_CIRCUMFERENCE * (1 - value);

    return (
        <View accessibilityElementsHidden style={styles.gauge}>
            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
                <Circle
                    cx={GAUGE_SIZE / 2}
                    cy={GAUGE_SIZE / 2}
                    r={GAUGE_RADIUS}
                    fill="none"
                    stroke={colors.surfaceAlt}
                    strokeWidth={GAUGE_STROKE}
                />
                <Circle
                    cx={GAUGE_SIZE / 2}
                    cy={GAUGE_SIZE / 2}
                    r={GAUGE_RADIUS}
                    fill="none"
                    stroke={toneColor}
                    strokeWidth={GAUGE_STROKE}
                    strokeLinecap="round"
                    strokeDasharray={`${GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
                    strokeDashoffset={dashOffset}
                    transform={GAUGE_ROTATION_TRANSFORM}
                />
            </Svg>
            <View style={styles.gaugeLabel}>
                <AppText style={styles.gaugePercent}>{percent}%</AppText>
                <AppText variant="caption">eaten</AppText>
            </View>
        </View>
    );
};

const CalorieStat: React.FC<{ label: string; value: string; styles: CalorieBalanceStyles }> = ({ label, value, styles }) => (
    <View style={styles.stat}>
        <AppText variant="caption">{label}</AppText>
        <AppText style={styles.statValue}>{value}</AppText>
    </View>
);

function createStyles(colors: AppThemeColors) {
    return StyleSheet.create({
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
    heroStacked: {
        flexDirection: 'column',
        alignItems: 'flex-start'
    },
    gauge: {
        width: GAUGE_SIZE,
        height: GAUGE_SIZE,
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
    statValue: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '800'
    }
    });
}
