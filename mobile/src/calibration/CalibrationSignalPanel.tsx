import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import type {
    CalibrationGoalPaceStatus,
    CalibrationInterval,
    CalibrationSignalWindow
} from '@calibrate/shared/calibration';
import { AppText } from '../components/AppText';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { spacing, type AppTheme, useAppTheme } from '../theme';

const POUNDS_PER_KILOGRAM = 2.2046226218;
const CHART_WIDTH = 320; // A stable viewBox keeps both signal rows aligned at every rendered width.
const CHART_HEIGHT = 58; // Fits two range rows and one shared goal marker without crowding labels.
const CHART_HORIZONTAL_PADDING = 12;

type SignalPanelProps = {
    signal: CalibrationSignalWindow;
    weightUnit: 'KG' | 'LB';
    showDeficitRange?: boolean;
};

function convertWeight(valueKg: number, unit: 'KG' | 'LB'): number {
    return unit === 'LB' ? valueKg * POUNDS_PER_KILOGRAM : valueKg;
}

function formatWeightChangeValue(valueKg: number, unit: 'KG' | 'LB'): string {
    const value = convertWeight(valueKg, unit);
    const magnitude = Math.abs(value).toFixed(2);
    const suffix = unit === 'LB' ? 'lb' : 'kg';
    if (Math.abs(value) < 0.005) return `0.00 ${suffix}`;
    return `${magnitude} ${suffix} ${value < 0 ? 'loss' : 'gain'}`;
}

function formatWeightChange(interval: CalibrationInterval | null, unit: 'KG' | 'LB'): string {
    return interval ? formatWeightChangeValue(interval.midpoint, unit) : 'Not available';
}

function formatWeightRange(interval: CalibrationInterval | null, unit: 'KG' | 'LB'): string {
    if (!interval) return 'not available';
    return formatWeightChangeValue(interval.low, unit) + ' to ' +
        formatWeightChangeValue(interval.high, unit);
}

function formatDeficitMidpoint(interval: CalibrationInterval | null): string {
    if (!interval) return 'Not available';
    const midpoint = Math.round(interval.midpoint);
    if (Math.abs(midpoint) < 25) return 'Near balance';
    return `${Math.abs(midpoint).toLocaleString()} kcal/day ${midpoint > 0 ? 'deficit' : 'surplus'}`;
}

function formatDeficitRange(interval: CalibrationInterval | null): string | null {
    if (!interval) return null;
    const low = Math.round(interval.low);
    const high = Math.round(interval.high);
    if (low <= 0 && high >= 0) {
        return `${Math.abs(low).toLocaleString()} surplus to ${high.toLocaleString()} deficit`;
    }
    const direction = interval.midpoint >= 0 ? 'deficit' : 'surplus';
    const first = Math.min(Math.abs(low), Math.abs(high)).toLocaleString();
    const second = Math.max(Math.abs(low), Math.abs(high)).toLocaleString();
    return `95% range ${first}-${second} kcal/day ${direction}`;
}

function getScopeTitle(scope: CalibrationSignalWindow['scope']): string {
    switch (scope) {
        case 'recent_7_days':
            return 'Past 7 days';
        case 'since_tracking_resumed':
            return 'Since tracking resumed';
        case 'current_tracking_period':
            return 'Current tracking period';
        default:
            return 'Since goal start';
    }
}

function getStatusPresentation(
    status: CalibrationGoalPaceStatus,
    plannedWeightChangeKg: number,
    theme: AppTheme
): {
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
    backgroundColor: string;
} {
    switch (status) {
        case 'faster':
            return {
                label: 'Faster than goal',
                icon: plannedWeightChangeKg > 0 ? 'trending-up' : 'trending-down',
                color: theme.colors.onWarningContainer,
                backgroundColor: theme.colors.warningContainer
            };
        case 'slower':
            return {
                label: 'Slower than goal',
                icon: 'speedometer-outline',
                color: theme.colors.onWarningContainer,
                backgroundColor: theme.colors.warningContainer
            };
        case 'aligned':
            return {
                label: 'Aligned with goal',
                icon: 'checkmark-circle-outline',
                color: theme.colors.onSuccessContainer,
                backgroundColor: theme.colors.successContainer
            };
        case 'above_maintenance':
            return {
                label: 'Above maintenance range',
                icon: 'trending-up',
                color: theme.colors.onWarningContainer,
                backgroundColor: theme.colors.warningContainer
            };
        case 'below_maintenance':
            return {
                label: 'Below maintenance range',
                icon: 'trending-down',
                color: theme.colors.onWarningContainer,
                backgroundColor: theme.colors.warningContainer
            };
        default:
            return {
                label: 'Confidence still building',
                icon: 'analytics-outline',
                color: theme.colors.onInfoContainer,
                backgroundColor: theme.colors.infoContainer
            };
    }
}

