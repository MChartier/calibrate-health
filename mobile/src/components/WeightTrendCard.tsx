import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import type { TrendMetricEntry } from '@calibrate/api-client';
import { AppCard } from './AppCard';
import { AppChip } from './AppChip';
import { AppText } from './AppText';
import { LoadingState } from './LoadingState';
import { SectionHeader } from './SectionHeader';
import { useAuth } from '../auth/AuthContext';
import { colors, radius, spacing, useAppTheme } from '../theme';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { formatWeight, formatWeightUnit } from '../utils/format';

type TrendRange = 'week' | 'month' | 'year' | 'all';

type WeightTrendCardProps = ViewProps & {
    title?: string;
    description?: string;
    footer?: React.ReactNode;
};

const RANGE_OPTIONS: Array<{ value: TrendRange; label: string }> = [
    { value: 'week', label: '7d' },
    { value: 'month', label: '30d' },
    { value: 'year', label: '1y' },
    { value: 'all', label: 'All' }
];

const CHART_WIDTH = 340;
const CHART_HEIGHT = 154;
const CHART_PADDING_LEFT = 18;
const CHART_PADDING_RIGHT = 18;
const CHART_PADDING_TOP = 16;
const CHART_PADDING_BOTTOM = 22;

type ChartPoint = {
    metric: TrendMetricEntry;
    x: number;
    rawY: number;
    trendY: number;
    lowerY: number;
    upperY: number;
};

type ChartPressNativeEvent = {
    locationX?: unknown;
    offsetX?: unknown;
};

function getDatePart(value: string): string {
    return value.split('T')[0] ?? value;
}

function getPointKey(point: ChartPoint): string {
    return `${point.metric.id}-${getDatePart(point.metric.date)}`;
}

