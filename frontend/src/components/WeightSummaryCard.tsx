import React, { useMemo } from 'react';
import { Alert, Box, Button, Divider, Skeleton, Typography, useMediaQuery } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/useAuth';
import { METRICS_RANGE_OPTIONS } from '../constants/metricsRanges';
import { getTodayIsoDate } from '../utils/date';
import { parseDateOnlyToLocalDate } from '../utils/goalTracking';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useTweenedNumber } from '../hooks/useTweenedNumber';
import SectionHeader from '../ui/SectionHeader';
import AppCard from '../ui/AppCard';
import {
    fetchTrendMetrics,
    findMetricOnOrBeforeDate,
    toDatePart,
    useMetricsQuery,
    type MetricTrendEntry
} from '../queries/metrics';
import { useI18n } from '../i18n/useI18n';

/**
 * Log weight summary card with "as of" context and quick entry CTA.
 */
const EMPTY_VALUE_LABEL = '-';
// Duration used for "date switch" value transitions.
const WEIGHT_SUMMARY_TWEEN_DURATION_MS = 520;
const WEIGHT_ICON_TILE_SIZE_PX = { xs: 48, sm: 56 }; // Icon tile size shrinks slightly on xs to keep the row compact without hurting tap targets.
const WEIGHT_CARD_STACK_GAP = { xs: 1.25, sm: 1.5 }; // Vertical spacing between major rows within the card body.
const WEIGHT_CARD_ROW_GAP = { xs: 1.25, sm: 2 }; // Gap between the icon tile and the text column.
const WEIGHT_CARD_BODY_MARGIN_TOP = { xs: 1.25, sm: 1.5 }; // Space between the header and the card body content.
const WEIGHT_CARD_VALUE_VARIANT = { xs: 'h5', sm: 'h4' } as const; // Larger value treatment makes the latest weigh-in the card anchor.
const WEIGHT_CARD_PADDING_SPACING = { xs: 1.5, sm: 2 }; // Slightly roomier than dense cards so the context scale has enough breathing room.
const WEIGHT_CONTEXT_METRIC_ICON_SIZE_PX = { xs: 18, sm: 20 }; // Metric tile icons shrink on 320px screens so two tiles stay on one row.
const WEIGHT_CONTEXT_TRACK_HEIGHT_PX = 4; // Hairline baseline keeps the range band and markers visually dominant.
const WEIGHT_CONTEXT_RANGE_HEIGHT_PX = 28; // Tall trend band reads as a zone rather than a thin chart series.
const WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX = 18; // Latest point is the primary comparison mark on the context scale.
const WEIGHT_CONTEXT_TREND_MARKER_WIDTH_PX = 3; // Vertical trend estimate remains distinct from circular value markers.
const WEIGHT_CONTEXT_GRAPH_HEIGHT_PX = { xs: 176, sm: 190 }; // Fixed plot height reserves room for range, axis, and marker labels.
const WEIGHT_CONTEXT_TRACK_TOP_PX = { xs: 74, sm: 84 }; // Baseline placement balances the range label above with marker labels below.
const WEIGHT_CONTEXT_DOMAIN_PADDING_RATIO = 0.05; // Adds breathing room when the latest value sits near the trend range edge.
const WEIGHT_CONTEXT_MIN_SPAN_BY_UNIT = { lb: 2, kg: 0.8 }; // Minimum visible domain so tiny fluctuations do not make markers collapse.
const WEIGHT_CONTEXT_MIN_RANGE_WIDTH_PERCENT = 18; // Minimum drawn range width so the band remains visible behind the latest marker.
const WEIGHT_CONTEXT_TREND_MARKER_EXTENSION_PX = 8; // Extends the trend marker beyond the band so it reads as the central estimate.
const WEIGHT_CONTEXT_MARKER_RING_WIDTH_PX = 4; // White halo keeps markers legible over the band and dashed line.
const WEIGHT_CONTEXT_LABEL_MIN_PERCENT = 8; // Floating label clamp prevents edge text from spilling outside the scale.
const WEIGHT_CONTEXT_LABEL_MAX_PERCENT = 92; // Right-side match for the floating label clamp.
const WEIGHT_CONTEXT_MARKER_LABEL_MIN_GAP_PERCENT = 28; // Keeps close trend/latest labels readable on narrow cards.
const WEIGHT_CONTEXT_MARKER_LABEL_TOP_OFFSET_PX = 54; // Distance from the range band to lower marker labels after axis ticks.
const WEIGHT_CONTEXT_AXIS_TICK_HEIGHT_PX = 12; // Short axis ticks make the scale feel measured without becoming a full chart.

