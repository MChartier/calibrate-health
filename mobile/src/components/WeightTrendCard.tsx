import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import type { TrendMetricEntry } from '@calibrate/api-client';
import { AppCard } from './AppCard';
import { AppChip } from './AppChip';
import { AppText } from './AppText';
import { LoadingState } from './LoadingState';
import { SectionHeader } from './SectionHeader';
import { useAuth } from '../auth/AuthContext';
import { colors, radius, spacing } from '../theme';
import { formatWeight, formatWeightUnit } from '../utils/format';

type TrendRange = 'week' | 'month' | 'year' | 'all';

type WeightTrendCardProps = ViewProps & {
    title?: string;
    description?: string;
    targetWeight?: number | null;
    footer?: React.ReactNode;
};

const RANGE_OPTIONS: Array<{ value: TrendRange; label: string }> = [
    { value: 'week', label: '7d' },
    { value: 'month', label: '30d' },
    { value: 'year', label: '1y' },
    { value: 'all', label: 'All' }
];

const CHART_WIDTH = 340;
const CHART_HEIGHT = 168;
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

function getDatePart(value: string): string {
    return value.split('T')[0] ?? value;
}

function buildPath(points: Array<{ x: number; y: number }>): string {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function buildBandPoints(points: ChartPoint[]): string {
    const upper = points.map((point) => `${point.x.toFixed(2)},${point.upperY.toFixed(2)}`);
    const lower = points.slice().reverse().map((point) => `${point.x.toFixed(2)},${point.lowerY.toFixed(2)}`);
    return [...upper, ...lower].join(' ');
}

function getChartPoints(metrics: TrendMetricEntry[], targetWeight?: number | null): ChartPoint[] {
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
    if (typeof targetWeight === 'number' && Number.isFinite(targetWeight)) {
        values.push(targetWeight);
    }

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
 * Rich native weight trend card with range controls, trend line, raw points, and confidence band.
 */
export const WeightTrendCard: React.FC<WeightTrendCardProps> = ({
    title = 'Weight trend',
    description = 'Raw weigh-ins, smoothed trend, and expected range.',
    targetWeight,
    footer,
    style,
    ...props
}) => {
    const { api, user } = useAuth();
    const [range, setRange] = useState<TrendRange>('month');
    const trendQuery = useQuery({
        queryKey: ['mobile-metrics-trend', range],
        queryFn: () => api.getTrendMetrics({ range })
    });

    const chartPoints = useMemo(
        () => getChartPoints(trendQuery.data?.metrics ?? [], targetWeight),
        [targetWeight, trendQuery.data?.metrics]
    );

    const latest = trendQuery.data?.metrics[0] ?? null;
    const trendPath = chartPoints.length > 0 ? buildPath(chartPoints.map((point) => ({ x: point.x, y: point.trendY }))) : '';
    const rawPath = chartPoints.length > 0 ? buildPath(chartPoints.map((point) => ({ x: point.x, y: point.rawY }))) : '';
    const bandPoints = chartPoints.length > 1 ? buildBandPoints(chartPoints) : '';
    const targetY = useMemo(() => {
        if (typeof targetWeight !== 'number' || !Number.isFinite(targetWeight) || chartPoints.length === 0) return null;
        const allValues = chartPoints.flatMap((point) => [
            point.metric.weight,
            point.metric.trend_weight,
            point.metric.trend_ci_lower,
            point.metric.trend_ci_upper,
            targetWeight
        ]);
        const minValue = Math.min(...allValues);
        const maxValue = Math.max(...allValues);
        const rangeValue = Math.max(maxValue - minValue, 0.1);
        const paddedMin = minValue - rangeValue * 0.08;
        const paddedMax = maxValue + rangeValue * 0.08;
        const drawableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
        return CHART_PADDING_TOP + drawableHeight - ((targetWeight - paddedMin) / (paddedMax - paddedMin)) * drawableHeight;
    }, [chartPoints, targetWeight]);

    return (
        <AppCard {...props} style={style}>
            <View style={styles.headerRow}>
                <SectionHeader title={title} description={description} style={styles.headerText} />
                <AppText variant="label">{latest ? formatWeight(latest.weight, user?.weight_unit) : '-'}</AppText>
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
            ) : (
                <View style={styles.chartShell}>
                    <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
                        <Line
                            x1={CHART_PADDING_LEFT}
                            y1={CHART_HEIGHT - CHART_PADDING_BOTTOM}
                            x2={CHART_WIDTH - CHART_PADDING_RIGHT}
                            y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
                            stroke={colors.border}
                            strokeWidth={1}
                        />
                        {bandPoints.length > 0 && <Polygon points={bandPoints} fill={colors.primarySoft} opacity={0.72} />}
                        {targetY !== null && (
                            <>
                                <Line
                                    x1={CHART_PADDING_LEFT}
                                    y1={targetY}
                                    x2={CHART_WIDTH - CHART_PADDING_RIGHT}
                                    y2={targetY}
                                    stroke={colors.warning}
                                    strokeDasharray="6 5"
                                    strokeWidth={2}
                                />
                                <SvgText x={CHART_WIDTH - CHART_PADDING_RIGHT} y={Math.max(12, targetY - 4)} textAnchor="end" fill={colors.muted} fontSize="11" fontWeight="700">
                                    target
                                </SvgText>
                            </>
                        )}
                        {rawPath.length > 0 && (
                            <Path d={rawPath} stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.42} />
                        )}
                        {trendPath.length > 0 && (
                            <Path d={trendPath} stroke={colors.primary} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        )}
                        {chartPoints.map((point) => (
                            <Circle key={`${point.metric.id}-${point.metric.date}`} cx={point.x} cy={point.rawY} r={3.5} fill={colors.surface} stroke={colors.primaryDark} strokeWidth={1.5} />
                        ))}
                    </Svg>
                    <View style={styles.legend}>
                        <LegendItem label="raw" color={colors.muted} />
                        <LegendItem label="trend" color={colors.primary} />
                        <LegendItem label="range" color={colors.primarySoft} />
                    </View>
                    {trendQuery.data?.meta && (
                        <AppText variant="caption" style={styles.summary}>
                            {trendQuery.data.meta.weekly_rate.toFixed(2)} {formatWeightUnit(user?.weight_unit)}/week | {trendQuery.data.meta.volatility} volatility
                        </AppText>
                    )}
                </View>
            )}
            {trendQuery.error && <AppText style={styles.error}>{trendQuery.error.message}</AppText>}
            {footer}
        </AppCard>
    );
};

const LegendItem: React.FC<{ label: string; color: string }> = ({ label, color }) => (
    <View style={styles.legendItem}>
        <View style={[styles.legendSwatch, { backgroundColor: color }]} />
        <AppText variant="caption">{label}</AppText>
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
    rangeRow: {
        flexDirection: 'row',
        gap: spacing.sm
    },
    rangeChip: {
        flex: 1
    },
    chartShell: {
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.sm,
        gap: spacing.sm
    },
    emptyChart: {
        minHeight: CHART_HEIGHT,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.md
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs
    },
    legendSwatch: {
        width: 12,
        height: 8,
        borderRadius: radius.pill
    },
    summary: {
        textAlign: 'center'
    },
    error: {
        color: colors.danger
    }
});
