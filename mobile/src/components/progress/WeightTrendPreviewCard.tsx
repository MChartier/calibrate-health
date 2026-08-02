import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import type { TrendMetricEntry } from '@calibrate/api-client';
import { AppCard } from '../AppCard';
import { AppText } from '../AppText';
import { SectionHeader } from '../SectionHeader';
import { useAuth } from '../../auth/AuthContext';
import { radius, spacing, useAppTheme, type AppTheme } from '../../theme';
import { dateOnlyToLocalDate } from '../../utils/dates';
import { formatWeight } from '../../utils/format';
import { describeVisibleWeightTrend, isVisibleWeightTrendPoint } from '../../weightTrend/presentation';

type WeightTrendPreviewCardProps = {
    onPress: () => void;
};

type PreviewPoint = {
    key: string;
    hasVisibleTrend: boolean;
    x: number;
    measurementY: number;
    trendY: number;
};

type PreviewCanvasSize = {
    width: number;
    height: number;
};

type PreviewLayout = PreviewCanvasSize & {
    points: PreviewPoint[];
    xTicks: Array<{ key: string; label: string; x: number; textAnchor: 'start' | 'end' }>;
    yTicks: Array<{ value: number; y: number }>;
};

const DEFAULT_PREVIEW_WIDTH = 340;
const MIN_PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 112; // Keeps the Progress card glanceable while preserving a meaningful trend shape.
const PREVIEW_CARD_MIN_HEIGHT = 240; // Preserves the compact chart and summary before free space is distributed.
const PREVIEW_PADDING_LEFT = 48; // Reserves a compact gutter for weight labels without widening the card.
const PREVIEW_PADDING_RIGHT = 8; // Keeps the final point and end-date label clear of the rounded chart edge.
const PREVIEW_PADDING_TOP = 10; // Leaves headroom for the top gridline and measurement markers.
const PREVIEW_PADDING_BOTTOM = 24; // Keeps endpoint dates inside the existing preview canvas.
const PREVIEW_AXIS_FONT_SIZE = 10; // Keeps preview labels legible without competing with the trend lines.
const PREVIEW_AXIS_TICK_SIZE = 4; // Marks the date endpoints without adding interactive chart controls.
const MIN_PREVIEW_WEIGHT_SPAN = 0.4;

