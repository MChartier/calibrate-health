import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { AppButton } from '../AppButton';
import { FixedPageColumn } from '../FixedPage';
import { useFocusVisible } from '../useFocusVisible';
import { AppText } from '../AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../AsyncStateBoundary';
import { SkeletonBlock } from '../SkeletonBlock';
import { useAuth } from '../../auth/AuthContext';
import { spacing, useAppTheme, type AppTheme } from '../../theme';
import { ASYNC_RESOURCE_STATES } from '../../asyncState/resolveAsyncState';
import { dateOnlyToLocalDate } from '../../utils/dates';
import { formatWeight } from '../../utils/format';
import {
    buildWeightTrendBandPoints,
    buildWeightTrendChartGeometry,
    buildWeightTrendLinePath
} from '../../weightTrend/geometry';
import { getLatestWeightTrendSnapshot } from '../../weightTrend/presentation';

type WeightTrendPreviewCardProps = {
    onPress: () => void;
    onLogWeight: () => void;
    suppressStaleNotice?: boolean;
    expanded?: boolean;
};

type PreviewCanvasSize = {
    width: number;
    height: number;
};

const DEFAULT_PREVIEW_WIDTH = 340;
const MIN_PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 166; // Gives the compact chart enough vertical scale to separate the estimate and uncertainty band.
const PREVIEW_PADDING = {
    left: 48, // Reserves a compact gutter for weight labels without widening the card.
    right: 8,
    top: 10,
    bottom: 32 // Keeps the date labels clear of the chart edge at compact widths.
};
const PREVIEW_AXIS_FONT_SIZE = 12; // Axis labels remain readable in the smallest supported chart.
const PREVIEW_AXIS_TICK_SIZE = 4;
const PREVIEW_DATE_LABEL_BOTTOM_OFFSET = 10;
const MIN_PREVIEW_WEIGHT_SPAN = 0.4;
const MIN_PREVIEW_HEIGHT = 116; // The bounded middle section keeps axes readable before the page scrolls.

function formatPreviewDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
        .format(dateOnlyToLocalDate(value));
}

