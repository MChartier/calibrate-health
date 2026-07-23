import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import type { TrendMetricEntry } from '@calibrate/api-client';
import { AppCard } from './AppCard';
import { AppChip } from './AppChip';
import { AppText } from './AppText';
import { LoadingState } from './LoadingState';
import { SectionHeader } from './SectionHeader';
import { useAuth } from '../auth/AuthContext';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';
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

const DEFAULT_CHART_WIDTH = 340;
const MIN_CHART_WIDTH = 280;
const CHART_HEIGHT = 188;
// Axis gutters reserve room for weight and date labels without crowding the data.
const CHART_PADDING_LEFT = 58;
const CHART_PADDING_RIGHT = 12;
const CHART_PADDING_TOP = 12;
const CHART_PADDING_BOTTOM = 32;
const TARGET_Y_AXIS_INTERVALS = 3;
const MIN_WEIGHT_AXIS_SPAN = 0.4;

type ChartPoint = {
    metric: TrendMetricEntry;
    x: number;
    rawY: number;
    trendY: number;
    lowerY: number;
    upperY: number;
};

type ChartLayout = {
    width: number;
    points: ChartPoint[];
    yTicks: Array<{ value: number; y: number }>;
    xTicks: Array<{ key: string; label: string; x: number; textAnchor: 'start' | 'middle' | 'end' }>;
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

function getNiceTickStep(range: number): number {
    const roughStep = range / TARGET_Y_AXIS_INTERVALS;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalizedStep = roughStep / magnitude;

    if (normalizedStep <= 1) return magnitude;
    if (normalizedStep <= 2) return magnitude * 2;
    if (normalizedStep <= 2.5) return magnitude * 2.5;
    if (normalizedStep <= 5) return magnitude * 5;
    return magnitude * 10;
}

function roundTickValue(value: number): number {
    return Number(value.toPrecision(12));
}

function formatAxisDate(value: string, includeYear: boolean): string {
    const [yearString, monthString, dayString] = getDatePart(value).split('-');
    const date = new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
    if (Number.isNaN(date.getTime())) return getDatePart(value);
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        ...(includeYear ? { year: '2-digit' as const } : {})
    }).format(date);
}

/** React Native reports locationX, while React Native Web forwards the browser click's offsetX. */
function getChartPressX(nativeEvent: ChartPressNativeEvent): number | null {
    const pressX = typeof nativeEvent.locationX === 'number'
        ? nativeEvent.locationX
        : nativeEvent.offsetX;
    return typeof pressX === 'number' && Number.isFinite(pressX) ? pressX : null;
}