function getAgreementLabel(status: CalibrationSignalWindow['logsAgreementStatus']): string {
    if (status === 'consistent') return 'Observed change matches the logged calorie balance';
    if (status === 'divergent') return 'Observed change differs from the logged calorie balance';
    return 'Log-to-weight comparison needs more evidence';
}

const SignalRangeChart: React.FC<{
    signal: CalibrationSignalWindow;
    unit: 'KG' | 'LB';
}> = ({ signal, unit }) => {
    const theme = useAppTheme();
    const observed = signal.observedWeightChangeKg;
    const expected = signal.expectedWeightChangeKg;
    const domainValues = [
        0,
        signal.plannedWeightChangeKg,
        ...(observed ? [observed.low, observed.high] : []),
        ...(expected ? [expected.low, expected.high] : [])
    ];
    let minimum = Math.min(...domainValues);
    let maximum = Math.max(...domainValues);
    const span = Math.max(0.05, maximum - minimum);
    minimum -= span * 0.12;
    maximum += span * 0.12;
    const plotWidth = CHART_WIDTH - CHART_HORIZONTAL_PADDING * 2;
    const x = (value: number) => CHART_HORIZONTAL_PADDING +
        ((value - minimum) / (maximum - minimum)) * plotWidth;
    const observedLabel = formatWeightChange(observed, unit);
    const expectedLabel = formatWeightChange(expected, unit);
    const goalLabel = formatWeightChangeValue(signal.plannedWeightChangeKg, unit);
    const accessibilityLabel = [
        `${getScopeTitle(signal.scope)} comparison.`,
        `Observed ${observedLabel}, with a 95% range of ${formatWeightRange(observed, unit)}.`,
        `Expected from logs ${expectedLabel}, with a 95% range of ${formatWeightRange(expected, unit)}.`,
        `Goal ${goalLabel}.`,
        getAgreementLabel(signal.logsAgreementStatus)
    ].join(' ');

    return (
        <View
            accessible
            accessibilityLabel={accessibilityLabel}
            style={styles.chartBlock}
            testID={'calibration-range-chart-' + signal.scope}
        >
            <View style={styles.legendRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: theme.colors.primary }]} />
                    <AppText variant="caption">Observed</AppText>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: theme.colors.info }]} />
                    <AppText variant="caption">Expected from logs</AppText>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.goalLegend, { borderColor: theme.colors.outline }]} />
                    <AppText variant="caption">Goal</AppText>
                </View>
            </View>
            <Svg
                width="100%"
                height={CHART_HEIGHT}
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
            >
                <Line x1={CHART_HORIZONTAL_PADDING} x2={CHART_WIDTH - CHART_HORIZONTAL_PADDING} y1={17} y2={17} stroke={theme.colors.outlineVariant} strokeWidth={4} strokeLinecap="round" />
                <Line x1={CHART_HORIZONTAL_PADDING} x2={CHART_WIDTH - CHART_HORIZONTAL_PADDING} y1={42} y2={42} stroke={theme.colors.outlineVariant} strokeWidth={4} strokeLinecap="round" />
                <Line x1={x(signal.plannedWeightChangeKg)} x2={x(signal.plannedWeightChangeKg)} y1={5} y2={54} stroke={theme.colors.outline} strokeWidth={2} strokeDasharray="3 3" />
                {observed && (
                    <>
                        <Rect x={x(observed.low)} y={11} width={Math.max(3, x(observed.high) - x(observed.low))} height={12} rx={6} fill={theme.colors.primaryContainer} stroke={theme.colors.primary} />
                        <Circle cx={x(observed.midpoint)} cy={17} r={4} fill={theme.colors.primary} />
                    </>
                )}
                {expected && (
                    <>
                        <Rect x={x(expected.low)} y={36} width={Math.max(3, x(expected.high) - x(expected.low))} height={12} rx={6} fill={theme.colors.infoContainer} stroke={theme.colors.info} />
                        <Circle cx={x(expected.midpoint)} cy={42} r={4} fill={theme.colors.info} />
                    </>
                )}
            </Svg>
        </View>
    );
};

