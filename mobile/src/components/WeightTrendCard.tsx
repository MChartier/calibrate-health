import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { AppCard } from './AppCard';
import { AppChip } from './AppChip';
import { AppText } from './AppText';
import { LoadingState } from './LoadingState';
import { SectionHeader } from './SectionHeader';
import { useAuth } from '../auth/AuthContext';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { formatWeight } from '../utils/format';
import {
    buildWeightTrendBandPoints,
    buildWeightTrendChartGeometry,
    buildWeightTrendLinePath,
    type WeightTrendChartPoint
} from '../weightTrend/geometry';
import {
    describeVisibleWeightTrend,
    formatEstimatedTrendRange,
    getLatestWeightTrendSnapshot,
} from '../weightTrend/presentation';

type TrendRange = 'week' | 'month' | 'year' | 'all';

type WeightTrendCardProps = ViewProps & {
    title?: string | null;
    description?: string;
    footer?: React.ReactNode;
};

const RANGE_OPTIONS: Array<{ value: TrendRange; label: string }> = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
    { value: 'all', label: 'All' }
];

const DEFAULT_CHART_WIDTH = 340;
const MIN_CHART_WIDTH = 280;
const CHART_HEIGHT = 188;
// Axis gutters reserve room for weight and date labels without crowding the data.
const CHART_PADDING = { left: 58, right: 12, top: 12, bottom: 32 };
const MIN_WEIGHT_AXIS_SPAN = 0.4;

type ChartPressNativeEvent = {
    locationX?: unknown;
    offsetX?: unknown;
};

function getPointKey(point: WeightTrendChartPoint): string {
    return `${point.metric.id}-${point.dateKey}`;
}