function getChartLayout(metrics: TrendMetricEntry[], canvasWidth: number): ChartLayout {
    const chronologicalMetrics = metrics
        .slice()
        .filter((metric) => Number.isFinite(metric.weight))
        .reverse();
    const width = Math.max(canvasWidth, MIN_CHART_WIDTH);

    if (chronologicalMetrics.length === 0) {
        return { width, points: [], yTicks: [], xTicks: [] };
    }

    const values = chronologicalMetrics.flatMap((metric) => [
        metric.weight,
        metric.trend_weight,
        metric.trend_ci_lower,
        metric.trend_ci_upper
    ]);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const step = getNiceTickStep(Math.max(maxValue - minValue, MIN_WEIGHT_AXIS_SPAN));
    let axisMin = Math.floor(minValue / step) * step;
    let axisMax = Math.ceil(maxValue / step) * step;
    if (Math.abs(minValue - axisMin) < Number.EPSILON * 100) axisMin -= step;
    if (Math.abs(maxValue - axisMax) < Number.EPSILON * 100) axisMax += step;
    if (axisMin === axisMax) {
        axisMin -= step;
        axisMax += step;
    }
    axisMin = roundTickValue(axisMin);
    axisMax = roundTickValue(axisMax);
    const axisRange = axisMax - axisMin;
    const drawableWidth = width - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
    const drawableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const lastIndex = Math.max(chronologicalMetrics.length - 1, 1);
    const yForValue = (value: number) => CHART_PADDING_TOP + drawableHeight - ((value - axisMin) / axisRange) * drawableHeight;

    const points = chronologicalMetrics.map((metric, index) => {
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

    const yTicks: ChartLayout['yTicks'] = [];
    for (let value = axisMin; value <= axisMax + step / 2; value += step) {
        const roundedValue = roundTickValue(value);
        yTicks.push({ value: roundedValue, y: yForValue(roundedValue) });
    }

    const firstYear = getDatePart(chronologicalMetrics[0].date).slice(0, 4);
    const lastYear = getDatePart(chronologicalMetrics[chronologicalMetrics.length - 1].date).slice(0, 4);
    const includeYear = firstYear !== lastYear;
    // `lastIndex` is clamped for point spacing, so derive tick indices from the
    // actual collection bounds to keep a single weigh-in at index zero.
    const middleIndex = Math.round((chronologicalMetrics.length - 1) / 2);
    const tickIndices = Array.from(new Set([0, middleIndex, chronologicalMetrics.length - 1]));
    const xTicks = tickIndices.map((index, tickIndex) => {
        let textAnchor: ChartLayout['xTicks'][number]['textAnchor'] = 'middle';
        if (tickIndex === 0) textAnchor = 'start';
        if (tickIndex === tickIndices.length - 1) textAnchor = 'end';
        return {
            key: `${chronologicalMetrics[index].id}-${index}`,
            label: formatAxisDate(chronologicalMetrics[index].date, includeYear),
            x: points[index].x,
            textAnchor
        };
    });

    return { width, points, yTicks, xTicks };
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
    const theme = useAppTheme();
    const { colors: themeColors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [range, setRange] = useState<TrendRange>('month');
    const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
    const [chartCanvasWidth, setChartCanvasWidth] = useState(DEFAULT_CHART_WIDTH);
    const trendQuery = useQuery({
        queryKey: ['mobile-metrics-trend', range],
        queryFn: () => api.getTrendMetrics({ range })
    });

    const chartLayout = useMemo(
        () => getChartLayout(trendQuery.data?.metrics ?? [], chartCanvasWidth),
        [chartCanvasWidth, trendQuery.data?.metrics]
    );
    const chartPoints = chartLayout.points;
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

    const trendPath = chartPoints.length > 0 ? buildPath(chartPoints.map((point) => ({ x: point.x, y: point.trendY }))) : '';
    const rawPath = chartPoints.length > 0 ? buildPath(chartPoints.map((point) => ({ x: point.x, y: point.rawY }))) : '';
    const bandPoints = chartPoints.length > 1 ? buildBandPoints(chartPoints) : '';
    function selectNearestPoint(locationX: number | null) {
        if (chartPoints.length === 0 || locationX === null) return;
        const scaledX = (locationX / Math.max(chartCanvasWidth, 1)) * chartLayout.width;
        const nearestPoint = chartPoints.reduce((nearest, point) => {
            return Math.abs(point.x - scaledX) < Math.abs(nearest.x - scaledX) ? point : nearest;
        }, chartPoints[0]);
        setSelectedPointKey(getPointKey(nearestPoint));
    }

    return (
        <AppCard {...props} style={style}>
            <SectionHeader title={title} description={description} />
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
                    <View
                        style={styles.chartCanvas}
                        onLayout={(event) => setChartCanvasWidth(event.nativeEvent.layout.width)}
                    >
                        <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${chartLayout.width} ${CHART_HEIGHT}`}>
                            {chartLayout.yTicks.map((tick) => (
                                <React.Fragment key={tick.value}>
                                    <Line
                                        x1={CHART_PADDING_LEFT}
                                        y1={tick.y}
                                        x2={chartLayout.width - CHART_PADDING_RIGHT}
                                        y2={tick.y}
                                        stroke={themeColors.outlineVariant}
                                        strokeWidth={1}
                                        strokeDasharray="3 4"
                                    />
                                    <SvgText
                                        accessibilityLabel={`${formatWeight(tick.value, user?.weight_unit)} weight axis label`}
                                        x={CHART_PADDING_LEFT - 8}
                                        y={tick.y + 4}
                                        fill={themeColors.onSurfaceVariant}
                                        fontSize={11}
                                        textAnchor="end"
                                    >
                                        {formatWeight(tick.value, user?.weight_unit)}
                                    </SvgText>
                                </React.Fragment>
                            ))}
                            <Line
                                x1={CHART_PADDING_LEFT}
                                y1={CHART_HEIGHT - CHART_PADDING_BOTTOM}
                                x2={chartLayout.width - CHART_PADDING_RIGHT}
                                y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
                                stroke={themeColors.outlineVariant}
                                strokeWidth={1}
                            />
                            {bandPoints.length > 0 && <Polygon points={bandPoints} fill={themeColors.infoContainer} opacity={0.88} />}
                            {rawPath.length > 0 && (
                                <Path d={rawPath} stroke={themeColors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.55} />
                            )}
                            {trendPath.length > 0 && (
                                <Path d={trendPath} stroke={themeColors.primary} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            )}
                            {chartPoints.map((point) => (
                                <Circle key={getPointKey(point)} cx={point.x} cy={point.rawY} r={3.5} fill={themeColors.surface} stroke={themeColors.info} strokeWidth={1.5} />
                            ))}
                            {selectedPoint && (
                                <Circle cx={selectedPoint.x} cy={selectedPoint.rawY} r={6} fill={themeColors.warningContainer} stroke={themeColors.warning} strokeWidth={2} />
                            )}
                            {chartLayout.xTicks.map((tick) => (
                                <React.Fragment key={tick.key}>
                                    <Line
                                        x1={tick.x}
                                        y1={CHART_HEIGHT - CHART_PADDING_BOTTOM}
                                        x2={tick.x}
                                        y2={CHART_HEIGHT - CHART_PADDING_BOTTOM + 4}
                                        stroke={themeColors.outlineVariant}
                                        strokeWidth={1}
                                    />
                                    <SvgText
                                        accessibilityLabel={`${tick.label} date axis label`}
                                        x={tick.x}
                                        y={CHART_HEIGHT - 6}
                                        fill={themeColors.onSurfaceVariant}
                                        fontSize={11}
                                        textAnchor={tick.textAnchor}
                                    >
                                        {tick.label}
                                    </SvgText>
                                </React.Fragment>
                            ))}
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

const TrendPointDetails: React.FC<{ point: ChartPoint; unit: Parameters<typeof formatWeight>[1] }> = ({ point, unit }) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
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
};

const PointMetric: React.FC<{ label: string; value: string; tone: 'info' | 'primary' | 'range' }> = ({ label, value, tone }) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
        <View style={styles.pointMetric}>
            <View style={[styles.legendDot, styles[`${tone}Dot`]]} />
            <View style={styles.pointMetricText}>
                <AppText variant="caption">{label}</AppText>
                <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit>{value}</AppText>
            </View>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    rangeRow: {
        flexDirection: 'row',
        gap: spacing.sm
    },
    rangeChip: {
        flex: 1
    },
    chartShell: {
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.sm,
        gap: spacing.sm
    },
    chartCanvas: {
        position: 'relative',
        minHeight: CHART_HEIGHT
    },
    emptyChart: {
        minHeight: CHART_HEIGHT,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surfaceContainer,
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
        backgroundColor: theme.colors.surfaceContainerLow,
        borderColor: theme.colors.outlineVariant,
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
        backgroundColor: theme.colors.info
    },
    primaryDot: {
        backgroundColor: theme.colors.primary
    },
    rangeDot: {
        backgroundColor: theme.colors.infoContainer,
        borderColor: theme.colors.info,
        borderWidth: StyleSheet.hairlineWidth
    },
    error: {
        color: theme.colors.danger
    }
});
