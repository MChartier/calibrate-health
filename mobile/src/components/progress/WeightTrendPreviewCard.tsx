import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import type { TrendMetricEntry } from '@calibrate/api-client';
import { AppCard } from '../AppCard';
import { AppText } from '../AppText';
import { SectionHeader } from '../SectionHeader';
import { useAuth } from '../../auth/AuthContext';
import { radius, spacing, useAppTheme, type AppTheme } from '../../theme';
import { formatWeightUnit } from '../../utils/format';

type WeightTrendPreviewCardProps = {
    onPress: () => void;
};

type PreviewPoint = {
    key: string;
    x: number;
    measurementY: number;
    trendY: number;
};

type PreviewCanvasSize = {
    width: number;
    height: number;
};

const DEFAULT_PREVIEW_WIDTH = 340;
const MIN_PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 112; // Keeps the Progress card glanceable while preserving a meaningful trend shape.
const PREVIEW_CARD_MIN_HEIGHT = 240; // Preserves the compact chart and summary before free space is distributed.
const PREVIEW_HORIZONTAL_PADDING = 8;
const PREVIEW_VERTICAL_PADDING = 12;
const MIN_PREVIEW_WEIGHT_SPAN = 0.4;

function buildPath(points: PreviewPoint[], key: 'measurementY' | 'trendY'): string {
    return points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point[key].toFixed(2)}`)
        .join(' ');
}

function getPreviewPoints(metrics: TrendMetricEntry[], canvasSize: PreviewCanvasSize): PreviewPoint[] {
    const chronologicalMetrics = metrics
        .slice()
        .filter((metric) => Number.isFinite(metric.weight) && Number.isFinite(metric.trend_weight))
        .reverse();
    if (chronologicalMetrics.length === 0) return [];

    const width = Math.max(canvasSize.width, MIN_PREVIEW_WIDTH);
    const height = Math.max(canvasSize.height, PREVIEW_HEIGHT);
    const values = chronologicalMetrics.flatMap((metric) => [metric.weight, metric.trend_weight]);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = Math.max(maximum - minimum, MIN_PREVIEW_WEIGHT_SPAN);
    const axisMiddle = (maximum + minimum) / 2;
    const axisMinimum = axisMiddle - range / 2;
    const drawableWidth = width - (PREVIEW_HORIZONTAL_PADDING * 2);
    const drawableHeight = height - (PREVIEW_VERTICAL_PADDING * 2);
    const lastIndex = Math.max(chronologicalMetrics.length - 1, 1);
    const yForValue = (value: number) =>
        PREVIEW_VERTICAL_PADDING + drawableHeight - ((value - axisMinimum) / range) * drawableHeight;

    return chronologicalMetrics.map((metric, index) => ({
        key: `${metric.id}-${metric.date}`,
        x: PREVIEW_HORIZONTAL_PADDING + (drawableWidth * index) / lastIndex,
        measurementY: yForValue(metric.weight),
        trendY: yForValue(metric.trend_weight)
    }));
}

function describeTrend(rate: number | null | undefined, unit: string): string {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return 'Add more weigh-ins to reveal your weekly trend';
    if (Math.abs(rate) < 0.005) return 'Trend steady this week';
    const direction = rate > 0 ? '+' : '';
    return `Trend ${direction}${rate.toFixed(2)} ${unit} / week`;
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
    const points = useMemo(
        () => getPreviewPoints(trendQuery.data?.metrics ?? [], canvasSize),
        [canvasSize, trendQuery.data?.metrics]
    );
    const measurementPath = buildPath(points, 'measurementY');
    const trendPath = buildPath(points, 'trendY');
    const unit = formatWeightUnit(user?.weight_unit);
    const volatility = trendQuery.data?.meta.volatility;
    const trendSummary = describeTrend(trendQuery.data?.meta.weekly_rate, unit);

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
                                description="Last 30 days at a glance."
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
                                <AppText variant="muted">Log a weigh-in to start a trend.</AppText>
                            ) : points.length === 1 ? (
                                <View style={styles.firstWeighIn}>
                                    <Ionicons name="scale-outline" size={22} color={theme.colors.primary} />
                                    <AppText variant="body">First weigh-in recorded</AppText>
                                </View>
                            ) : (
                                <Svg
                                    accessibilityLabel="30-day weight trend preview"
                                    width="100%"
                                    height="100%"
                                    viewBox={`0 0 ${Math.max(canvasSize.width, MIN_PREVIEW_WIDTH)} ${Math.max(canvasSize.height, PREVIEW_HEIGHT)}`}
                                >
                                    <Line
                                        x1={PREVIEW_HORIZONTAL_PADDING}
                                        y1={Math.max(canvasSize.height, PREVIEW_HEIGHT) / 2}
                                        x2={Math.max(canvasSize.width, MIN_PREVIEW_WIDTH) - PREVIEW_HORIZONTAL_PADDING}
                                        y2={Math.max(canvasSize.height, PREVIEW_HEIGHT) / 2}
                                        stroke={theme.colors.outlineVariant}
                                        strokeWidth={1}
                                        strokeDasharray="3 4"
                                    />
                                    <Path
                                        d={measurementPath}
                                        stroke={theme.colors.info}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="none"
                                        opacity={0.55}
                                    />
                                    <Path
                                        d={trendPath}
                                        stroke={theme.colors.primary}
                                        strokeWidth={4}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="none"
                                    />
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
                            {volatility ? ` | ${volatility} volatility` : ''}
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
