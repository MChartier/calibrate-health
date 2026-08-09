import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { AppCard } from '../AppCard';
import { AppText } from '../AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../AsyncStateBoundary';
import { CardHeader } from '../CardHeader';
import { NavigableCard } from '../NavigableCard';
import { SkeletonBlock } from '../SkeletonBlock';
import { useAuth } from '../../auth/AuthContext';
import { radius, spacing, useAppTheme, type AppTheme } from '../../theme';
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
};

type PreviewCanvasSize = {
    width: number;
    height: number;
};

const DEFAULT_PREVIEW_WIDTH = 340;
const MIN_PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 144; // Gives the compact chart enough vertical scale to show the trend and uncertainty clearly.
const PREVIEW_CARD_MIN_HEIGHT = 252; // Preserves chart clearance beneath the compact title row.
const PREVIEW_PADDING = {
    left: 48, // Reserves a compact gutter for weight labels without widening the card.
    right: 8,
    top: 10,
    bottom: 24
};
const PREVIEW_AXIS_FONT_SIZE = 10;
const PREVIEW_AXIS_TICK_SIZE = 4;
const MIN_PREVIEW_WEIGHT_SPAN = 0.4;

function formatPreviewDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
        .format(dateOnlyToLocalDate(value));
}

export const WeightTrendPreviewCard: React.FC<WeightTrendPreviewCardProps> = ({ onPress }) => {
    const { api, user } = useAuth();
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [canvasSize, setCanvasSize] = useState<PreviewCanvasSize>({
        width: DEFAULT_PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT
    });
    const trendQuery = useQuery({
        queryKey: ['mobile-metrics-trend', 'month'],
        queryFn: () => api.getTrendMetrics({ range: 'month' })
    });
    const metrics = trendQuery.data?.metrics ?? [];
    const latestSnapshot = getLatestWeightTrendSnapshot(
        metrics,
        trendQuery.data?.meta.trend_summary
    );
    const chartLayout = useMemo(
        () => buildWeightTrendChartGeometry(metrics, {
            width: canvasSize.width,
            height: canvasSize.height,
            minWidth: MIN_PREVIEW_WIDTH,
            minHeight: PREVIEW_HEIGHT,
            minWeightSpan: MIN_PREVIEW_WEIGHT_SPAN,
            padding: PREVIEW_PADDING,
            xTickCount: 2,
            yAxisMode: 'bounds'
        }),
        [canvasSize, metrics]
    );
    const points = chartLayout.points;
    const hasWeightHistory = (trendQuery.data?.meta.total_points ?? 0) > 0;
    const isOnline = useOnlineStatus();
    const trendState = useAsyncResourceState(trendQuery, (data) => data.metrics.length === 0);

    return (
        <View style={styles.flexSlot}>
            <AsyncStateBoundary
                state={trendState}
                resourceLabel="weight trend"
                loading={(
                    <AppCard style={styles.card}>
                        <SkeletonBlock width="34%" height={26} />
                        <SkeletonBlock height={PREVIEW_HEIGHT} />
                    </AppCard>
                )}
                empty={(
                    <NavigableCard
                        accessibilityRole="button"
                        accessibilityLabel="Open full weight trend"
                        accessibilityHint="Shows the interactive chart, confidence details, and time range controls"
                        onPress={onPress}
                        style={styles.pressable}
                        contentStyle={styles.card}
                    >
                            <CardHeader
                                density="compact"
                                title="Trend"
                                metadata={null}
                                headingTestID="trend-preview-heading-line"
                                action={(
                                    <View style={styles.detailsAction}>
                                        <AppText variant="label" style={styles.detailsText}>Details</AppText>
                                        <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
                                    </View>
                                )}
                            />
                            <View testID="weight-trend-preview-canvas" style={styles.preview}>
                                <AppText variant="muted">
                                    {hasWeightHistory
                                        ? 'No weigh-ins in the last four weeks. Open Details to view your history.'
                                        : 'Log a weigh-in to start a trend.'}
                                </AppText>
                            </View>
                    </NavigableCard>
                )}
                onRetry={isOnline ? () => trendQuery.refetch() : undefined}
                retrying={trendQuery.isFetching}
            >
                <NavigableCard
                    accessibilityRole="button"
                    accessibilityLabel="Open full weight trend"
                    accessibilityHint="Shows the interactive chart, confidence details, and time range controls"
                    onPress={onPress}
                    style={styles.pressable}
                    contentStyle={styles.card}
                >
                        <CardHeader
                            density="compact"
                            title="Trend"
                            metadata={latestSnapshot
                                ? `Current trend: ${formatWeight(latestSnapshot.weight, user?.weight_unit)}`
                                : null}
                            headingTestID="trend-preview-heading-line"
                            action={(
                                <View style={styles.detailsAction}>
                                <AppText variant="label" style={styles.detailsText}>Details</AppText>
                                <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
                                </View>
                            )}
                        />

                        <View
                            testID="weight-trend-preview-canvas"
                            style={styles.preview}
                            onLayout={(event) => {
                                const { width, height } = event.nativeEvent.layout;
                                setCanvasSize((current) => (
                                    current.width === width && current.height === height
                                        ? current
                                        : { width, height }
                                ));
                            }}
                        >
                            {points.length === 1 ? (
                                <View style={styles.firstWeighIn}>
                                    <Ionicons name="scale-outline" size={22} color={theme.colors.primary} />
                                    <AppText variant="body">First weigh-in recorded</AppText>
                                </View>
                            ) : (
                                <Svg
                                    accessibilityLabel="Four-week smoothed weight trend with 95% estimated range"
                                    width="100%"
                                    height="100%"
                                    viewBox={`0 0 ${chartLayout.width} ${chartLayout.height}`}
                                >
                                    {chartLayout.yTicks.map((tick) => (
                                        <React.Fragment key={tick.value}>
                                            <Line
                                                x1={PREVIEW_PADDING.left}
                                                y1={tick.y}
                                                x2={chartLayout.width - PREVIEW_PADDING.right}
                                                y2={tick.y}
                                                stroke={theme.colors.outlineVariant}
                                                strokeWidth={1}
                                                strokeDasharray="3 4"
                                            />
                                            <SvgText
                                                accessibilityLabel={`${formatWeight(tick.value, user?.weight_unit)} weight axis label`}
                                                x={PREVIEW_PADDING.left - 6}
                                                y={tick.y + 3}
                                                fill={theme.colors.onSurfaceVariant}
                                                fontSize={PREVIEW_AXIS_FONT_SIZE}
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
                                                y1={chartLayout.height - PREVIEW_PADDING.bottom}
                                                x2={tick.x}
                                                y2={chartLayout.height - PREVIEW_PADDING.bottom + PREVIEW_AXIS_TICK_SIZE}
                                                stroke={theme.colors.outlineVariant}
                                                strokeWidth={1}
                                            />
                                            <SvgText
                                                accessibilityLabel={`${formatPreviewDate(tick.dateKey)} date axis label`}
                                                x={tick.x}
                                                y={chartLayout.height - 5}
                                                fill={theme.colors.onSurfaceVariant}
                                                fontSize={PREVIEW_AXIS_FONT_SIZE}
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
                                                    fill={theme.colors.infoContainer}
                                                    stroke={theme.colors.info}
                                                    strokeWidth={0.75}
                                                    opacity={0.62}
                                                />
                                            )}
                                            <Path
                                                testID={`weight-trend-preview-smoothed-path-${index}`}
                                                d={buildWeightTrendLinePath(segment)}
                                                stroke={theme.colors.primary}
                                                strokeWidth={4}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                fill="none"
                                            />
                                        </React.Fragment>
                                    ))}
                                </Svg>
                            )}
                        </View>
                </NavigableCard>
            </AsyncStateBoundary>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    flexSlot: { width: '100%', minHeight: PREVIEW_CARD_MIN_HEIGHT },
    pressable: { width: '100%' },
    card: { gap: spacing.sm },
    detailsAction: { minHeight: theme.interaction.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    detailsText: { color: theme.colors.primary },
    preview: {
        height: PREVIEW_HEIGHT,
        marginBottom: spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth
    },
    firstWeighIn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }
});
