import React from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { FoodLogDayStatus } from '@calibrate/api-client';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { CardHeader } from './CardHeader';
import { spacing, useAppTheme, type AppThemeColors } from '../theme';
import { getFoodDayStatusLabel } from '../food/dayPresentation';
import { formatNumber } from '../utils/format';

type CalorieBalanceCardProps = ViewProps & {
    totalCalories: number;
    targetCalories: number | null | undefined;
    dayStatus?: FoodLogDayStatus;
    dayStatusFailed?: boolean;
    unavailableLabel?: string;
    compact?: boolean;
};

type CalorieBalanceTone = 'primary' | 'danger';

const GAUGE_SIZE = 94;
const GAUGE_STROKE = 9;
// Today keeps the gauge compact enough to leave its calorie values readable beside it.
const COMPACT_GAUGE_SIZE = 88;
const COMPACT_GAUGE_STROKE = 9;
// Allows two metric columns to wrap cleanly on narrow cards without clipping their values.
const METRIC_MIN_WIDTH = 96;

function getBalancePresentation(totalCalories: number, targetCalories: number | null | undefined) {
    const consumed = Number.isFinite(totalCalories) ? Math.max(0, totalCalories) : 0;
    const hasTarget = typeof targetCalories === 'number'
        && Number.isFinite(targetCalories)
        && targetCalories > 0;
    const target = hasTarget ? targetCalories : null;
    const remaining = target === null ? null : Math.round(target - consumed);
    const isOver = remaining !== null && remaining < 0;
    const progressValue = target === null ? null : Math.min(consumed / target, 1);
    const progressPercent = target === null ? null : Math.round((consumed / target) * 100);

    return {
        consumed,
        target,
        remaining,
        isOver,
        progressValue,
        progressPercent,
        tone: (isOver ? 'danger' : 'primary') as CalorieBalanceTone
    };
}

/**
 * Text-first daily calorie summary. The gauge supplements the three values and
 * never assigns warning or danger meaning until intake is actually over target.
 */
export const CalorieBalanceCard: React.FC<CalorieBalanceCardProps> = ({
    totalCalories,
    targetCalories,
    dayStatus,
    dayStatusFailed = false,
    unavailableLabel = 'Target unavailable',
    compact = false,
    style,
    ...props
}) => {
    const { colors } = useAppTheme();
    const styles = React.useMemo(() => createStyles(colors), [colors]);
    const { width, fontScale } = useWindowDimensions();
    const balance = getBalancePresentation(totalCalories, targetCalories);
    const statusLabel = getFoodDayStatusLabel({ status: dayStatus, failed: dayStatusFailed });
    const stackContent = width < 360 || fontScale >= 1.6;
    const consumedValue = formatNumber(balance.consumed, 0);
    const targetValue = balance.target === null ? '-' : formatNumber(balance.target, 0);
    const remainingValue = balance.remaining === null
        ? '-'
        : formatNumber(Math.abs(balance.remaining), 0);
    const balanceLabel = balance.isOver ? 'Over' : 'Remaining';
    let accessibilityLabel = `Daily balance. ${consumedValue} kcal consumed. ${unavailableLabel}. ${statusLabel}.`;
    if (balance.target !== null && balance.remaining !== null && balance.progressPercent !== null) {
        const comparisonLabel = balance.isOver ? 'over' : 'remaining';
        accessibilityLabel = `Daily balance. ${balance.progressPercent}% of target. ${consumedValue} kcal consumed. ${targetValue} kcal target. ${remainingValue} kcal ${comparisonLabel}. ${statusLabel}.`;
    }

    return (
        <AppCard
            {...props}
            accessible
            accessibilityLabel={accessibilityLabel}
            style={[compact && styles.cardCompact, style]}
        >
            <CardHeader title="Daily balance" metadata={statusLabel} density="compact" />
            <View style={[styles.hero, stackContent && styles.heroStacked]}>
                <View testID="calorie-balance-metrics" style={[styles.metrics, stackContent && styles.metricsStacked]}>
                    <BalanceMetric
                        label="Consumed"
                        value={consumedValue}
                        stacked={stackContent}
                        testID="calorie-consumed-value"
                        styles={styles}
                    />
                    <BalanceMetric
                        label="Target"
                        value={targetValue}
                        stacked={stackContent}
                        testID="calorie-target-value"
                        styles={styles}
                    />
                    <BalanceMetric
                        label={balanceLabel}
                        value={remainingValue}
                        tone={balance.tone}
                        stacked={stackContent}
                        testID="calorie-balance-value"
                        styles={styles}
                    />
                </View>
                {balance.progressValue !== null && balance.progressPercent !== null && (
                    <CalorieGauge
                        value={balance.progressValue}
                        percent={balance.progressPercent}
                        tone={balance.tone}
                        compact={compact}
                        colors={colors}
                        styles={styles}
                    />
                )}
            </View>
            {balance.target === null && (
                <AppText variant="muted">{unavailableLabel}</AppText>
            )}
        </AppCard>
    );
};