function formatAxisDate(value: string, includeYear: boolean): string {
    const [yearString, monthString, dayString] = value.split('-');
    const date = new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
    if (Number.isNaN(date.getTime())) return value;
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

export const WeightTrendCard: React.FC<WeightTrendCardProps> = ({
    title = 'Weight trend',
    description,
    footer,
    style,
    ...props
}) => {
    const { api, user } = useAuth();
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [range, setRange] = useState<TrendRange>('month');
    const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
    const [chartCanvasWidth, setChartCanvasWidth] = useState(DEFAULT_CHART_WIDTH);
    const [chartHeight, setChartHeight] = useState(CHART_HEIGHT);
    const trendQuery = useQuery({
        queryKey: ['mobile-metrics-trend', range],
        queryFn: () => api.getTrendMetrics({ range })
    });
    const metrics = trendQuery.data?.metrics ?? [];
    const trendSummary = trendQuery.data?.meta.trend_summary;
    const chartLayout = useMemo(
        () => buildWeightTrendChartGeometry(metrics, {
            width: chartCanvasWidth,
            height: chartHeight,
            minWidth: MIN_CHART_WIDTH,
            minHeight: CHART_HEIGHT,
            minWeightSpan: MIN_WEIGHT_AXIS_SPAN,
            padding: CHART_PADDING,
            xTickCount: 3,
            yAxisMode: 'nice',
            downsampleMeasurements: range === 'all',
            modelStartDate: trendSummary?.modeled_start_date
        }),
        [chartCanvasWidth, chartHeight, metrics, range, trendSummary?.modeled_start_date]
    );
    const chartPoints = chartLayout.points;
    const selectedPointIndex = useMemo(() => {
        if (chartPoints.length === 0) return -1;
        if (selectedPointKey === null) return chartPoints.length - 1;
        const matchingIndex = chartPoints.findIndex((point) => getPointKey(point) === selectedPointKey);
        return matchingIndex >= 0 ? matchingIndex : chartPoints.length - 1;
    }, [chartPoints, selectedPointKey]);
    const selectedPoint = selectedPointIndex >= 0 ? chartPoints[selectedPointIndex] : null;

    const hasWeightHistory = (trendQuery.data?.meta.total_points ?? 0) > 0;
    const latestSnapshot = getLatestWeightTrendSnapshot(metrics, trendSummary);
    const visibleTrendSummary = describeVisibleWeightTrend(metrics, user?.weight_unit);
    const showModelBoundary = (range === 'year' || range === 'all') && chartLayout.modelBoundaryPoint !== null;
    const firstYear = chartLayout.xTicks[0]?.dateKey.slice(0, 4);
    const lastYear = chartLayout.xTicks[chartLayout.xTicks.length - 1]?.dateKey.slice(0, 4);
    const includeYear = firstYear !== lastYear;
    const accessibleChartSummary = latestSnapshot
        ? `Weight chart from ${formatDateOnlyForDisplay(chartPoints[0]?.dateKey ?? '')} to ${formatDateOnlyForDisplay(chartPoints[chartPoints.length - 1]?.dateKey ?? '')}, with ${chartPoints.length} measurements. Latest smoothed weight ${formatWeight(latestSnapshot.weight, user?.weight_unit)}. 95% estimated trend range ${formatEstimatedTrendRange(latestSnapshot, user?.weight_unit)}.`
        : `Weight chart with ${chartPoints.length} measurements. Smoothed estimates are not available for this selected history.`;

    function selectNearestPoint(locationX: number | null) {
        if (chartPoints.length === 0 || locationX === null) return;
        const scaledX = (locationX / Math.max(chartCanvasWidth, 1)) * chartLayout.width;
        const nearestPoint = chartPoints.reduce((nearest, point) => (
            Math.abs(point.x - scaledX) < Math.abs(nearest.x - scaledX) ? point : nearest
        ), chartPoints[0]);
        setSelectedPointKey(getPointKey(nearestPoint));
    }

    function selectPointAtIndex(index: number) {
        const point = chartPoints[index];
        if (point) setSelectedPointKey(getPointKey(point));
    }

    return (
        <AppCard {...props} style={[styles.card, style]}>
            {(title || description) && <SectionHeader title={title ?? ''} description={description} />}
            <View style={styles.rangeRow}>
                {RANGE_OPTIONS.map((option) => (
                    <AppChip
                        key={option.value}
                        label={option.label}
                        selected={option.value === range}
                        onPress={() => {
                            setRange(option.value);
                            setSelectedPointKey(null);
                        }}
                        style={styles.rangeChip}
                    />
                ))}
            </View>
            {trendQuery.isLoading && !trendQuery.data ? (
                <LoadingState label="Loading trend..." />
            ) : chartPoints.length === 0 ? (
                <View style={styles.emptyChart}>
                    <AppText variant="muted">
                        {hasWeightHistory
                            ? 'No weigh-ins in this range. Choose All to view your weight history.'
                            : 'Log a weigh-in to start a trend.'}
                    </AppText>
                </View>
            ) : chartPoints.length === 1 ? (
                <View
                    accessibilityLabel={`First weigh-in recorded at ${formatWeight(chartPoints[0].metric.weight, user?.weight_unit)}`}
                    style={styles.singlePointState}
                >
                    <View style={styles.singlePointIcon}>
                        <Ionicons name="scale-outline" size={24} color={theme.colors.primary} />
                    </View>
                    <View style={styles.singlePointText}>
                        <AppText variant="subtitle">First weigh-in recorded</AppText>
                        <AppText variant="body">
                            {formatWeight(chartPoints[0].metric.weight, user?.weight_unit)} on{' '}
                            {formatDateOnlyForDisplay(chartPoints[0].dateKey)}
                        </AppText>
                        <AppText variant="muted">Log one more weigh-in to reveal your trend.</AppText>
                    </View>
                </View>
            ) : (
                <View style={styles.chartShell}>
                    <View
                        testID="weight-trend-chart-canvas"
                        style={styles.chartCanvas}
                        onLayout={(event) => {
                            setChartCanvasWidth(event.nativeEvent.layout.width);
                            setChartHeight(Math.max(event.nativeEvent.layout.height, CHART_HEIGHT));
                        }}
                    >
                        <Svg
                            testID="weight-trend-chart"
                            accessibilityLabel={accessibleChartSummary}
                            width="100%"
                            height={chartHeight}
                            viewBox={`0 0 ${chartLayout.width} ${chartHeight}`}
                        >
                            {chartLayout.yTicks.map((tick) => (
                                <React.Fragment key={tick.value}>
                                    <Line
                                        x1={CHART_PADDING.left}
                                        y1={tick.y}
                                        x2={chartLayout.width - CHART_PADDING.right}
                                        y2={tick.y}
                                        stroke={theme.colors.outlineVariant}
                                        strokeWidth={1}
                                        strokeDasharray="3 4"
                                    />
                                    <SvgText
                                        accessibilityLabel={`${formatWeight(tick.value, user?.weight_unit)} weight axis label`}
                                        x={CHART_PADDING.left - 8}
                                        y={tick.y + 4}
                                        fill={theme.colors.onSurfaceVariant}
                                        fontSize={11}
                                        textAnchor="end"
                                    >
                                        {formatWeight(tick.value, user?.weight_unit)}
                                    </SvgText>
                                </React.Fragment>
                            ))}
                            <Line
                                x1={CHART_PADDING.left}
                                y1={chartHeight - CHART_PADDING.bottom}
                                x2={chartLayout.width - CHART_PADDING.right}
                                y2={chartHeight - CHART_PADDING.bottom}
                                stroke={theme.colors.outlineVariant}
                                strokeWidth={1}
                            />
                            {showModelBoundary && chartLayout.modelBoundaryPoint && (
                                <React.Fragment>
                                    <Line
                                        testID="weight-trend-model-boundary"
                                        accessibilityLabel={`Smoothed trend begins ${formatDateOnlyForDisplay(chartLayout.modelBoundaryPoint.dateKey)}`}
                                        x1={chartLayout.modelBoundaryPoint.x}
                                        y1={CHART_PADDING.top}
                                        x2={chartLayout.modelBoundaryPoint.x}
                                        y2={chartHeight - CHART_PADDING.bottom}
                                        stroke={theme.colors.onSurfaceVariant}
                                        strokeWidth={1.5}
                                        strokeDasharray="5 4"
                                    />
                                    <SvgText
                                        x={chartLayout.modelBoundaryPoint.x > chartLayout.width - 90
                                            ? chartLayout.modelBoundaryPoint.x - 5
                                            : chartLayout.modelBoundaryPoint.x + 5}
                                        y={CHART_PADDING.top + 12}
                                        fill={theme.colors.onSurfaceVariant}
                                        fontSize={10}
                                        textAnchor={chartLayout.modelBoundaryPoint.x > chartLayout.width - 90 ? 'end' : 'start'}
                                    >
                                        Trend starts
                                    </SvgText>
                                </React.Fragment>
                            )}
                            {chartLayout.trendSegments.map((segment, index) => (
                                <React.Fragment key={`trend-segment-${index}`}>
                                    {segment.length > 1 && (
                                        <Polygon
                                            testID={`weight-trend-range-${index}`}
                                            points={buildWeightTrendBandPoints(segment)}
                                            fill={theme.colors.infoContainer}
                                            stroke={theme.colors.info}
                                            strokeWidth={0.75}
                                            opacity={0.72}
                                        />
                                    )}
                                    <Path
                                        testID={`weight-trend-smoothed-path-${index}`}
                                        d={buildWeightTrendLinePath(segment)}
                                        stroke={theme.colors.primary}
                                        strokeWidth={4}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="none"
                                    />
                                </React.Fragment>
                            ))}
                            {chartLayout.measurementPoints.map((point) => (
                                <Circle
                                    key={getPointKey(point)}
                                    cx={point.x}
                                    cy={point.measurementY}
                                    r={3.5}
                                    fill={theme.colors.surface}
                                    stroke={theme.colors.info}
                                    strokeWidth={1.5}
                                />
                            ))}
                            {selectedPoint && (
                                <Circle
                                    cx={selectedPoint.x}
                                    cy={selectedPoint.measurementY}
                                    r={6}
                                    fill={theme.colors.warningContainer}
                                    stroke={theme.colors.warning}
                                    strokeWidth={2}
                                />
                            )}
                            {chartLayout.xTicks.map((tick) => (
                                <React.Fragment key={tick.key}>
                                    <Line
                                        x1={tick.x}
                                        y1={chartHeight - CHART_PADDING.bottom}
                                        x2={tick.x}
                                        y2={chartHeight - CHART_PADDING.bottom + 4}
                                        stroke={theme.colors.outlineVariant}
                                        strokeWidth={1}
                                    />
                                    <SvgText
                                        accessibilityLabel={`${formatAxisDate(tick.dateKey, includeYear)} date axis label`}
                                        x={tick.x}
                                        y={chartHeight - 6}
                                        fill={theme.colors.onSurfaceVariant}
                                        fontSize={11}
                                        textAnchor={tick.textAnchor}
                                    >
                                        {formatAxisDate(tick.dateKey, includeYear)}
                                    </SvgText>
                                </React.Fragment>
                            ))}
                        </Svg>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Select nearest weigh-in"
                            accessibilityHint="Use Previous and Next below the chart for keyboard or screen reader navigation"
                            onPress={(event) => selectNearestPoint(getChartPressX(event.nativeEvent))}
                            style={StyleSheet.absoluteFill}
                        />
                    </View>
                    {showModelBoundary && chartLayout.modelBoundaryPoint && (
                        <AppText variant="caption" style={styles.boundaryNote}>
                            Smoothed trend starts {formatDateOnlyForDisplay(chartLayout.modelBoundaryPoint.dateKey)}. Earlier dots are measurements only.
                        </AppText>
                    )}
                    <TrendChartLegend />
                    {selectedPoint && (
                        <SelectedTrendPanel
                            point={selectedPoint}
                            unit={user?.weight_unit}
                            freshness={selectedPointIndex === chartPoints.length - 1
                                ? trendSummary?.freshness ?? (trendSummary?.status === 'stale' ? 'stale' : 'current')
                                : null}
                        />
                    )}
                    {selectedPoint && (
                        <View accessibilityRole="toolbar" accessibilityLabel="Selected weigh-in navigation" style={styles.pointNavigation}>
                            <PointNavigationButton
                                direction="previous"
                                disabled={selectedPointIndex <= 0}
                                onPress={() => selectPointAtIndex(selectedPointIndex - 1)}
                            />
                            <PointNavigationButton
                                direction="next"
                                disabled={selectedPointIndex >= chartPoints.length - 1}
                                onPress={() => selectPointAtIndex(selectedPointIndex + 1)}
                            />
                        </View>
                    )}
                    {!trendSummary && (
                        <AppText variant="caption" style={styles.summary}>
                            {visibleTrendSummary}
                        </AppText>
                    )}
                </View>
            )}
            {trendQuery.error && <AppText style={styles.error}>{trendQuery.error.message}</AppText>}
            {footer}
        </AppCard>
    );
};

const SelectedTrendPanel: React.FC<{
    point: WeightTrendChartPoint;
    unit: Parameters<typeof formatWeight>[1];
    freshness: 'current' | 'stale' | 'outdated' | null;
}> = ({ point, unit, freshness }) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [isRangeInfoHovered, setIsRangeInfoHovered] = useState(false);
    const [isRangeInfoFocused, setIsRangeInfoFocused] = useState(false);
    const [isRangeInfoPinned, setIsRangeInfoPinned] = useState(false);
    const showRangeTooltip = isRangeInfoHovered || isRangeInfoFocused || isRangeInfoPinned;
    let freshnessLabel = '';
    if (freshness === 'stale') freshnessLabel = 'Based on an older weigh-in';
    if (freshness === 'outdated') freshnessLabel = 'Current weigh-in needed';
    const trendSnapshot = point.hasVisibleTrend
        ? {
            weight: point.metric.trend_weight,
            lower: point.metric.trend_ci_lower,
            upper: point.metric.trend_ci_upper
        }
        : null;
    const accessibilityLabel = trendSnapshot
        ? `Selected ${formatDateOnlyForDisplay(point.dateKey)}. Underlying weight estimate ${formatWeight(trendSnapshot.weight, unit)}. 95% trend range ${formatEstimatedTrendRange(trendSnapshot, unit)}. Scale reading ${formatWeight(point.metric.weight, unit)}.`
        : `Selected ${formatDateOnlyForDisplay(point.dateKey)}. Scale reading ${formatWeight(point.metric.weight, unit)}. No underlying trend estimate is available for this date.`;

    return (
        <View
            testID="selected-trend-summary"
            accessibilityLabel={accessibilityLabel}
            accessibilityLiveRegion="polite"
            style={styles.snapshotPanel}
        >
            <View style={styles.snapshotHeader}>
                <AppText variant="caption">
                    {trendSnapshot ? 'Underlying weight estimate' : 'Scale reading'}
                </AppText>
                <AppText variant="caption">{formatDateOnlyForDisplay(point.dateKey)}</AppText>
            </View>
            {trendSnapshot ? (
                <>
                    <AppText variant="screenTitle" style={styles.snapshotValue}>
                        {formatWeight(trendSnapshot.weight, unit)}
                    </AppText>
                    {freshnessLabel ? <AppText variant="caption">{freshnessLabel}</AppText> : null}
                    <View style={styles.snapshotRangeRow}>
                        <AppText variant="caption">95% trend range {formatEstimatedTrendRange(trendSnapshot, unit)}</AppText>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="About the 95% trend range"
                            accessibilityHint="This range shows uncertainty in the estimate, not expected scale readings."
                            accessibilityState={{ expanded: showRangeTooltip }}
                            hitSlop={12}
                            onHoverIn={() => setIsRangeInfoHovered(true)}
                            onHoverOut={() => setIsRangeInfoHovered(false)}
                            onFocus={() => setIsRangeInfoFocused(true)}
                            onBlur={() => setIsRangeInfoFocused(false)}
                            onPress={() => {
                                if (Platform.OS !== 'web') {
                                    setIsRangeInfoPinned((current) => !current);
                                }
                            }}
                            style={({ pressed }) => [styles.rangeInfoButton, pressed && styles.pressed]}
                        >
                            <Ionicons name="information-circle-outline" size={17} color={theme.colors.onPrimaryContainer} />
                            {showRangeTooltip ? (
                                <View testID="trend-range-tooltip" pointerEvents="none" style={styles.rangeTooltip}>
                                    <AppText variant="caption" style={styles.rangeTooltipText}>
                                        This range shows uncertainty in the estimate, not expected scale readings.
                                    </AppText>
                                </View>
                            ) : null}
                        </Pressable>
                    </View>
                    <View style={styles.snapshotMeasurementRow}>
                        <AppText variant="caption">Scale reading</AppText>
                        <AppText variant="label">{formatWeight(point.metric.weight, unit)}</AppText>
                    </View>
                </>
            ) : (
                <>
                    <AppText variant="screenTitle" style={styles.snapshotValue}>
                        {formatWeight(point.metric.weight, unit)}
                    </AppText>
                    <AppText variant="caption">
                        This older point has no underlying trend estimate.
                    </AppText>
                </>
            )}
        </View>
    );
};

