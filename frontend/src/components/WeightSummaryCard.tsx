import React, { useMemo } from 'react';
import { Alert, Box, Button, Chip, Divider, Skeleton, Typography, useMediaQuery } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
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
import { fetchTrendMetrics, findMetricOnOrBeforeDate, toDatePart, useMetricsQuery, type MetricTrendEntry } from '../queries/metrics';
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
const WEIGHT_CARD_VALUE_VARIANT = { xs: 'h6', sm: 'h5' } as const; // Use a slightly smaller headline on xs so the row layout stays compact.
const WEIGHT_CARD_PADDING_SPACING = { xs: 1.25, sm: 1.5 }; // Reduce padding on xs to free up more space for the log content below.
const TREND_SNAPSHOT_TRACK_HEIGHT_PX = 8; // Thin baseline keeps the range graphic compact inside the log card.
const TREND_SNAPSHOT_RANGE_HEIGHT_PX = 20; // Range band height is large enough to read without feeling like a full chart.
const TREND_SNAPSHOT_MARKER_SIZE_PX = 8; // Small diamond marker reads as a measurement, not an interactive slider handle.
const TREND_SNAPSHOT_TREND_MARKER_WIDTH_PX = 3; // Trend marker is a vertical estimate line, distinct from the raw point.
const TREND_SNAPSHOT_DOMAIN_PADDING_RATIO = 0.12; // Adds breathing room when the raw point sits near the range edge.
const TREND_SNAPSHOT_GRAPH_HEIGHT_PX = 44; // Keeps the one-dimensional trend view compact and avoids looking like a control.
const TREND_SNAPSHOT_LEGEND_SWATCH_SIZE_PX = 9; // Small labels clarify the marks without dominating the card.

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