export const WeightTrendPreviewCard: React.FC<WeightTrendPreviewCardProps> = ({ onPress, onLogWeight, suppressStaleNotice, expanded = false }) => {
    const { api, user } = useAuth();
    const theme = useAppTheme();
    const { width, fontScale } = useWindowDimensions();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [webAxisScale, setWebAxisScale] = useState(1);
    const axisProbe = React.useRef<Text>(null);
    const readAxisScale = React.useCallback(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;
        const element = axisProbe.current as unknown as HTMLElement | null;
        if (element) setWebAxisScale(Number.parseFloat(window.getComputedStyle(element).fontSize) / PREVIEW_AXIS_FONT_SIZE);
    }, []);
    React.useLayoutEffect(readAxisScale, [readAxisScale, width]);
    const axisScale = Math.max(1, fontScale, webAxisScale);
    const axisFontSize = PREVIEW_AXIS_FONT_SIZE * axisScale;
    // Reserve measured space for enlarged SVG text instead of clipping labels at the old gutter.
    const axisPadding = useMemo(() => ({
        ...PREVIEW_PADDING,
        left: PREVIEW_PADDING.left * axisScale,
        top: PREVIEW_PADDING.top * axisScale,
        bottom: PREVIEW_PADDING.bottom * axisScale
    }), [axisScale]);
    const expandedPreviewStyle = expanded ? [styles.previewExpanded, { height: PREVIEW_HEIGHT * axisScale }] : undefined;
    const [canvasSize, setCanvasSize] = useState<PreviewCanvasSize>({
        width: DEFAULT_PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT
    });
    const trendQuery = useQuery({
        queryKey: ['mobile-metrics-trend', 'month'],
        queryFn: () => api.getTrendMetrics({ range: 'month' })
    });
    const metrics = trendQuery.data?.metrics ?? [];
    const trendSummary = trendQuery.data?.meta.trend_summary;
    const latestSnapshot = getLatestWeightTrendSnapshot(metrics, trendSummary);
    const freshness = trendSummary?.freshness ?? (trendSummary?.status === 'stale' ? 'stale' : 'current');
    const estimateIsOutdated = freshness === 'outdated';
    const estimateIsUnavailable = freshness === 'unavailable' || trendSummary?.status === 'unavailable';
    const estimateIsSuppressed = estimateIsOutdated || estimateIsUnavailable;
    const metricDates = metrics
        .map((metric) => metric.date.split('T')[0])
        .filter(Boolean)
        .sort();
    const latestMetricDate = metricDates[metricDates.length - 1];
    const trendAsOfDate = trendSummary?.latest_observation_date ?? latestMetricDate;
    const formattedTrendDate = trendAsOfDate ? formatPreviewDate(trendAsOfDate) : null;
    let trendMetadata: string | null = null;
    if (estimateIsOutdated) {
        trendMetadata = formattedTrendDate
            ? `Estimate out of date | Last scale weight ${formattedTrendDate}`
            : 'Estimate out of date';
    } else if (estimateIsUnavailable) {
        trendMetadata = 'Trend estimate temporarily unavailable';
    } else if (latestSnapshot) {
        const estimate = formatWeight(latestSnapshot.weight, user?.weight_unit);
        if (freshness === 'stale') {
            trendMetadata = formattedTrendDate
                ? `Underlying trend: ${estimate} | As of ${formattedTrendDate}`
                : `Older underlying trend: ${estimate}`;
        } else {
            trendMetadata = `${estimate} underlying trend`;
        }
    }
    const chartLayout = useMemo(
        () => buildWeightTrendChartGeometry(metrics, {
            width: canvasSize.width,
            height: canvasSize.height,
            minWidth: MIN_PREVIEW_WIDTH,
            minHeight: MIN_PREVIEW_HEIGHT,
            minWeightSpan: MIN_PREVIEW_WEIGHT_SPAN,
            padding: axisPadding,
            xTickCount: 2,
            yAxisMode: 'bounds'
        }),
        [axisPadding, canvasSize, metrics]
    );
    const points = chartLayout.points;
    const hasWeightHistory = (trendQuery.data?.meta.total_points ?? 0) > 0;
    const isOnline = useOnlineStatus();
    const trendState = useAsyncResourceState(
        trendQuery,
        (data) => data.metrics.length === 0 && data.meta.trend_summary?.freshness !== 'outdated'
    );
    let suppressedEstimateMessage: string | null = null;
    if (estimateIsOutdated) {
        suppressedEstimateMessage = 'Log a current scale weight to refresh the underlying trend estimate.';
    } else if (estimateIsUnavailable) {
        suppressedEstimateMessage = 'Your scale weights are saved, but the underlying trend estimate is temporarily unavailable.';
    }

    const heading = (
        <View style={styles.heading}>
            <View testID="trend-preview-heading-line" style={styles.headingCopy}>
                <AppText variant="section" accessibilityRole="header">Trend</AppText>
                {trendMetadata && <AppText variant="muted">{trendMetadata}</AppText>}
            </View>
            <View testID="trend-preview-expand-icon" style={styles.expandIcon} pointerEvents="none"
                accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
                <Ionicons name="expand-outline" size={20} color={theme.colors.primary} />
            </View>
        </View>
    );
    const Slot = trendState.kind === ASYNC_RESOURCE_STATES.ERROR ? FixedPageColumn : View;
    return (
        <Slot style={[styles.flexSlot, expanded && styles.expanded]}>
            {Platform.OS === 'web' && <Text ref={axisProbe} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                onLayout={readAxisScale} style={styles.axisProbe}>M</Text>}
            <AsyncStateBoundary
                state={trendState}
                resourceLabel="weight trend"
                contentStyle={styles.boundaryContent}
                loading={<TrendTarget onPress={onPress}>
                    {heading}
                    <SkeletonBlock height={PREVIEW_HEIGHT} />
                </TrendTarget>}
                empty={
                    <TrendTarget onPress={onPress}>
                        {heading}
                        <View testID="weight-trend-preview-canvas" style={[styles.preview, expandedPreviewStyle]}>
                            <AppText variant="muted">
                                {hasWeightHistory
                                    ? 'No weigh-ins in the last four weeks. Open Details to view your history.'
                                    : 'Log a weigh-in to start a trend.'}
                            </AppText>
                        </View>
                    </TrendTarget>
                }
                onRetry={isOnline ? () => trendQuery.refetch() : undefined}
                retrying={trendQuery.isFetching}
                suppressStaleNotice={suppressStaleNotice}
            >
                <View style={styles.boundaryContent}>
                    <TrendTarget onPress={onPress}>
                        {heading}
                        <View
                        testID="weight-trend-preview-canvas"
                        style={[styles.preview, expandedPreviewStyle]}
                        onLayout={(event) => {
                            const { width, height } = event.nativeEvent.layout;
                            setCanvasSize((current) => (
                                current.width === width && current.height === height
                                    ? current
                                    : { width, height }
                            ));
                        }}
                    >
                        {suppressedEstimateMessage && (
                            <View style={styles.suppressedEstimate}>
                                <Ionicons name="time-outline" size={22} color={theme.colors.onSurfaceVariant} />
                                <AppText variant="muted" style={styles.suppressedEstimateText}>
                                    {suppressedEstimateMessage}
                                </AppText>
                            </View>
                        )}
                        {!estimateIsSuppressed && points.length === 1 && (
                            <View style={styles.firstWeighIn}>
                                <Ionicons name="scale-outline" size={22} color={theme.colors.primary} />
                                <AppText variant="body">First weigh-in recorded</AppText>
                            </View>
                        )}
                        {!estimateIsSuppressed && points.length !== 1 && (
                            <Svg
                                accessibilityLabel="Four-week underlying weight trend with 95% estimated range"
                                width="100%"
                                height="100%"
                                viewBox={`0 0 ${chartLayout.width} ${chartLayout.height}`}
                            >
                                {chartLayout.yTicks.map((tick) => (
                                    <React.Fragment key={tick.value}>
                                        <Line
                                            x1={axisPadding.left}
                                            y1={tick.y}
                                            x2={chartLayout.width - axisPadding.right}
                                            y2={tick.y}
                                            stroke={theme.colors.outlineVariant}
                                            strokeWidth={1}
                                            strokeDasharray=""
                                        />
                                        <SvgText
                                            accessibilityLabel={`${formatWeight(tick.value, user?.weight_unit)} weight axis label`}
                                            x={axisPadding.left - 6}
                                            y={tick.y + 3}
                                            fill={theme.colors.onSurfaceVariant}
                                            fontSize={axisFontSize}
                                            textAnchor="end"
                                        >
                                            {formatWeight(tick.value, user?.weight_unit)}
                                        </SvgText>
                                    </React.Fragment>
                                ))}
                                {chartLayout.xTicks.map((tick) => (
                                    <React.Fragment key={tick.key}>
                                        <Line
                                            x1={tick.x}
                                            y1={chartLayout.height - axisPadding.bottom}
                                            x2={tick.x}
                                            y2={chartLayout.height - axisPadding.bottom + PREVIEW_AXIS_TICK_SIZE}
                                            stroke={theme.colors.outlineVariant}
                                            strokeWidth={1}
                                        />
                                        <SvgText
                                            accessibilityLabel={`${formatPreviewDate(tick.dateKey)} date axis label`}
                                            x={tick.x}
                                            y={chartLayout.height - PREVIEW_DATE_LABEL_BOTTOM_OFFSET}
                                            fill={theme.colors.onSurfaceVariant}
                                            fontSize={axisFontSize}
                                            textAnchor={tick.textAnchor}
                                        >
                                            {formatPreviewDate(tick.dateKey)}
                                        </SvgText>
                                    </React.Fragment>
                                ))}
                                {chartLayout.trendSegments.map((segment, index) => (
                                    <React.Fragment key={`preview-trend-segment-${index}`}>
                                        {segment.length > 1 && (
                                            <Polygon
                                                testID={`weight-trend-preview-range-${index}`}
                                                points={buildWeightTrendBandPoints(segment)}
                                                fill={theme.colors.neutralEmphasisContainer}
                                                stroke="none"
                                                strokeWidth={0.75}
                                                opacity={0.62}
                                            />
                                        )}
                                        <Path
                                            testID={`weight-trend-preview-smoothed-path-${index}`}
                                            d={buildWeightTrendLinePath(segment)}
                                            stroke={theme.colors.primary}
                                            strokeWidth={3}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                        />
                                    </React.Fragment>
                                ))}
                            </Svg>
                        )}
                    </View>
                    </TrendTarget>
                    {estimateIsOutdated && <FixedPageColumn><AppButton
                        title="Log weight" variant="secondary"
                        leftIcon={<Ionicons name="scale-outline" size={18} color={theme.colors.primary} />}
                        onPress={onLogWeight}
                    /></FixedPageColumn>}
                </View>
            </AsyncStateBoundary>
        </Slot>
    );
};