type CalorieBalanceStyles = ReturnType<typeof createStyles>;

const BalanceMetric: React.FC<{
    label: string;
    value: string;
    tone?: CalorieBalanceTone;
    stacked: boolean;
    testID: string;
    styles: CalorieBalanceStyles;
}> = ({ label, value, tone = 'primary', stacked, testID, styles }) => (
    <View testID={`${testID}-container`} style={[styles.metric, stacked && styles.metricStacked]}>
        <AppText
            testID={testID}
            variant="metric"
            style={tone === 'danger' ? styles.dangerText : styles.metricValue}
        >
            {value}
        </AppText>
        <AppText variant="caption">{label} (kcal)</AppText>
    </View>
);

const CalorieGauge: React.FC<{
    value: number;
    percent: number;
    tone: CalorieBalanceTone;
    compact: boolean;
    colors: AppThemeColors;
    styles: CalorieBalanceStyles;
}> = ({ value, percent, tone, compact, colors, styles }) => {
    const toneColor = tone === 'danger' ? colors.danger : colors.primary;
    const size = compact ? COMPACT_GAUGE_SIZE : GAUGE_SIZE;
    const gaugeStroke = compact ? COMPACT_GAUGE_STROKE : GAUGE_STROKE;
    const gaugeRadius = (size - gaugeStroke) / 2;
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
                    strokeWidth={gaugeStroke}
                />
                <Circle
                    testID="calorie-gauge-progress"
                    cx={size / 2}
                    cy={size / 2}
                    r={gaugeRadius}
                    fill="none"
                    stroke={toneColor}
                    strokeWidth={gaugeStroke}
                    strokeLinecap="round"
                    strokeDasharray={`${gaugeCircumference} ${gaugeCircumference}`}
                    strokeDashoffset={dashOffset}
                    transform={rotationTransform}
                />
            </Svg>
            <View style={styles.gaugeLabel}>
                <AppText style={styles.gaugePercent}>{`${percent}%`}</AppText>
                <AppText style={styles.gaugeCaption}>of target</AppText>
            </View>
        </View>
    );
};

function createStyles(colors: AppThemeColors) {
    return StyleSheet.create({
        cardCompact: {
            padding: spacing.md,
            gap: spacing.sm
        },
        hero: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.lg
        },
        heroStacked: {
            flexDirection: 'column',
            alignItems: 'stretch'
        },
        metrics: {
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.md
        },
        metricsStacked: {
            flexDirection: 'column',
            flexGrow: 0,
            flexBasis: 'auto'
        },
        metric: {
            flexGrow: 1,
            flexBasis: METRIC_MIN_WIDTH,
            minWidth: 0,
            gap: spacing.xs
        },
        metricStacked: {
            flexGrow: 0,
            flexShrink: 0,
            flexBasis: 'auto'
        },
        metricValue: {
            color: colors.onSurface
        },
        dangerText: {
            color: colors.danger
        },
        gauge: {
            flexShrink: 0,
            alignSelf: 'center',
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
            color: colors.onSurface,
            fontSize: 18,
            lineHeight: 22,
            fontWeight: '800'
        },
        gaugeCaption: {
            color: colors.onSurfaceVariant,
            fontSize: 12,
            lineHeight: 16
        }
    });
}