/** Compact, accessible comparison of one measured calibration period. */
export const CalibrationSignalPanel: React.FC<SignalPanelProps> = ({
    signal,
    weightUnit,
    showDeficitRange = false
}) => {
    const theme = useAppTheme();
    const themedStyles = React.useMemo(() => createStyles(theme), [theme]);
    const status = getStatusPresentation(
        signal.goalPaceStatus,
        signal.plannedWeightChangeKg,
        theme
    );
    const range = formatDeficitRange(signal.estimatedDailyDeficitKcal);
    const periodLabel = signal.calendarDays > 0
        ? `${formatDateOnlyForDisplay(signal.startDate)} - ${formatDateOnlyForDisplay(signal.endDate)}`
        : 'Waiting for completed history';

    return (
        <View style={themedStyles.panel} testID={`calibration-signal-${signal.scope}`}>
            <View style={styles.panelHeader}>
                <View style={styles.panelHeading}>
                    <AppText variant="subtitle">{getScopeTitle(signal.scope)}</AppText>
                    <AppText variant="caption">{periodLabel}</AppText>
                </View>
                <View style={[themedStyles.statusChip, { backgroundColor: status.backgroundColor }]}>
                    <Ionicons name={status.icon} size={16} color={status.color} />
                    <AppText variant="caption" style={{ color: status.color }}>{status.label}</AppText>
                </View>
            </View>

            {signal.observedWeightChangeKg || signal.expectedWeightChangeKg ? (
                <SignalRangeChart signal={signal} unit={weightUnit} />
            ) : (
                <View style={themedStyles.emptyChart}>
                    <Ionicons name="analytics-outline" size={20} color={theme.colors.onSurfaceVariant} />
                    <AppText variant="muted">Weight comparison unlocks after enough weigh-in history.</AppText>
                </View>
            )}

            <View style={styles.metrics}>
                <View style={styles.metric}>
                    <AppText variant="caption">Observed change</AppText>
                    <AppText variant="label">{formatWeightChange(signal.observedWeightChangeKg, weightUnit)}</AppText>
                </View>
                <View style={styles.metric}>
                    <AppText variant="caption">Expected from logs</AppText>
                    <AppText variant="label">{formatWeightChange(signal.expectedWeightChangeKg, weightUnit)}</AppText>
                </View>
                <View style={styles.metric}>
                    <AppText variant="caption">Estimated calorie balance</AppText>
                    <AppText variant="label">{formatDeficitMidpoint(signal.estimatedDailyDeficitKcal)}</AppText>
                    {showDeficitRange && range && <AppText variant="caption">{range}</AppText>}
                </View>
            </View>
            <View style={styles.agreementRow}>
                <Ionicons
                    name={signal.logsAgreementStatus === 'consistent' ? 'git-compare-outline' : 'information-circle-outline'}
                    size={16}
                    color={theme.colors.onSurfaceVariant}
                />
                <AppText variant="caption" style={styles.agreementText}>
                    {getAgreementLabel(signal.logsAgreementStatus)}
                </AppText>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    panelHeader: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.sm
    },
    panelHeading: {
        flex: 1,
        minWidth: 160,
        gap: spacing.xs
    },
    chartBlock: {
        gap: spacing.xs
    },
    legendRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs
    },
    legendSwatch: {
        width: 16,
        height: 6,
        borderRadius: 3
    },
    goalLegend: {
        width: 2,
        height: 12,
        borderLeftWidth: 2,
        borderStyle: 'dashed'
    },
    metrics: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md
    },
    metric: {
        flexGrow: 1,
        flexBasis: 140,
        gap: spacing.xs
    },
    agreementRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs
    },
    agreementText: {
        flex: 1
    }
});

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        panel: {
            flex: 1,
            minWidth: 0,
            gap: spacing.md,
            borderRadius: theme.radius.md,
            padding: spacing.lg,
            backgroundColor: theme.colors.surfaceContainer
        },
        statusChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            borderRadius: theme.radius.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs
        },
        emptyChart: {
            minHeight: CHART_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            borderRadius: theme.radius.sm,
            padding: spacing.md,
            backgroundColor: theme.colors.surfaceContainerLow
        }
    });
}