function buildPath(points: PreviewPoint[], key: 'measurementY' | 'trendY'): string {
    return points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point[key].toFixed(2)}`)
        .join(' ');
}

function formatPreviewDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
        .format(dateOnlyToLocalDate(value.split('T')[0] ?? value));
}

function getPreviewLayout(metrics: TrendMetricEntry[], canvasSize: PreviewCanvasSize): PreviewLayout {
    const chronologicalMetrics = metrics
        .slice()
        .filter((metric) => Number.isFinite(metric.weight))
        .reverse();
    const width = Math.max(canvasSize.width, MIN_PREVIEW_WIDTH);
    const height = Math.max(canvasSize.height, PREVIEW_HEIGHT);
    if (chronologicalMetrics.length === 0) {
        return { width, height, points: [], xTicks: [], yTicks: [] };
    }

    const values = chronologicalMetrics.flatMap((metric) => (
        isVisibleWeightTrendPoint(metric)
            ? [metric.weight, metric.trend_weight]
            : [metric.weight]
    ));
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = Math.max(maximum - minimum, MIN_PREVIEW_WEIGHT_SPAN);
    const axisMiddle = (maximum + minimum) / 2;
    const axisMinimum = axisMiddle - range / 2;
    const axisMaximum = axisMiddle + range / 2;
    const drawableWidth = width - PREVIEW_PADDING_LEFT - PREVIEW_PADDING_RIGHT;
    const drawableHeight = height - PREVIEW_PADDING_TOP - PREVIEW_PADDING_BOTTOM;
    const lastIndex = Math.max(chronologicalMetrics.length - 1, 1);
    const yForValue = (value: number) =>
        PREVIEW_PADDING_TOP + drawableHeight - ((value - axisMinimum) / range) * drawableHeight;

    const points = chronologicalMetrics.map((metric, index) => {
        const measurementY = yForValue(metric.weight);
        const hasVisibleTrend = isVisibleWeightTrendPoint(metric);
        return {
            key: `${metric.id}-${metric.date}`,
            hasVisibleTrend,
            x: PREVIEW_PADDING_LEFT + (drawableWidth * index) / lastIndex,
            measurementY,
            trendY: hasVisibleTrend ? yForValue(metric.trend_weight) : measurementY
        };
    });

    const lastMetric = chronologicalMetrics[chronologicalMetrics.length - 1];
    return {
        width,
        height,
        points,
        yTicks: [
            { value: axisMaximum, y: PREVIEW_PADDING_TOP },
            { value: axisMinimum, y: height - PREVIEW_PADDING_BOTTOM }
        ],
        xTicks: [
            {
                key: `start-${chronologicalMetrics[0].date}`,
                label: formatPreviewDate(chronologicalMetrics[0].date),
                x: PREVIEW_PADDING_LEFT,
                textAnchor: 'start'
            },
            {
                key: `end-${lastMetric.date}`,
                label: formatPreviewDate(lastMetric.date),
                x: width - PREVIEW_PADDING_RIGHT,
                textAnchor: 'end'
            }
        ]
    };
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
    const chartLayout = useMemo(
        () => getPreviewLayout(trendQuery.data?.metrics ?? [], canvasSize),
        [canvasSize, trendQuery.data?.metrics]
    );
    const points = chartLayout.points;
    const measurementPath = buildPath(points, 'measurementY');
    const trendPath = buildPath(points.filter((point) => point.hasVisibleTrend), 'trendY');
    const hasWeightHistory = (trendQuery.data?.meta.total_points ?? 0) > 0;
    const trendSummary = describeVisibleWeightTrend(
        trendQuery.data?.metrics ?? [],
        user?.weight_unit
    );

    return (
        <View style={styles.flexSlot}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open full weight trend"
                accessibilityHint="Shows the interactive chart and time range controls"
                onPress={onPress}
                style={styles.pressable}
            >
                {({ pressed }) => (
                    <AppCard style={[styles.card, pressed && styles.cardPressed]}>
                        <View style={styles.headingRow}>
                            <SectionHeader
                                title="Weight trend"
                                description="Last four weeks at a glance."
                                style={styles.heading}
                            />
                            <View style={styles.detailsAction}>
                                <AppText variant="label" style={styles.detailsText}>Details</AppText>
                                <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
                            </View>
                        </View>

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
                            {trendQuery.isLoading && !trendQuery.data ? (
                                <AppText variant="muted">Loading trend...</AppText>
                            ) : points.length === 0 ? (
                                <AppText variant="muted">
                                    {hasWeightHistory
                                        ? 'No weigh-ins in the last four weeks. Open Details to view your history.'
                                        : 'Log a weigh-in to start a trend.'}
                                </AppText>
                            ) : points.length === 1 ? (
                                <View style={styles.firstWeighIn}>
                                    <Ionicons name="scale-outline" size={22} color={theme.colors.primary} />
                                    <AppText variant="body">First weigh-in recorded</AppText>
                                </View>
                            ) : (
                                <Svg
                                    accessibilityLabel="Four-week weight trend preview"
                                    width="100%"
                                    height="100%"
                                    viewBox={`0 0 ${chartLayout.width} ${chartLayout.height}`}
                                >
                                    {chartLayout.yTicks.map((tick) => (
                                        <React.Fragment key={tick.value}>
                                            <Line
                                                x1={PREVIEW_PADDING_LEFT}
                                                y1={tick.y}
                                                x2={chartLayout.width - PREVIEW_PADDING_RIGHT}
                                                y2={tick.y}
                                                stroke={theme.colors.outlineVariant}
                                                strokeWidth={1}
                                                strokeDasharray="3 4"
                                            />
                                            <SvgText
                                                accessibilityLabel={`${formatWeight(tick.value, user?.weight_unit)} weight axis label`}
                                                x={PREVIEW_PADDING_LEFT - 6}
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
                                                y1={chartLayout.height - PREVIEW_PADDING_BOTTOM}
                                                x2={tick.x}
                                                y2={chartLayout.height - PREVIEW_PADDING_BOTTOM + PREVIEW_AXIS_TICK_SIZE}
                                                stroke={theme.colors.outlineVariant}
                                                strokeWidth={1}
                                            />
                                            <SvgText
                                                accessibilityLabel={`${tick.label} date axis label`}
                                                x={tick.x}
                                                y={chartLayout.height - 5}
                                                fill={theme.colors.onSurfaceVariant}
                                                fontSize={PREVIEW_AXIS_FONT_SIZE}
                                                textAnchor={tick.textAnchor}
                                            >
                                                {tick.label}
                                            </SvgText>
                                        </React.Fragment>
                                    ))}
                                    <Path
                                        testID="weight-trend-preview-measurement-path"
                                        d={measurementPath}
                                        stroke={theme.colors.info}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="none"
                                        opacity={0.55}
                                    />
                                    {trendPath.length > 0 && (
                                        <Path
                                            testID="weight-trend-preview-smoothed-path"
                                            d={trendPath}
                                            stroke={theme.colors.primary}
                                            strokeWidth={4}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                        />
                                    )}
                                    {points.map((point) => (
                                        <Circle
                                            key={point.key}
                                            cx={point.x}
                                            cy={point.measurementY}
                                            r={3}
                                            fill={theme.colors.surface}
                                            stroke={theme.colors.info}
                                            strokeWidth={1.5}
                                        />
                                    ))}
                                </Svg>
                            )}
                        </View>

                        <AppText variant="caption" style={styles.summary}>
                            {trendSummary}
                        </AppText>
                        {trendQuery.error && <AppText style={styles.error}>{trendQuery.error.message}</AppText>}
                    </AppCard>
                )}
            </Pressable>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    flexSlot: {
        flexGrow: 1,
        flexBasis: PREVIEW_CARD_MIN_HEIGHT,
        minHeight: PREVIEW_CARD_MIN_HEIGHT
    },
    pressable: {
        flex: 1,
        width: '100%'
    },
    card: {
        flex: 1,
        gap: spacing.sm
    },
    cardPressed: {
        backgroundColor: theme.colors.surfacePressed
    },
    headingRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    heading: {
        flex: 1,
        minWidth: 0
    },
    detailsAction: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs
    },
    detailsText: {
        color: theme.colors.primary
    },
    preview: {
        flex: 1,
        minHeight: PREVIEW_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth
    },
    firstWeighIn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    summary: {
        fontWeight: '700'
    },
    error: {
        color: theme.colors.danger
    }
});