function TrendTarget({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { focusVisible, handleFocus, handleBlur } = useFocusVisible();
    const [hovered, setHovered] = useState(false);
    return <Pressable
        testID="weight-trend-preview-card"
        accessibilityRole="button"
        accessibilityLabel="Open full weight trend"
        accessibilityHint="Shows the interactive chart, confidence details, and time range controls"
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => [styles.chartAction, hovered && styles.hovered, pressed && styles.pressed, focusVisible && styles.focusVisible]}
    ><FixedPageColumn style={styles.boundaryContent}>{children}</FixedPageColumn></Pressable>;
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    flexSlot: { width: '100%', flex: 1, minHeight: 0, paddingVertical: spacing.lg },
    expanded: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 254 },
    boundaryContent: { flex: 1, minHeight: 0, gap: spacing.sm },
    heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    headingCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
    expandIcon: { width: theme.interaction.minimumTouchTarget, height: theme.interaction.minimumTouchTarget, alignItems: 'center', justifyContent: 'center' },
    chartAction: { flex: 1, minHeight: MIN_PREVIEW_HEIGHT, paddingVertical: 0 },
    hovered: { backgroundColor: theme.colors.surfaceHovered },
    pressed: { backgroundColor: theme.colors.surfacePressed },
    focusVisible: { outlineWidth: theme.interaction.focusRingWidth, outlineColor: theme.colors.focusRing, outlineStyle: 'solid' },
    preview: { flex: 1, minHeight: MIN_PREVIEW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    previewExpanded: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: PREVIEW_HEIGHT },
    axisProbe: { position: 'absolute', opacity: 0, pointerEvents: 'none', fontSize: PREVIEW_AXIS_FONT_SIZE },
    firstWeighIn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    suppressedEstimate: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    suppressedEstimateText: { flex: 1 }
});