const PointNavigationButton: React.FC<{
    direction: 'previous' | 'next';
    disabled: boolean;
    onPress: () => void;
}> = ({ direction, disabled, onPress }) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const previous = direction === 'previous';
    const label = previous ? 'Previous weigh-in' : 'Next weigh-in';
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [styles.pointNavigationButton, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
        >
            {previous && <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />}
            <AppText variant="label" style={styles.pointNavigationLabel}>{previous ? 'Previous' : 'Next'}</AppText>
            {!previous && <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />}
        </Pressable>
    );
};

const TrendChartLegend: React.FC = () => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    return (
        <View accessible accessibilityLabel="Chart legend" style={styles.chartLegend}>
            <View style={styles.chartLegendItem}>
                <View style={styles.readingLegendMarker} />
                <AppText variant="caption">Scale reading</AppText>
            </View>
            <View style={styles.chartLegendItem}>
                <View style={styles.trendLegendMarker} />
                <AppText variant="caption">Underlying trend</AppText>
            </View>
            <View style={styles.chartLegendItem}>
                <View style={styles.rangeLegendMarker} />
                <AppText variant="caption">95% estimate range</AppText>
            </View>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    card: { width: '100%' },
    rangeRow: { flexDirection: 'row', gap: spacing.sm },
    rangeChip: { flex: 1 },
    chartShell: {
        flexGrow: 1,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.sm,
        gap: spacing.sm
    },
    chartCanvas: { position: 'relative', flexGrow: 1, flexShrink: 1, minHeight: CHART_HEIGHT },
    chartLegend: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: spacing.md,
        paddingHorizontal: spacing.sm
    },
    chartLegendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    readingLegendMarker: {
        width: 10,
        height: 10,
        borderRadius: radius.pill,
        borderColor: theme.colors.info,
        borderWidth: 1.5,
        backgroundColor: theme.colors.surface
    },
    trendLegendMarker: {
        width: 20,
        height: 4,
        borderRadius: radius.pill,
        backgroundColor: theme.colors.primary
    },
    rangeLegendMarker: {
        width: 20,
        height: 10,
        borderRadius: radius.sm,
        borderColor: theme.colors.info,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.infoContainer
    },
    emptyChart: {
        flexGrow: 1,
        minHeight: CHART_HEIGHT,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surfaceContainer,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg
    },
    singlePointState: {
        flexGrow: 1,
        minHeight: 116,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surfaceContainer,
        padding: spacing.lg
    },
    singlePointIcon: {
        width: 52,
        height: 52,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: theme.colors.primaryContainer
    },
    singlePointText: { flex: 1, minWidth: 0, gap: spacing.xs },
    snapshotPanel: {
        position: 'relative',
        zIndex: 2,
        borderRadius: radius.md,
        backgroundColor: theme.colors.primaryContainer,
        padding: spacing.md,
        gap: spacing.xs
    },
    snapshotHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    snapshotValue: { color: theme.colors.onPrimaryContainer },
    snapshotRangeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
    snapshotMeasurementRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.sm,
        paddingTop: spacing.xs
    },
    rangeInfoButton: {
        position: 'relative',
        zIndex: 3,
        minWidth: 24,
        minHeight: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill
    },
    rangeTooltip: {
        position: 'absolute',
        top: 28,
        right: 0,
        width: 220,
        zIndex: 3,
        borderRadius: radius.sm,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.surfaceContainerHigh,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        ...theme.shadows.raised
    },
    rangeTooltipText: { color: theme.colors.onSurface },
    summary: { textAlign: 'center' },
    boundaryNote: { color: theme.colors.onSurfaceVariant, textAlign: 'center' },
    pointNavigation: { flexDirection: 'row', gap: spacing.sm },
    pointNavigationButton: {
        flex: 1,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.md,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth
    },
    pointNavigationLabel: { color: theme.colors.primary },
    pressed: { backgroundColor: theme.colors.surfacePressed },
    disabled: { opacity: 0.45 },
    error: { color: theme.colors.danger }
});