function buildPath(points: Array<{ x: number; y: number }>): string {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function buildBandPoints(points: ChartPoint[]): string {
    const upper = points.map((point) => `${point.x.toFixed(2)},${point.upperY.toFixed(2)}`);
    const lower = points.slice().reverse().map((point) => `${point.x.toFixed(2)},${point.lowerY.toFixed(2)}`);
    return [...upper, ...lower].join(' ');
}

/** React Native reports locationX, while React Native Web forwards the browser click's offsetX. */
function getChartPressX(nativeEvent: ChartPressNativeEvent): number | null {
    const pressX = typeof nativeEvent.locationX === 'number'
        ? nativeEvent.locationX
        : nativeEvent.offsetX;
    return typeof pressX === 'number' && Number.isFinite(pressX) ? pressX : null;
}

function getChartPoints(metrics: TrendMetricEntry[]): ChartPoint[] {
    const chronologicalMetrics = metrics
        .slice()
        .filter((metric) => Number.isFinite(metric.weight))
        .reverse();

    if (chronologicalMetrics.length === 0) {
        return [];
    }

    const values = chronologicalMetrics.flatMap((metric) => [
        metric.weight,
        metric.trend_weight,
        metric.trend_ci_lower,
        metric.trend_ci_upper
    ]);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(maxValue - minValue, 0.1);
    const paddedMin = minValue - range * 0.08;
    const paddedMax = maxValue + range * 0.08;
    const paddedRange = paddedMax - paddedMin || 1;
    const drawableWidth = CHART_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
    const drawableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const lastIndex = Math.max(chronologicalMetrics.length - 1, 1);
    const yForValue = (value: number) => CHART_PADDING_TOP + drawableHeight - ((value - paddedMin) / paddedRange) * drawableHeight;

    return chronologicalMetrics.map((metric, index) => {
        const x = CHART_PADDING_LEFT + (drawableWidth * index) / lastIndex;
        return {
            metric,
            x,
            rawY: yForValue(metric.weight),
            trendY: yForValue(metric.trend_weight),
            lowerY: yForValue(metric.trend_ci_lower),
            upperY: yForValue(metric.trend_ci_upper)
        };
    });
}

/**
 * Native weight trend card focused on observed weight, trend, and volatility.
 */
export const WeightTrendCard: React.FC<WeightTrendCardProps> = ({
    title = 'Weight trend',
    description,
    footer,
    style,
    ...props
}) => {
    const { api, user } = useAuth();
    const { colors: themeColors } = useAppTheme();
    const [range, setRange] = useState<TrendRange>('month');
    const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
    const [chartCanvasWidth, setChartCanvasWidth] = useState(CHART_WIDTH);
    const trendQuery = useQuery({
        queryKey: ['mobile-metrics-trend', range],
        queryFn: () => api.getTrendMetrics({ range })
    });

    const chartPoints = useMemo(() => getChartPoints(trendQuery.data?.metrics ?? []), [trendQuery.data?.metrics]);
    const selectedPoint = useMemo(() => {
        if (chartPoints.length === 0) return null;
        const fallbackPoint = chartPoints[chartPoints.length - 1];
        return chartPoints.find((point) => getPointKey(point) === selectedPointKey) ?? fallbackPoint;
    }, [chartPoints, selectedPointKey]);

    useEffect(() => {
        if (chartPoints.length === 0) {
            setSelectedPointKey(null);
            return;
        }
        const currentSelectionExists = chartPoints.some((point) => getPointKey(point) === selectedPointKey);
        if (!currentSelectionExists) {
            setSelectedPointKey(getPointKey(chartPoints[chartPoints.length - 1]));
        }
    }, [chartPoints, selectedPointKey]);

    const latest = trendQuery.data?.metrics[0] ?? null;
    const trendPath = chartPoints.length > 0 ? buildPath(chartPoints.map((point) => ({ x: point.x, y: point.trendY }))) : '';
    const rawPath = chartPoints.length > 0 ? buildPath(chartPoints.map((point) => ({ x: point.x, y: point.rawY }))) : '';
    const bandPoints = chartPoints.length > 1 ? buildBandPoints(chartPoints) : '';
    const chartRange = useMemo(() => {
        if (chartPoints.length === 0) return null;
        const values = chartPoints.flatMap((point) => [
            point.metric.weight,
            point.metric.trend_weight,
            point.metric.trend_ci_lower,
            point.metric.trend_ci_upper
        ]);
        return {
            high: Math.max(...values),
            low: Math.min(...values)
        };
    }, [chartPoints]);

    function selectNearestPoint(locationX: number | null) {
        if (chartPoints.length === 0 || locationX === null) return;
        const scaledX = (locationX / Math.max(chartCanvasWidth, 1)) * CHART_WIDTH;
        const nearestPoint = chartPoints.reduce((nearest, point) => {
            return Math.abs(point.x - scaledX) < Math.abs(nearest.x - scaledX) ? point : nearest;
        }, chartPoints[0]);
        setSelectedPointKey(getPointKey(nearestPoint));
    }

    return (
        <AppCard {...props} style={style}>
            <View style={styles.headerRow}>
                <SectionHeader title={title} description={description} style={styles.headerText} />
                <AppText variant="caption" style={styles.latestLabel}>
                    {latest ? `Latest ${formatWeight(latest.weight, user?.weight_unit)}` : 'Latest -'}
                </AppText>
            </View>
            <View style={styles.rangeRow}>
                {RANGE_OPTIONS.map((option) => (
                    <AppChip
                        key={option.value}
                        label={option.label}
                        selected={option.value === range}
                        onPress={() => setRange(option.value)}
                        style={styles.rangeChip}
                    />
                ))}
            </View>
            {trendQuery.isLoading && !trendQuery.data ? (
                <LoadingState label="Loading trend..." />
            ) : chartPoints.length === 0 ? (
                <View style={styles.emptyChart}>
                    <AppText variant="muted">Log a weigh-in to start a trend.</AppText>
                </View>
            ) : chartPoints.length === 1 ? (
                <View
                    accessibilityLabel={`First weigh-in recorded at ${formatWeight(chartPoints[0].metric.weight, user?.weight_unit)}`}
                    style={[styles.singlePointState, { backgroundColor: themeColors.surfaceContainer }]}
                >
                    <View style={[styles.singlePointIcon, { backgroundColor: themeColors.primaryContainer }]}>
                        <Ionicons name="scale-outline" size={24} color={themeColors.primary} />
                    </View>
                    <View style={styles.singlePointText}>
                        <AppText variant="subtitle">First weigh-in recorded</AppText>
                        <AppText variant="body">
                            {formatWeight(chartPoints[0].metric.weight, user?.weight_unit)} on{' '}
                            {formatDateOnlyForDisplay(getDatePart(chartPoints[0].metric.date))}
                        </AppText>
                        <AppText variant="muted">Log one more weigh-in to reveal your trend.</AppText>
                    </View>
                </View>
            ) : (
                <View style={styles.chartShell}>
                    {chartRange && (
                        <View style={styles.chartRangeRow}>
                            <AppText variant="caption">{formatWeight(chartRange.high, user?.weight_unit)}</AppText>
                            <AppText variant="caption">{formatWeight(chartRange.low, user?.weight_unit)}</AppText>
                        </View>
                    )}
                    <View
                        style={styles.chartCanvas}
                        onLayout={(event) => setChartCanvasWidth(event.nativeEvent.layout.width)}
                    >
                        <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
                            <Line
                                x1={CHART_PADDING_LEFT}
                                y1={CHART_HEIGHT - CHART_PADDING_BOTTOM}
                                x2={CHART_WIDTH - CHART_PADDING_RIGHT}
                                y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
                                stroke={colors.border}
                                strokeWidth={1}
                            />
                            {bandPoints.length > 0 && <Polygon points={bandPoints} fill={colors.infoSoft} opacity={0.88} />}
                            {rawPath.length > 0 && (
                                <Path d={rawPath} stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.42} />
                            )}
                            {trendPath.length > 0 && (
                                <Path d={trendPath} stroke={colors.primary} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            )}
                            {chartPoints.map((point) => (
                                <Circle key={getPointKey(point)} cx={point.x} cy={point.rawY} r={3.5} fill={colors.surface} stroke={colors.info} strokeWidth={1.5} />
                            ))}
                            {selectedPoint && (
                                <Circle cx={selectedPoint.x} cy={selectedPoint.rawY} r={6} fill={colors.warningSoft} stroke={colors.warningDark} strokeWidth={2} />
                            )}
                        </Svg>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Show nearest weigh-in details"
                            onPress={(event) => selectNearestPoint(getChartPressX(event.nativeEvent))}
                            style={StyleSheet.absoluteFill}
                        />
                    </View>
                    {selectedPoint && <TrendPointDetails point={selectedPoint} unit={user?.weight_unit} />}
                    {trendQuery.data?.meta && (
                        <AppText variant="caption" style={styles.summary}>
                            Trend {trendQuery.data.meta.weekly_rate.toFixed(2)} {formatWeightUnit(user?.weight_unit)}/week | {trendQuery.data.meta.volatility} volatility
                        </AppText>
                    )}
                </View>
            )}
            {trendQuery.error && <AppText style={styles.error}>{trendQuery.error.message}</AppText>}
            {footer}
        </AppCard>
    );
};