export type WeightSummaryCardProps = {
    /**
     * Local date string (`YYYY-MM-DD`) representing the log day currently being viewed.
     *
     * Used to compute the "today" state and determine which day's weight entry the CTA edits.
     */
    date: string;
    /**
     * Called when the user clicks the add/edit weight CTA button.
     *
     * The parent controls the actual modal dialog (WeightEntryForm), so this is just a trigger.
     */
    onOpenWeightEntry: () => void;
    /** Optional wrapper styles used by dashboard grid alignment. */
    sx?: SxProps<Theme>;
};

/**
 * Format a Postgres DATE-ish string for display, falling back to an em dash for invalid inputs.
 */
function formatMetricDateLabel(value: string | null): string {
    if (!value) return EMPTY_VALUE_LABEL;
    const parsed = parseDateOnlyToLocalDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return EMPTY_VALUE_LABEL;
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
}

function isValidTrendMetric(metric: MetricTrendEntry | null): metric is MetricTrendEntry {
    return Boolean(
        metric &&
            Number.isFinite(metric.weight) &&
            Number.isFinite(metric.trend_weight) &&
            Number.isFinite(metric.trend_ci_lower) &&
            Number.isFinite(metric.trend_ci_upper)
    );
}

function findTrendMetricOnOrBeforeDate(metrics: MetricTrendEntry[], targetDate: string): MetricTrendEntry | null {
    for (const metric of metrics) {
        const metricDate = toDatePart(metric.date);
        if (metricDate <= targetDate) return metric;
    }
    return null;
}