const WeightTrendSnapshot: React.FC<{
    metric: MetricTrendEntry | null;
    isLoading: boolean;
    unitLabel: string;
}> = ({ metric, isLoading, unitLabel }) => {
    const { t } = useI18n();
    const theme = useTheme();

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Skeleton width="38%" height={22} />
                <Skeleton variant="rounded" height={50} />
            </Box>
        );
    }

    if (!isValidTrendMetric(metric)) return null;

    const rangeLower = Math.min(metric.trend_ci_lower, metric.trend_ci_upper);
    const rangeUpper = Math.max(metric.trend_ci_lower, metric.trend_ci_upper);
    const rawWeight = metric.weight;
    const trendWeight = metric.trend_weight;
    const rawMin = Math.min(rangeLower, rangeUpper, rawWeight, trendWeight);
    const rawMax = Math.max(rangeLower, rangeUpper, rawWeight, trendWeight);
    const rawRange = Math.max(0.1, rawMax - rawMin);
    const domainMin = rawMin - rawRange * TREND_SNAPSHOT_DOMAIN_PADDING_RATIO;
    const domainMax = rawMax + rawRange * TREND_SNAPSHOT_DOMAIN_PADDING_RATIO;
    const rangeLeft = getTrendSnapshotPosition(rangeLower, domainMin, domainMax);
    const rangeRight = getTrendSnapshotPosition(rangeUpper, domainMin, domainMax);
    const trendPosition = getTrendSnapshotPosition(trendWeight, domainMin, domainMax);
    const pointPosition = getTrendSnapshotPosition(rawWeight, domainMin, domainMax);
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

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
                pt: 0.5
            }}
        >
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {t('weightSummary.trendSnapshot.title')}
            </Typography>
            <Box
                role="img"
                aria-label={t('weightSummary.trendSnapshot.ariaLabel', {
                    range: rangeLabel,
                    trend: trendLabel,
                    point: pointLabel
                })}
                sx={{
                    position: 'relative',
                    height: TREND_SNAPSHOT_GRAPH_HEIGHT_PX
                }}
            >
                <Box
                    sx={{
                        position: 'absolute',
                        inset: `0 ${TREND_SNAPSHOT_MARKER_SIZE_PX / 2}px`,
                        top: 0,
                        bottom: 0
                    }}
                >
                    <Box
                        sx={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '50%',
                            height: TREND_SNAPSHOT_TRACK_HEIGHT_PX,
                            transform: 'translateY(-50%)',
                            borderRadius: 999,
                            bgcolor: 'divider'
                        }}
                    />
                    <Box
                        sx={{
                            position: 'absolute',
                            left: `${rangeLeft}%`,
                            width: `${Math.max(2, rangeRight - rangeLeft)}%`,
                            top: '50%',
                            height: TREND_SNAPSHOT_RANGE_HEIGHT_PX,
                            transform: 'translateY(-50%)',
                            borderRadius: 999,
                            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.42 : 0.24),
                            border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.52 : 0.3)}`
                        }}
                    />
                    <Box
                        sx={{
                            position: 'absolute',
                            left: `${trendPosition}%`,
                            top: 6,
                            bottom: 6,
                            width: TREND_SNAPSHOT_TREND_MARKER_WIDTH_PX,
                            transform: 'translateX(-50%)',
                            borderRadius: 999,
                            bgcolor: 'primary.dark'
                        }}
                    />
                    <Box
                        sx={{
                            position: 'absolute',
                            left: `${pointPosition}%`,
                            top: '50%',
                            width: TREND_SNAPSHOT_MARKER_SIZE_PX,
                            height: TREND_SNAPSHOT_MARKER_SIZE_PX,
                            transform: 'translate(-50%, -50%) rotate(45deg)',
                            bgcolor: 'secondary.main'
                        }}
                    />
                </Box>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 0.75, sm: 1.25 }, alignItems: 'center' }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                        aria-hidden
                        sx={{
                            width: TREND_SNAPSHOT_LEGEND_SWATCH_SIZE_PX + 8,
                            height: TREND_SNAPSHOT_LEGEND_SWATCH_SIZE_PX,
                            borderRadius: 999,
                            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.42 : 0.24)
                        }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        {rangeLabel}
                    </Typography>
                </Box>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                        aria-hidden
                        sx={{
                            width: TREND_SNAPSHOT_TREND_MARKER_WIDTH_PX,
                            height: TREND_SNAPSHOT_LEGEND_SWATCH_SIZE_PX + 5,
                            borderRadius: 999,
                            bgcolor: 'primary.dark'
                        }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        {trendLabel}
                    </Typography>
                </Box>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                        aria-hidden
                        sx={{
                            width: TREND_SNAPSHOT_LEGEND_SWATCH_SIZE_PX,
                            height: TREND_SNAPSHOT_LEGEND_SWATCH_SIZE_PX,
                            transform: 'rotate(45deg)',
                            bgcolor: 'secondary.main'
                        }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        {pointLabel}
                    </Typography>
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
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
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
    const doneTodayChip = isToday && metricForSelectedDate && !metricsQuery.isLoading && !metricsQuery.isError ? (
        <Chip
            size="small"
            color="success"
            variant="outlined"
            label={t('weightSummary.chip.doneToday')}
        />
    ) : null;

    let cardBody: React.ReactNode;
    if (metricsQuery.isLoading) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: stackGap }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: rowGap,
                        flexDirection: 'row'
                    }}
                >
                    <WeightIconTile sizePx={iconTileSizePx} />

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexGrow: 1, minWidth: 0 }}>
                        <Skeleton width="40%" height={32} />
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

                <Box sx={{ display: 'flex', justifyContent: isXs ? 'stretch' : 'flex-end', width: '100%' }}>
                    <Skeleton variant="rounded" height={isXs ? 44 : 36} width={isXs ? '100%' : 156} />
                </Box>
                <Divider />
                <WeightTrendSnapshot metric={null} isLoading unitLabel={unitLabel} />
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
                <Divider />
                <WeightTrendSnapshot metric={displayedTrendMetric} isLoading={trendMetricsQuery.isLoading} unitLabel={unitLabel} />
            </Box>
        );
    } else {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: stackGap }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: rowGap,
                        flexDirection: 'row'
                    }}
                >
                    <WeightIconTile sizePx={iconTileSizePx} />

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexGrow: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant={valueVariant} sx={{ lineHeight: 1.1 }}>
                                {displayedWeightLabel}
                            </Typography>
                            {doneTodayChip}
                        </Box>
                        <Typography variant="body2" sx={{
                            color: "text.secondary"
                        }}>
                            {t('weightSummary.asOfWithDate', { date: asOfLabel })}
                        </Typography>
                    </Box>
                </Box>

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
                <Divider />
                <WeightTrendSnapshot metric={displayedTrendMetric} isLoading={trendMetricsQuery.isLoading} unitLabel={unitLabel} />
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
            <SectionHeader title={t('weightSummary.title')} align="center" />

            <Box sx={{ mt: bodyMarginTop }}>{cardBody}</Box>
        </AppCard>
    );
};

export default WeightSummaryCard;