const TrendPointDetails: React.FC<{ point: ChartPoint; unit: Parameters<typeof formatWeight>[1] }> = ({ point, unit }) => (
    <View style={styles.pointDetails}>
        <View style={styles.pointDetailsHeader}>
            <AppText variant="label">Selected weigh-in</AppText>
            <AppText variant="caption">{formatDateOnlyForDisplay(getDatePart(point.metric.date))}</AppText>
        </View>
        <View style={styles.pointMetricRow}>
            <PointMetric label="Measurement" value={formatWeight(point.metric.weight, unit)} tone="info" />
            <PointMetric label="Trend" value={formatWeight(point.metric.trend_weight, unit)} tone="primary" />
            <PointMetric
                label="Expected range"
                value={`${formatWeight(point.metric.trend_ci_lower, unit)} - ${formatWeight(point.metric.trend_ci_upper, unit)}`}
                tone="range"
            />
        </View>
    </View>
);

const PointMetric: React.FC<{ label: string; value: string; tone: 'info' | 'primary' | 'range' }> = ({ label, value, tone }) => (
    <View style={styles.pointMetric}>
        <View style={[styles.legendDot, styles[`${tone}Dot`]]} />
        <View style={styles.pointMetricText}>
            <AppText variant="caption">{label}</AppText>
            <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit>{value}</AppText>
        </View>
    </View>
);

const styles = StyleSheet.create({
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    headerText: {
        flex: 1
    },
    latestLabel: {
        textAlign: 'right'
    },
    rangeRow: {
        flexDirection: 'row',
        gap: spacing.sm
    },
    rangeChip: {
        flex: 1
    },
    chartShell: {
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.sm,
        gap: spacing.sm
    },
    chartRangeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    chartCanvas: {
        position: 'relative',
        minHeight: CHART_HEIGHT
    },
    emptyChart: {
        minHeight: CHART_HEIGHT,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg
    },
    singlePointState: {
        minHeight: 116,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        borderRadius: radius.md,
        padding: spacing.lg
    },
    singlePointIcon: {
        width: 52,
        height: 52,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill
    },
    singlePointText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    summary: {
        textAlign: 'center'
    },
    pointDetails: {
        borderRadius: radius.md,
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.sm,
        gap: spacing.sm
    },
    pointDetailsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    pointMetricRow: {
        gap: spacing.xs
    },
    pointMetric: {
        minHeight: 30,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    pointMetricText: {
        flex: 1,
        minWidth: 0
    },
    legendDot: {
        width: 9,
        height: 9,
        borderRadius: radius.pill
    },
    infoDot: {
        backgroundColor: colors.info
    },
    primaryDot: {
        backgroundColor: colors.primary
    },
    rangeDot: {
        backgroundColor: colors.infoSoft,
        borderColor: colors.info,
        borderWidth: StyleSheet.hairlineWidth
    },
    error: {
        color: colors.danger
    }
});