function getTrendSnapshotPosition(value: number, min: number, max: number): number {
    if (max <= min) return 50;
    return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

type WeightUnitLabel = 'lb' | 'kg';

type WeightContextDomain = {
    min: number;
    max: number;
};

type WeightContextRange = {
    left: number;
    right: number;
    width: number;
    center: number;
};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Format display-unit weights consistently across the hero value, chips, labels, and ARIA text.
 */
function formatWeightValue(value: number, unitLabel: WeightUnitLabel): string {
    return `${value.toFixed(1)} ${unitLabel}`;
}

/**
 * Format latest-minus-trend deltas with an explicit sign so the relationship is immediately scannable.
 */
function formatSignedWeightDelta(value: number, unitLabel: WeightUnitLabel): string {
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${Math.abs(value).toFixed(1)} ${unitLabel}`;
}

function clampWeightContextLabelPosition(position: number): number {
    return Math.max(WEIGHT_CONTEXT_LABEL_MIN_PERCENT, Math.min(WEIGHT_CONTEXT_LABEL_MAX_PERCENT, position));
}

/**
 * Separate close lower marker labels without moving the actual trend/latest markers on the scale.
 */
function getSeparatedMarkerLabelPositions(leftPosition: number, rightPosition: number): { left: number; right: number } {
    const orderedLeft = Math.min(leftPosition, rightPosition);
    const orderedRight = Math.max(leftPosition, rightPosition);
    if (orderedRight - orderedLeft >= WEIGHT_CONTEXT_MARKER_LABEL_MIN_GAP_PERCENT) {
        return {
            left: clampWeightContextLabelPosition(orderedLeft),
            right: clampWeightContextLabelPosition(orderedRight)
        };
    }

    const midpoint = (orderedLeft + orderedRight) / 2;
    const halfGap = WEIGHT_CONTEXT_MARKER_LABEL_MIN_GAP_PERCENT / 2;
    let left = midpoint - halfGap;
    let right = midpoint + halfGap;

    if (left < WEIGHT_CONTEXT_LABEL_MIN_PERCENT) {
        right += WEIGHT_CONTEXT_LABEL_MIN_PERCENT - left;
        left = WEIGHT_CONTEXT_LABEL_MIN_PERCENT;
    }
    if (right > WEIGHT_CONTEXT_LABEL_MAX_PERCENT) {
        left -= right - WEIGHT_CONTEXT_LABEL_MAX_PERCENT;
        right = WEIGHT_CONTEXT_LABEL_MAX_PERCENT;
    }

    return { left, right };
}

/**
 * Build a padded one-dimensional domain around the latest, trend, range, and optional goal values.
 */
function getWeightContextDomain(values: number[], unitLabel: WeightUnitLabel): WeightContextDomain {
    const finiteValues = values.filter(isFiniteNumber);
    const fallbackSpan = WEIGHT_CONTEXT_MIN_SPAN_BY_UNIT[unitLabel];
    if (finiteValues.length === 0) {
        return { min: 0, max: fallbackSpan };
    }

    const rawMin = Math.min(...finiteValues);
    const rawMax = Math.max(...finiteValues);
    const center = (rawMin + rawMax) / 2;
    const visibleSpan = Math.max(fallbackSpan, rawMax - rawMin);
    const paddedSpan = visibleSpan * (1 + WEIGHT_CONTEXT_DOMAIN_PADDING_RATIO * 2);

    return {
        min: center - paddedSpan / 2,
        max: center + paddedSpan / 2
    };
}

/**
 * Draw a minimum-width trend range so very tight confidence bounds stay visible under the latest point.
 */
function getVisibleTrendRange(rangeLeft: number, rangeRight: number): WeightContextRange {
    const orderedLeft = Math.min(rangeLeft, rangeRight);
    const orderedRight = Math.max(rangeLeft, rangeRight);
    const actualWidth = orderedRight - orderedLeft;

    if (actualWidth >= WEIGHT_CONTEXT_MIN_RANGE_WIDTH_PERCENT) {
        return {
            left: orderedLeft,
            right: orderedRight,
            width: actualWidth,
            center: (orderedLeft + orderedRight) / 2
        };
    }

    const width = Math.min(100, WEIGHT_CONTEXT_MIN_RANGE_WIDTH_PERCENT);
    const center = (orderedLeft + orderedRight) / 2;
    const left = Math.max(0, Math.min(100 - width, center - width / 2));
    const right = left + width;

    return {
        left,
        right,
        width,
        center: (left + right) / 2
    };
}

/**
 * Compact metric tile for the latest-vs-trend summary.
 */
const WeightContextMetricChip: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
}> = ({ icon, label, value }) => {
    const theme = useTheme();
    const color = theme.palette.primary.main;

    return (
        <Box
            sx={{
                minWidth: 0,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 0.75, sm: 1 },
                px: { xs: 0.75, sm: 1.25 },
                py: 1,
                borderRadius: 2,
                bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.18 : 0.08),
                border: `1px solid ${alpha(color, theme.palette.mode === 'dark' ? 0.28 : 0.12)}`,
                '& .MuiSvgIcon-root': {
                    fontSize: WEIGHT_CONTEXT_METRIC_ICON_SIZE_PX
                }
            }}
        >
            <Box sx={{ display: 'flex', color, flex: '0 0 auto' }}>
                {icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    variant="subtitle2"
                    sx={{
                        color,
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        fontSize: { xs: '0.875rem', sm: '0.9375rem' }
                    }}
                >
                    {value}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.2 }}>
                    {label}
                </Typography>
            </Box>
        </Box>
    );
};

const WeightTrendSnapshot: React.FC<{
    metric: MetricTrendEntry | null;
    measurementLabel: string;
    isLoading: boolean;
    unitLabel: WeightUnitLabel;
}> = ({ metric, measurementLabel, isLoading, unitLabel }) => {
    const { t } = useI18n();
    const theme = useTheme();

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Skeleton width="38%" height={22} />
                <Skeleton variant="rounded" height={WEIGHT_CONTEXT_GRAPH_HEIGHT_PX.xs} />
                <Skeleton variant="rounded" height={40} />
            </Box>
        );
    }

    if (!isValidTrendMetric(metric)) return null;

    const rangeLower = Math.min(metric.trend_ci_lower, metric.trend_ci_upper);
    const rangeUpper = Math.max(metric.trend_ci_lower, metric.trend_ci_upper);
    const rawWeight = metric.weight;
    const trendWeight = metric.trend_weight;
    const domain = getWeightContextDomain([rangeLower, rangeUpper, rawWeight, trendWeight], unitLabel);
    const domainMin = domain.min;
    const domainMax = domain.max;
    const rangeLeft = getTrendSnapshotPosition(rangeLower, domainMin, domainMax);
    const rangeRight = getTrendSnapshotPosition(rangeUpper, domainMin, domainMax);
    const visibleRange = getVisibleTrendRange(rangeLeft, rangeRight);
    const trendPosition = getTrendSnapshotPosition(trendWeight, domainMin, domainMax);
    const pointPosition = getTrendSnapshotPosition(rawWeight, domainMin, domainMax);
    const trendDelta = rawWeight - trendWeight;
    const rangeLabelPosition = clampWeightContextLabelPosition(visibleRange.center);
    const orderedMarkerLabelPositions = getSeparatedMarkerLabelPositions(trendPosition, pointPosition);
    const trendLabelPosition =
        trendPosition <= pointPosition ? orderedMarkerLabelPositions.left : orderedMarkerLabelPositions.right;
    const pointLabelPosition =
        trendPosition <= pointPosition ? orderedMarkerLabelPositions.right : orderedMarkerLabelPositions.left;
    const rangeLabel = t('weightSummary.trendSnapshot.range', {
        low: rangeLower.toFixed(1),
        high: rangeUpper.toFixed(1),
        unit: unitLabel
    });
    const trendLabel = t('weightSummary.trendSnapshot.trend', {
        value: trendWeight.toFixed(1),
        unit: unitLabel
    });
    const pointLabel = t('weightSummary.trendSnapshot.point', {
        value: rawWeight.toFixed(1),
        unit: unitLabel
    });
    const trendDeltaLabel = formatSignedWeightDelta(trendDelta, unitLabel);
    const latestWeightLabel = formatWeightValue(rawWeight, unitLabel);
    const trendWeightLabel = formatWeightValue(trendWeight, unitLabel);
    const domainMinLabel = formatWeightValue(domainMin, unitLabel);
    const domainMaxLabel = formatWeightValue(domainMax, unitLabel);
    const lowerRangeLabel = formatWeightValue(rangeLower, unitLabel);
    const upperRangeLabel = formatWeightValue(rangeUpper, unitLabel);
    const TrendDeltaIcon = trendDelta < 0 ? TrendingDownRoundedIcon : TrendingUpRoundedIcon;
    const markerLabelTop = {
        xs: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.xs}px + ${WEIGHT_CONTEXT_MARKER_LABEL_TOP_OFFSET_PX}px)`,
        sm: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.sm}px + ${WEIGHT_CONTEXT_MARKER_LABEL_TOP_OFFSET_PX}px)`
    };
    const axisLabels = [
        { key: 'min', label: domainMinLabel, position: 0 },
        { key: 'rangeLower', label: lowerRangeLabel, position: rangeLeft },
        { key: 'trend', label: trendWeightLabel, position: trendPosition },
        { key: 'rangeUpper', label: upperRangeLabel, position: rangeRight },
        { key: 'max', label: domainMaxLabel, position: 100 }
    ];

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
                pt: 0.5
            }}
        >
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {t('weightSummary.trendSnapshot.title')}
            </Typography>
            <Box
                sx={{
                    display: 'flex',
                    width: { xs: '100%', sm: 260 },
                    maxWidth: '100%'
                }}
            >
                <WeightContextMetricChip
                    icon={<TrendDeltaIcon fontSize="small" />}
                    label={t('weightSummary.trendSnapshot.vsTrend')}
                    value={trendDeltaLabel}
                />
            </Box>
            <Box
                role="img"
                aria-label={t('weightSummary.trendSnapshot.ariaLabel', {
                    range: rangeLabel,
                    trend: trendLabel,
                    point: pointLabel
                })}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.75,
                    mt: { xs: 0.25, sm: 0.75 }
                }}
            >
                <Box
                    sx={{
                        position: 'relative',
                        height: WEIGHT_CONTEXT_GRAPH_HEIGHT_PX,
                        mx: { xs: 0.25, sm: 1.5 }
                    }}
                >
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: `0 ${WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX / 2}px`
                        }}
                    >
                        <Box
                            sx={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                top: WEIGHT_CONTEXT_TRACK_TOP_PX,
                                height: WEIGHT_CONTEXT_TRACK_HEIGHT_PX,
                                transform: 'translateY(-50%)',
                                borderRadius: 999,
                                bgcolor: (innerTheme) =>
                                    alpha(innerTheme.palette.text.primary, innerTheme.palette.mode === 'dark' ? 0.2 : 0.15)
                            }}
                        />
                        <Box
                            sx={{
                                position: 'absolute',
                                left: `${visibleRange.left}%`,
                                width: `${visibleRange.width}%`,
                                top: WEIGHT_CONTEXT_TRACK_TOP_PX,
                                height: WEIGHT_CONTEXT_RANGE_HEIGHT_PX,
                                transform: 'translateY(-50%)',
                                borderRadius: 2,
                                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.34 : 0.16),
                                border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.5 : 0.24)}`
                            }}
                        />
                        {[
                            { key: 'lower', position: rangeLeft },
                            { key: 'upper', position: rangeRight }
                        ].map((rangeBoundary) => (
                            <Box
                                key={rangeBoundary.key}
                                sx={{
                                    position: 'absolute',
                                    left: `${rangeBoundary.position}%`,
                                    top: {
                                        xs: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.xs}px - ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2}px)`,
                                        sm: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.sm}px - ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2}px)`
                                    },
                                    height: WEIGHT_CONTEXT_RANGE_HEIGHT_PX,
                                    borderLeft: `2px dashed ${alpha(theme.palette.primary.dark, theme.palette.mode === 'dark' ? 0.72 : 0.58)}`,
                                    transform: 'translateX(-50%)',
                                    zIndex: 2
                                }}
                            />
                        ))}
                        <Box
                            sx={{
                                position: 'absolute',
                                left: `${trendPosition}%`,
                                top: {
                                    xs: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.xs}px - ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2 + WEIGHT_CONTEXT_TREND_MARKER_EXTENSION_PX}px)`,
                                    sm: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.sm}px - ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2 + WEIGHT_CONTEXT_TREND_MARKER_EXTENSION_PX}px)`
                                },
                                height: WEIGHT_CONTEXT_RANGE_HEIGHT_PX + WEIGHT_CONTEXT_TREND_MARKER_EXTENSION_PX * 2,
                                width: WEIGHT_CONTEXT_TREND_MARKER_WIDTH_PX,
                                transform: 'translateX(-50%)',
                                borderRadius: 999,
                                bgcolor: 'primary.dark',
                                zIndex: 3
                            }}
                        />
                        <Box
                            sx={{
                                position: 'absolute',
                                left: `${trendPosition}%`,
                                top: WEIGHT_CONTEXT_TRACK_TOP_PX,
                                width: WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX,
                                height: WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX,
                                transform: 'translate(-50%, -50%)',
                                borderRadius: '50%',
                                bgcolor: 'primary.dark',
                                boxShadow: (innerTheme) =>
                                    `0 0 0 ${WEIGHT_CONTEXT_MARKER_RING_WIDTH_PX}px ${alpha(innerTheme.palette.background.paper, 0.88)}`,
                                zIndex: 4
                            }}
                        />
                        <Box
                            sx={{
                                position: 'absolute',
                                left: `${pointPosition}%`,
                                top: {
                                    xs: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.xs}px - ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2 + WEIGHT_CONTEXT_TREND_MARKER_EXTENSION_PX}px)`,
                                    sm: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.sm}px - ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2 + WEIGHT_CONTEXT_TREND_MARKER_EXTENSION_PX}px)`
                                },
                                height: WEIGHT_CONTEXT_RANGE_HEIGHT_PX + WEIGHT_CONTEXT_TREND_MARKER_EXTENSION_PX * 2,
                                width: WEIGHT_CONTEXT_TREND_MARKER_WIDTH_PX - 1,
                                transform: 'translateX(-50%)',
                                borderRadius: 999,
                                bgcolor: 'secondary.dark',
                                zIndex: 3
                            }}
                        />
                        <Box
                            sx={{
                                position: 'absolute',
                                left: `${pointPosition}%`,
                                top: WEIGHT_CONTEXT_TRACK_TOP_PX,
                                width: WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX,
                                height: WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX,
                                transform: 'translate(-50%, -50%)',
                                borderRadius: '50%',
                                bgcolor: 'secondary.dark',
                                boxShadow: (innerTheme) =>
                                    `0 0 0 ${WEIGHT_CONTEXT_MARKER_RING_WIDTH_PX}px ${alpha(innerTheme.palette.background.paper, 0.88)}`,
                                zIndex: 4
                            }}
                        />
                        <Box
                            sx={{
                                position: 'absolute',
                                left: `${rangeLabelPosition}%`,
                                top: { xs: 2, sm: 4 },
                                transform: 'translateX(-50%)',
                                textAlign: 'center',
                                minWidth: { xs: 120, sm: 140 },
                                color: 'primary.dark',
                                zIndex: 5
                            }}
                        >
                            <Typography variant="subtitle2" sx={{ lineHeight: 1.1 }}>
                                {t('weightSummary.trendSnapshot.rangeLabel')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'primary.dark', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                                {rangeLabel}
                            </Typography>
                        </Box>
                        {axisLabels.map((tick) => (
                            <React.Fragment key={tick.key}>
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        left: `${tick.position}%`,
                                        top: {
                                            xs: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.xs}px + ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2}px)`,
                                            sm: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.sm}px + ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2}px)`
                                        },
                                        height: WEIGHT_CONTEXT_AXIS_TICK_HEIGHT_PX,
                                        borderLeft: (innerTheme) =>
                                            `2px solid ${alpha(innerTheme.palette.text.primary, innerTheme.palette.mode === 'dark' ? 0.35 : 0.28)}`,
                                        transform: 'translateX(-50%)',
                                        zIndex: 2
                                    }}
                                />
                                <Typography
                                    variant="caption"
                                    sx={{
                                        position: 'absolute',
                                        left: `${clampWeightContextLabelPosition(tick.position)}%`,
                                        top: {
                                            xs: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.xs}px + ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2 + 14}px)`,
                                            sm: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.sm}px + ${WEIGHT_CONTEXT_RANGE_HEIGHT_PX / 2 + 14}px)`
                                        },
                                        transform: 'translateX(-50%)',
                                        color: 'text.secondary',
                                        fontWeight: 600,
                                        lineHeight: 1.15,
                                        whiteSpace: 'nowrap',
                                        fontSize: { xs: '0.6875rem', sm: '0.75rem' },
                                        zIndex: 2
                                    }}
                                >
                                    {tick.label}
                                </Typography>
                            </React.Fragment>
                        ))}
                        {[
                            {
                                key: 'trend',
                                label: t('weightSummary.trendSnapshot.trendMarkerLabel'),
                                labelPosition: trendLabelPosition,
                                markerPosition: trendPosition,
                                value: trendWeightLabel,
                                color: theme.palette.primary.dark
                            },
                            {
                                key: 'point',
                                label: measurementLabel,
                                labelPosition: pointLabelPosition,
                                markerPosition: pointPosition,
                                value: latestWeightLabel,
                                color: theme.palette.secondary.dark
                            }
                        ].map((marker) => (
                            <React.Fragment key={marker.key}>
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        left: `${marker.markerPosition}%`,
                                        top: {
                                            xs: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.xs}px + ${WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX / 2}px)`,
                                            sm: `calc(${WEIGHT_CONTEXT_TRACK_TOP_PX.sm}px + ${WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX / 2}px)`
                                        },
                                        height: {
                                            xs: `calc(${WEIGHT_CONTEXT_MARKER_LABEL_TOP_OFFSET_PX}px - ${WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX / 2}px)`,
                                            sm: `calc(${WEIGHT_CONTEXT_MARKER_LABEL_TOP_OFFSET_PX}px - ${WEIGHT_CONTEXT_LATEST_MARKER_SIZE_PX / 2}px)`
                                        },
                                        width: WEIGHT_CONTEXT_TREND_MARKER_WIDTH_PX,
                                        transform: 'translateX(-50%)',
                                        borderRadius: 999,
                                        bgcolor: marker.color,
                                        zIndex: 3
                                    }}
                                />
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        left: `${marker.labelPosition}%`,
                                        top: markerLabelTop,
                                        transform: 'translateX(-50%)',
                                        textAlign: 'center',
                                        minWidth: { xs: 58, sm: 72 },
                                        color: marker.color,
                                        zIndex: 5
                                    }}
                                >
                                    <Typography variant="subtitle2" sx={{ lineHeight: 1.1 }}>
                                        {marker.label}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: marker.color, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                                        {marker.value}
                                    </Typography>
                                </Box>
                            </React.Fragment>
                        ))}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

const WeightIconTile: React.FC<{ sizePx: number }> = ({ sizePx }) => (
    <Box
        sx={{
            width: sizePx,
            height: sizePx,
            borderRadius: 2,
            backgroundColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.08),
            border: (theme) => `1px solid ${theme.palette.divider}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}
        aria-hidden
    >
        <MonitorWeightIcon color="primary" />
    </Box>
);

/**
 * WeightSummaryCard
 *
 * Dense weight summary card for the Log page.
 *
 * - Shows a large "current weight" value plus an "As of {date}" line to make recency obvious.
 * - Adds a compact trend snapshot so the Log tab carries the app's smoothing/range context.
 */
const WeightSummaryCard: React.FC<WeightSummaryCardProps> = ({ date, onOpenWeightEntry, sx }) => {
    const { user } = useAuth();
    const { t } = useI18n();
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.down('sm'));
    const iconTileSizePx = isXs ? WEIGHT_ICON_TILE_SIZE_PX.xs : WEIGHT_ICON_TILE_SIZE_PX.sm;
    const stackGap = isXs ? WEIGHT_CARD_STACK_GAP.xs : WEIGHT_CARD_STACK_GAP.sm;
    const rowGap = isXs ? WEIGHT_CARD_ROW_GAP.xs : WEIGHT_CARD_ROW_GAP.sm;
    const bodyMarginTop = isXs ? WEIGHT_CARD_BODY_MARGIN_TOP.xs : WEIGHT_CARD_BODY_MARGIN_TOP.sm;
    const valueVariant = isXs ? WEIGHT_CARD_VALUE_VARIANT.xs : WEIGHT_CARD_VALUE_VARIANT.sm;
    const ctaSize = isXs ? 'large' : 'medium';
    const unitLabel: WeightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const today = useMemo(() => getTodayIsoDate(user?.timezone), [user?.timezone]);
    const isToday = date === today;

    const metricsQuery = useMetricsQuery();

    const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);
    const trendMetricsQuery = useQuery({
        queryKey: ['metrics', 'trend', METRICS_RANGE_OPTIONS.ALL],
        queryFn: async () => fetchTrendMetrics({ range: METRICS_RANGE_OPTIONS.ALL })
    });
    const trendMetrics = useMemo(() => trendMetricsQuery.data?.metrics ?? [], [trendMetricsQuery.data]);

    const metricForSelectedDate = useMemo(() => {
        return metrics.find((metric) => toDatePart(metric.date) === date) ?? null;
    }, [date, metrics]);

    const displayedMetric = useMemo(() => {
        if (metricForSelectedDate) return metricForSelectedDate;
        return findMetricOnOrBeforeDate(metrics, date);
    }, [date, metricForSelectedDate, metrics]);
    const displayedTrendMetric = useMemo(() => {
        const exactMetric = trendMetrics.find((metric) => toDatePart(metric.date) === toDatePart(displayedMetric?.date ?? date)) ?? null;
        return exactMetric ?? findTrendMetricOnOrBeforeDate(trendMetrics, date);
    }, [date, displayedMetric?.date, trendMetrics]);
    const latestMetricDate = metrics[0]?.date ? toDatePart(metrics[0].date) : null;
    const displayedMetricDate = displayedMetric?.date ? toDatePart(displayedMetric.date) : null;
    const measurementLabel = displayedMetricDate && latestMetricDate && displayedMetricDate === latestMetricDate
        ? t('weightSummary.trendSnapshot.latestLabel')
        : t('weightSummary.trendSnapshot.entryLabel');

    const prefersReducedMotion = usePrefersReducedMotion();
    const displayedWeight = displayedMetric?.weight ?? null;
    const animatedWeight = useTweenedNumber(displayedWeight ?? 0, {
        durationMs: WEIGHT_SUMMARY_TWEEN_DURATION_MS,
        disabled: prefersReducedMotion || metricsQuery.isLoading || metricsQuery.isError || displayedWeight === null
    });

    const ctaLabel = useMemo(() => {
        if (isToday) {
            return metricForSelectedDate ? t('weightSummary.cta.editToday') : t('weightSummary.cta.logToday');
        }
        return metricForSelectedDate ? t('weightSummary.cta.edit') : t('weightSummary.cta.log');
    }, [isToday, metricForSelectedDate, t]);

    const displayedWeightLabel = displayedWeight !== null ? `${animatedWeight.toFixed(1)} ${unitLabel}` : EMPTY_VALUE_LABEL;
    const asOfLabel = formatMetricDateLabel(displayedMetric?.date ?? null);
    const WeightCtaIcon = metricForSelectedDate ? EditRoundedIcon : AddRoundedIcon;
    const ctaVariant = metricForSelectedDate ? 'outlined' : 'contained';
    const trendSnapshotSection = trendMetricsQuery.isLoading || isValidTrendMetric(displayedTrendMetric) ? (
        <>
            <Divider />
            <WeightTrendSnapshot
                metric={displayedTrendMetric}
                measurementLabel={measurementLabel}
                isLoading={trendMetricsQuery.isLoading}
                unitLabel={unitLabel}
            />
        </>
    ) : null;

    let cardBody: React.ReactNode;
    if (metricsQuery.isLoading) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: stackGap }}>
                <Box
                    sx={{
                        display: 'grid',
                        alignItems: 'center',
                        gap: { xs: 1.25, sm: rowGap },
                        gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: rowGap, minWidth: 0 }}>
                        <WeightIconTile sizePx={iconTileSizePx} />

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexGrow: 1, minWidth: 0 }}>
                            <Skeleton width="44%" height={40} />
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                                <Typography variant="body2" sx={{
                                    color: "text.secondary"
                                }}>
                                    {t('weightSummary.asOf')}
                                </Typography>
                                <Skeleton width="35%" height={20} />
                            </Box>
                        </Box>
                    </Box>

                    <Skeleton variant="rounded" height={isXs ? 44 : 40} width={isXs ? '100%' : 184} />
                </Box>
                {trendSnapshotSection}
            </Box>
        );
    } else if (metricsQuery.isError) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Alert severity="warning">{t('weightSummary.error.unableToLoad')}</Alert>
                <Box sx={{ display: 'flex', justifyContent: isXs ? 'stretch' : 'flex-end', width: '100%' }}>
                    <Button
                        variant={ctaVariant}
                        size={ctaSize}
                        startIcon={<WeightCtaIcon />}
                        onClick={onOpenWeightEntry}
                        fullWidth={isXs}
                    >
                        {ctaLabel}
                    </Button>
                </Box>
                {trendSnapshotSection}
            </Box>
        );
    } else {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: stackGap }}>
                <Box
                    sx={{
                        display: 'grid',
                        alignItems: 'center',
                        gap: { xs: 1.25, sm: rowGap },
                        gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: rowGap, minWidth: 0 }}>
                        <WeightIconTile sizePx={iconTileSizePx} />

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexGrow: 1, minWidth: 0 }}>
                            <Typography variant={valueVariant} sx={{ lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                                {displayedWeightLabel}
                            </Typography>
                            <Typography variant="body2" sx={{
                                color: "text.secondary"
                            }}>
                                {t('weightSummary.asOfWithDate', { date: asOfLabel })}
                            </Typography>
                        </Box>
                    </Box>

                    <Button
                        variant={ctaVariant}
                        size={ctaSize}
                        startIcon={<WeightCtaIcon />}
                        onClick={onOpenWeightEntry}
                        fullWidth={isXs}
                        sx={{ justifySelf: { xs: 'stretch', sm: 'end' } }}
                    >
                        {ctaLabel}
                    </Button>
                </Box>
                {trendSnapshotSection}
            </Box>
        );
    }

    return (
        <AppCard
            sx={sx}
            contentSx={{
                p: WEIGHT_CARD_PADDING_SPACING,
                '&:last-child': { pb: WEIGHT_CARD_PADDING_SPACING }
            }}
        >
            <SectionHeader title={t('weightSummary.title')} titleVariant="h5" align="center" />

            <Box sx={{ mt: bodyMarginTop }}>{cardBody}</Box>
        </AppCard>
    );
};

export default WeightSummaryCard;
