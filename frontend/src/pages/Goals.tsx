import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    IconButton,
    Skeleton,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
    useMediaQuery
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import GoalTrackerCard from '../components/GoalTrackerCard';
import { useAuth } from '../context/useAuth';
import { parseDateOnlyToLocalDate, startOfLocalDay } from '../utils/goalTracking';
import { addDaysToIsoDate, MS_PER_DAY } from '../utils/date';
import { METRICS_RANGE_OPTIONS, type MetricsRange } from '../constants/metricsRanges';
import { fetchTrendMetrics } from '../queries/metrics';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import { useI18n } from '../i18n/useI18n';

/**
 * Goals page with progress card and weight history chart.
 */
type GoalResponse = {
    id: number;
    user_id: number;
    start_weight: number;
    target_weight: number;
    target_date: string | null;
    daily_deficit: number;
    created_at: string;
};

type WeightPoint = {
    date: Date;
    rawWeight: number;
    trendWeight: number;
    rangeLower: number;
    rangeUpper: number;
};
type ChartPoint = {
    date: Date;
    rawWeight: number | null;
    trendWeight: number | null;
    rangeLower: number | null;
    rangeUpper: number | null;
};

const RANGE_CONTROL_MIN_POINTS = 45; // Minimum number of points before showing the range control.
const RANGE_CONTROL_MIN_DAYS = 45; // Minimum span (in days) before showing the range control.
const CONTROLS_ROW_GAP = 1.5; // Spacing between weight history controls when wrapping.
const CHART_HEIGHT_PX = 320; // Fixed chart height for consistent card layout.
const LEGEND_SWATCH_SIZE_PX = 12; // Square legend swatch size used for dots/area chips.
const CHART_GAP_BREAK_DAYS = 21; // Break line/area segments when logs are sparse to avoid misleading interpolation across long gaps.
const TREND_LINE_STROKE_WIDTH_PX = 4; // Emphasize trend as the primary signal.
const RAW_LINE_STROKE_WIDTH_PX = 2; // Keep daily measurements visible but secondary to the trend.
const RAW_LINE_ALPHA = 0.6; // Reduce visual dominance of noisy day-to-day measurements.
const EXPECTED_RANGE_FILL_ALPHA = 0.065; // Keep expected range visible on light backgrounds without overpowering lines.
const EXPECTED_RANGE_EDGE_ALPHA = 0.14; // Subtle edge improves band readability against white chart backgrounds.
const RAW_MARK_STROKE_WIDTH_PX = 1.5; // Soften marker outlines to reduce clutter on dense histories.
const WEIGHT_HISTORY_TOOLTIP_MAX_WIDTH_PX = 340; // Maintain readable tooltip wrapping on mobile and desktop.
const CHART_CARD_PADDING_X_SPACING = { xs: 0.75, sm: 2 }; // Tighten xs side padding so the chart can occupy more horizontal space.
const CHART_EDGE_BLEED_X_SPACING = { xs: -0.75, sm: 0 }; // Reclaim a slice of card padding on xs for a near full-bleed chart viewport.
const CHART_MARGIN_COMPACT = { top: 12, right: 8, bottom: 32, left: 42 }; // Compact axis margin tuning for small phones.
const CHART_MARGIN_DEFAULT = { top: 12, right: 12, bottom: 32, left: 50 }; // Desktop/tablet axis margin with comfortable label space.
const RANGE_TOGGLE_TOUCH_HEIGHT_PX = 40; // Increase xs/sm touch target height for the range controls.
const PAN_WINDOW_LABEL_MIN_WIDTH_CH = 19; // Keep the window label width stable so controls do not shift as dates change.
const PAN_WINDOW_CONTROLS_GAP = 0.75; // Tight icon/label spacing keeps the pan row compact while preserving touch affordance.
const CHART_LINE_ANIMATION_DURATION_MS = 420; // Approximate x-domain transition duration for expanding windows.
const RAW_MARK_REVEAL_BUFFER_MS = 190; // Extra delay so marks appear after the line fully settles (including slowdown tail).
const RAW_MARK_FADE_IN_DURATION_MS = 640; // Slower reveal to feel like a true settle instead of a snap.
const RAW_MARK_FADE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'; // Ease-out curve with a gentle finish.
const RAW_MARK_HIDDEN_SCALE = 0.74; // Slightly shrink hidden marks so the reveal feels softer than a hard opacity toggle.

type PannableMetricsRange = Exclude<MetricsRange, typeof METRICS_RANGE_OPTIONS.ALL>;
type RequestedWindow = {
    startIso: string;
    endIso: string;
    windowDays: number;
};

const RANGE_WINDOW_DAYS: Record<PannableMetricsRange, number> = {
    [METRICS_RANGE_OPTIONS.WEEK]: 7,
    [METRICS_RANGE_OPTIONS.MONTH]: 30,
    [METRICS_RANGE_OPTIONS.YEAR]: 365
};

/**
 * Returns true when the range can be shifted backward/forward in fixed windows.
 */
function isPannableRange(range: MetricsRange): range is PannableMetricsRange {
    return range !== METRICS_RANGE_OPTIONS.ALL;
}

/**
 * Normalize a backend date/time string into a `YYYY-MM-DD` key.
 */
function getDatePart(value: string): string {
    return value.split('T')[0] ?? value;
}

/**
 * Compute the active date window for pannable ranges.
 */
function getRequestedWindow(range: MetricsRange, latestMetricDateIso: string | null, panWindowIndex: number): RequestedWindow | null {
    if (!isPannableRange(range) || !latestMetricDateIso) return null;
    const windowDays = RANGE_WINDOW_DAYS[range];
    const endIso = addDaysToIsoDate(latestMetricDateIso, -(panWindowIndex * windowDays));
    const startIso = addDaysToIsoDate(endIso, -(windowDays - 1));
    return { startIso, endIso, windowDays };
}

/**
 * Choose x-axis date label granularity based on the displayed span.
 */
function getAxisLabelOptions(spanDays: number): Intl.DateTimeFormatOptions {
    if (spanDays <= 14) {
        return { weekday: 'short', month: 'short', day: 'numeric' };
    }
    if (spanDays <= 120) {
        return { month: 'short', day: 'numeric' };
    }
    if (spanDays <= 370) {
        return { month: 'short' };
    }
    return { month: 'short', year: 'numeric' };
}

const Goals: React.FC = () => {
    const { user } = useAuth();
    const { t } = useI18n();
    const theme = useTheme();
    const isCompactViewport = useMediaQuery(theme.breakpoints.down('sm'));
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    // Tighter section spacing on small screens keeps stacked cards from feeling overly separated.
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap };
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const rawWeightSeriesLabel = t('goals.weightSeriesLabel', { unit: unitLabel });
    const trendSeriesLabel = t('goals.trendLabel');
    const expectedRangeLabel = t('goals.expectedRangeLabel');
    const trendLineColor = theme.palette.primary.dark;
    const rawLineColor = alpha(theme.palette.primary.main, RAW_LINE_ALPHA);
    const expectedRangeFillColor = alpha(theme.palette.primary.main, EXPECTED_RANGE_FILL_ALPHA);
    const expectedRangeEdgeColor = alpha(theme.palette.primary.main, EXPECTED_RANGE_EDGE_ALPHA);
    const chartMargin = isCompactViewport ? CHART_MARGIN_COMPACT : CHART_MARGIN_DEFAULT;

    // Default to YEAR so long histories do not fetch/render the full timeline on initial load.
    const [selectedRange, setSelectedRange] = useState<MetricsRange>(METRICS_RANGE_OPTIONS.YEAR);
    const [panWindowIndex, setPanWindowIndex] = useState(0);

    const goalQuery = useQuery({
        queryKey: ['goal'],
        queryFn: async (): Promise<GoalResponse | null> => {
            const res = await axios.get('/api/goals');
            return res.data ?? null;
        }
    });

    const trendMetricsQuery = useQuery({
        // Keep the full trend history in-memory so week/month/year/pan changes are instant.
        queryKey: ['metrics', 'trend', METRICS_RANGE_OPTIONS.ALL],
        queryFn: async () => fetchTrendMetrics({ range: METRICS_RANGE_OPTIONS.ALL })
    });

    const goal = goalQuery.data;
    const trendMetrics = useMemo(() => trendMetricsQuery.data?.metrics ?? [], [trendMetricsQuery.data]);
    const trendMeta = trendMetricsQuery.data?.meta ?? null;
    const latestMetricDateIso = useMemo(() => {
        const latestDateRaw = trendMetrics[0]?.date;
        return latestDateRaw ? getDatePart(latestDateRaw) : null;
    }, [trendMetrics]);
    const earliestMetricDateIso = useMemo(() => {
        const earliestDateRaw = trendMetrics[trendMetrics.length - 1]?.date;
        return earliestDateRaw ? getDatePart(earliestDateRaw) : null;
    }, [trendMetrics]);
    const requestedWindow = useMemo(
        () => getRequestedWindow(selectedRange, latestMetricDateIso, panWindowIndex),
        [latestMetricDateIso, panWindowIndex, selectedRange]
    );

    const points = useMemo(() => {
        const parsed: WeightPoint[] = trendMetrics
            .filter(
                (metric) =>
                    Number.isFinite(metric.weight) &&
                    Number.isFinite(metric.trend_weight) &&
                    Number.isFinite(metric.trend_ci_lower) &&
                    Number.isFinite(metric.trend_ci_upper)
            )
            .map((metric) => {
                const date = parseDateOnlyToLocalDate(metric.date);
                if (!date) return null;
                return {
                    date,
                    rawWeight: metric.weight,
                    trendWeight: metric.trend_weight,
                    rangeLower: metric.trend_ci_lower,
                    rangeUpper: metric.trend_ci_upper
                };
            })
            .filter((value): value is WeightPoint => value !== null);

        parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
        return parsed;
    }, [trendMetrics]);
    const chartPoints = useMemo(() => {
        if (points.length === 0) return [];

        const rows: ChartPoint[] = [
            {
                date: points[0].date,
                rawWeight: points[0].rawWeight,
                trendWeight: points[0].trendWeight,
                rangeLower: points[0].rangeLower,
                rangeUpper: points[0].rangeUpper
            }
        ];

        for (let index = 1; index < points.length; index += 1) {
            const previousPoint = points[index - 1];
            const currentPoint = points[index];
            const gapDays = Math.round(
                (startOfLocalDay(currentPoint.date).getTime() - startOfLocalDay(previousPoint.date).getTime()) / MS_PER_DAY
            );

            if (gapDays > CHART_GAP_BREAK_DAYS) {
                const midpointDate = new Date(previousPoint.date.getTime() + (currentPoint.date.getTime() - previousPoint.date.getTime()) / 2);
                rows.push({
                    date: midpointDate,
                    rawWeight: null,
                    trendWeight: null,
                    rangeLower: null,
                    rangeUpper: null
                });
            }

            rows.push({
                date: currentPoint.date,
                rawWeight: currentPoint.rawWeight,
                trendWeight: currentPoint.trendWeight,
                rangeLower: currentPoint.rangeLower,
                rangeUpper: currentPoint.rangeUpper
            });
        }

        return rows;
    }, [points]);

    const dataDomain = useMemo(() => {
        if (points.length === 0) return null;
        return {
            min: startOfLocalDay(points[0].date),
            max: startOfLocalDay(points[points.length - 1].date)
        };
    }, [points]);
    const dataSpanDays = useMemo(() => {
        if (!dataDomain) return 0;
        const diffDays = Math.round((dataDomain.max.getTime() - dataDomain.min.getTime()) / MS_PER_DAY);
        return Math.max(1, diffDays + 1);
    }, [dataDomain]);
    const showRangeControl =
        (trendMeta?.total_span_days ?? dataSpanDays) >= RANGE_CONTROL_MIN_DAYS ||
        (trendMeta?.total_points ?? points.length) >= RANGE_CONTROL_MIN_POINTS;

    const xDomain = useMemo(() => {
        if (showRangeControl && requestedWindow) {
            const min = parseDateOnlyToLocalDate(requestedWindow.startIso);
            const max = parseDateOnlyToLocalDate(requestedWindow.endIso);
            if (min && max) return { min, max };
        }
        return dataDomain;
    }, [dataDomain, requestedWindow, showRangeControl]);

    const activeSpanDays = useMemo(() => {
        if (showRangeControl && requestedWindow) return requestedWindow.windowDays;
        if (!xDomain) return 0;
        const diffDays = Math.round((xDomain.max.getTime() - xDomain.min.getTime()) / MS_PER_DAY);
        return Math.max(1, diffDays + 1);
    }, [requestedWindow, showRangeControl, xDomain]);

    const xAxisLabelOptions = useMemo(() => getAxisLabelOptions(activeSpanDays), [activeSpanDays]);
    const xAxisFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, xAxisLabelOptions), [xAxisLabelOptions]);
    const tooltipDateFormatter = useMemo(
        () => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        []
    );
    const panWindowFormatter = useMemo(
        () => new Intl.DateTimeFormat(undefined, { year: '2-digit', month: '2-digit', day: '2-digit' }),
        []
    );

    const xData = useMemo(() => chartPoints.map((point) => point.date), [chartPoints]);
    const rawData = useMemo(() => chartPoints.map((point) => point.rawWeight), [chartPoints]);
    const trendData = useMemo(() => chartPoints.map((point) => point.trendWeight), [chartPoints]);
    const rangeLowerData = useMemo(() => chartPoints.map((point) => point.rangeLower), [chartPoints]);
    const rangeUpperData = useMemo(() => chartPoints.map((point) => point.rangeUpper), [chartPoints]);

    // Stacked area series uses (upper-lower) as fill thickness to render the expected range band.
    const rangeBandData = useMemo(
        () =>
            chartPoints.map((point) =>
                point.rangeLower === null || point.rangeUpper === null ? null : Math.max(0, point.rangeUpper - point.rangeLower)
            ),
        [chartPoints]
    );
    const visiblePoints = useMemo(() => {
        if (!xDomain) return points;
        const minMs = startOfLocalDay(xDomain.min).getTime();
        const maxMs = startOfLocalDay(xDomain.max).getTime();
        return points.filter((point) => {
            const pointMs = startOfLocalDay(point.date).getTime();
            return pointMs >= minMs && pointMs <= maxMs;
        });
    }, [points, xDomain]);
    const [rawMarksVisible, setRawMarksVisible] = useState(true);
    const markRevealTimeoutRef = useRef<number | null>(null);

    const scheduleRawMarkReveal = () => {
        if (markRevealTimeoutRef.current !== null) {
            window.clearTimeout(markRevealTimeoutRef.current);
            markRevealTimeoutRef.current = null;
        }

        if (points.length === 0) {
            setRawMarksVisible(true);
            return;
        }
        // Keep marks hidden for any domain/range/pan transition so they never "snap" ahead of the line motion.
        setRawMarksVisible(false);
        markRevealTimeoutRef.current = window.setTimeout(() => {
            setRawMarksVisible(true);
            markRevealTimeoutRef.current = null;
        }, CHART_LINE_ANIMATION_DURATION_MS + RAW_MARK_REVEAL_BUFFER_MS);
    };

    useEffect(() => {
        return () => {
            if (markRevealTimeoutRef.current !== null) {
                window.clearTimeout(markRevealTimeoutRef.current);
            }
        };
    }, []);

    const targetIsValid = typeof goal?.target_weight === 'number' && Number.isFinite(goal.target_weight);
    const yDomain = useMemo(() => {
        const values = visiblePoints
            .flatMap((point) => [point.rawWeight, point.trendWeight, point.rangeLower, point.rangeUpper])
            .filter((value) => Number.isFinite(value));
        if (targetIsValid) values.push(goal!.target_weight);
        if (values.length === 0) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(0.1, max - min);
        const padding = range * 0.1;
        return { min: min - padding, max: max + padding };
    }, [goal, targetIsValid, visiblePoints]);

    const canPanBackward = useMemo(() => {
        if (!showRangeControl || !requestedWindow || !earliestMetricDateIso) return false;
        return requestedWindow.startIso > earliestMetricDateIso;
    }, [earliestMetricDateIso, requestedWindow, showRangeControl]);
    const canPanForward = panWindowIndex > 0;
    const showPanControls = showRangeControl && requestedWindow !== null;
    const visibleWindowLabel = useMemo(() => {
        if (!requestedWindow) return null;
        const startDate = parseDateOnlyToLocalDate(requestedWindow.startIso);
        const endDate = parseDateOnlyToLocalDate(requestedWindow.endIso);
        if (!startDate || !endDate) return null;
        return t('goals.weightHistoryWindowLabel', {
            start: panWindowFormatter.format(startDate),
            end: panWindowFormatter.format(endDate)
        });
    }, [panWindowFormatter, requestedWindow, t]);

    const volatilityLabel = useMemo(() => {
        switch (trendMeta?.volatility) {
            case 'high':
                return t('goals.volatility.high');
            case 'medium':
                return t('goals.volatility.medium');
            default:
                return t('goals.volatility.low');
        }
    }, [t, trendMeta?.volatility]);

    const summaryLine = trendMeta ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {t('goals.weightHistorySummary.weeklyRate', {
                value: trendMeta.weekly_rate.toFixed(2),
                unit: unitLabel
            })}{' '}
            | {t('goals.weightHistorySummary.volatility', { level: volatilityLabel })}
        </Typography>
    ) : null;

    const weightHistoryTooltipContent = (
        <Box sx={{ maxWidth: WEIGHT_HISTORY_TOOLTIP_MAX_WIDTH_PX, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="subtitle2">{t('goals.weightHistoryExplainer.tooltipTitle')}</Typography>
            <Typography variant="body2">{t('goals.weightHistoryExplainer.tooltipTrend')}</Typography>
            <Typography variant="body2">{t('goals.weightHistoryExplainer.tooltipRange')}</Typography>
            <Typography variant="body2">{t('goals.weightHistoryExplainer.tooltipOutliers')}</Typography>
        </Box>
    );

    const weightHistoryHeaderActions = (
        <Tooltip title={weightHistoryTooltipContent} arrow enterTouchDelay={0}>
            <IconButton size="small" aria-label={t('goals.weightHistoryExplainer.tooltipAria')}>
                <InfoOutlinedIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    );

    const controlsRow = showRangeControl ? (
        <Box
            sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: CONTROLS_ROW_GAP,
                alignItems: { xs: 'stretch', md: 'center' },
                justifyContent: 'space-between'
            }}
        >
            <ToggleButtonGroup
                color="primary"
                exclusive
                size={isCompactViewport ? 'medium' : 'small'}
                value={selectedRange}
                onChange={(_event, nextRange) => {
                    if (nextRange) {
                        scheduleRawMarkReveal();
                        setSelectedRange(nextRange as MetricsRange);
                        setPanWindowIndex(0);
                    }
                }}
                aria-label={t('goals.weightHistoryRangeLabel')}
                sx={{
                    width: { xs: '100%', md: 'auto' },
                    '& .MuiToggleButton-root': {
                        flex: { xs: 1, md: 'initial' },
                        minHeight: { xs: RANGE_TOGGLE_TOUCH_HEIGHT_PX, md: 'auto' }
                    }
                }}
            >
                <ToggleButton value={METRICS_RANGE_OPTIONS.WEEK}>{t('goals.weightHistoryRangeWeek')}</ToggleButton>
                <ToggleButton value={METRICS_RANGE_OPTIONS.MONTH}>{t('goals.weightHistoryRangeMonth')}</ToggleButton>
                <ToggleButton value={METRICS_RANGE_OPTIONS.YEAR}>{t('goals.weightHistoryRangeYear')}</ToggleButton>
                <ToggleButton value={METRICS_RANGE_OPTIONS.ALL}>{t('goals.weightHistoryRangeAll')}</ToggleButton>
            </ToggleButtonGroup>

            <Box
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: { xs: 'center', md: 'flex-end' },
                    gap: PAN_WINDOW_CONTROLS_GAP,
                    minHeight: 32,
                    width: { xs: '100%', md: 'auto' }
                }}
            >
                {showPanControls ? (
                    <>
                        <Tooltip title={t('goals.weightHistoryPanPrevious')}>
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        const nextPanWindowIndex = panWindowIndex + 1;
                                        scheduleRawMarkReveal();
                                        setPanWindowIndex(nextPanWindowIndex);
                                    }}
                                    disabled={!canPanBackward}
                                    aria-label={t('goals.weightHistoryPanPrevious')}
                                >
                                    <ChevronLeftRoundedIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ minWidth: `${PAN_WINDOW_LABEL_MIN_WIDTH_CH}ch`, textAlign: 'center' }}
                        >
                            {visibleWindowLabel}
                        </Typography>
                        <Tooltip title={t('goals.weightHistoryPanNext')}>
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        const nextPanWindowIndex = Math.max(0, panWindowIndex - 1);
                                        scheduleRawMarkReveal();
                                        setPanWindowIndex(nextPanWindowIndex);
                                    }}
                                    disabled={!canPanForward}
                                    aria-label={t('goals.weightHistoryPanNext')}
                                >
                                    <ChevronRightRoundedIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </>
                ) : null}
            </Box>
        </Box>
    ) : null;

    const showInitialTrendLoading = trendMetricsQuery.isLoading && !trendMetricsQuery.data;

    let weightHistoryContent: React.ReactNode;

    if (trendMetricsQuery.isError) {
        weightHistoryContent = <Alert severity="warning">{t('goals.weightHistoryLoadError')}</Alert>;
    } else if (showInitialTrendLoading) {
        weightHistoryContent = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Skeleton width="40%" />
                <Skeleton variant="rounded" height={CHART_HEIGHT_PX} />
            </Box>
        );
    } else if (points.length === 0) {
        weightHistoryContent = <Typography color="text.secondary">{t('goals.noWeightEntries')}</Typography>;
    } else {
        weightHistoryContent = (
            <Stack spacing={1.5}>
                {controlsRow}
                <Box sx={{ mx: CHART_EDGE_BLEED_X_SPACING }}>
                    <LineChart
                        xAxis={[
                            {
                                data: xData,
                                scaleType: 'time',
                                domainLimit: 'strict',
                                min: xDomain?.min,
                                max: xDomain?.max,
                                valueFormatter: (value, context) =>
                                    context?.location === 'tooltip'
                                        ? tooltipDateFormatter.format(value)
                                        : xAxisFormatter.format(value)
                            }
                        ]}
                        yAxis={[
                            {
                                min: yDomain?.min,
                                max: yDomain?.max,
                                label: rawWeightSeriesLabel
                            }
                        ]}
                        series={[
                            {
                                id: 'expectedRangeBaseline',
                                data: rangeLowerData,
                                stack: 'expectedRange',
                                color: 'transparent',
                                showMark: false,
                                connectNulls: false,
                                valueFormatter: () => null
                            },
                            {
                                id: 'expectedRangeBand',
                                data: rangeBandData,
                                stack: 'expectedRange',
                                area: true,
                                color: expectedRangeFillColor,
                                showMark: false,
                                connectNulls: false,
                                valueFormatter: () => null
                            },
                            {
                                id: 'expectedRangeTooltip',
                                data: trendData,
                                label: expectedRangeLabel,
                                color: 'transparent',
                                showMark: false,
                                connectNulls: false,
                                valueFormatter: (_value, context) => {
                                    const lower = rangeLowerData[context.dataIndex];
                                    const upper = rangeUpperData[context.dataIndex];
                                    if (
                                        typeof lower !== 'number' ||
                                        !Number.isFinite(lower) ||
                                        typeof upper !== 'number' ||
                                        !Number.isFinite(upper)
                                    ) {
                                        return null;
                                    }
                                    return `${lower.toFixed(1)} - ${upper.toFixed(1)} ${unitLabel}`;
                                }
                            },
                            {
                                id: 'trend',
                                data: trendData,
                                label: trendSeriesLabel,
                                color: trendLineColor,
                                showMark: false,
                                connectNulls: false,
                                valueFormatter: (value) => (value == null ? null : `${value.toFixed(1)} ${unitLabel}`)
                            },
                            {
                                id: 'raw',
                                data: rawData,
                                label: rawWeightSeriesLabel,
                                color: rawLineColor,
                                showMark: true,
                                connectNulls: false,
                                valueFormatter: (value) => (value == null ? null : `${value.toFixed(1)} ${unitLabel}`)
                            }
                        ]}
                        height={CHART_HEIGHT_PX}
                        margin={chartMargin}
                        skipAnimation={false}
                        slotProps={{ legend: { hidden: true } }}
                        tooltip={{ trigger: 'axis' }}
                        sx={{
                            '& .MuiAreaElement-series-expectedRangeBand': {
                                fill: expectedRangeFillColor,
                                fillOpacity: 1
                            },
                            '& .MuiLineElement-series-expectedRangeBand': {
                                stroke: expectedRangeEdgeColor,
                                strokeWidth: 1
                            },
                            '& .MuiLineElement-series-trend': {
                                strokeWidth: TREND_LINE_STROKE_WIDTH_PX
                            },
                            '& .MuiLineElement-series-raw': {
                                strokeWidth: RAW_LINE_STROKE_WIDTH_PX
                            },
                            '& .MuiMarkElement-series-raw': {
                                stroke: rawLineColor,
                                strokeWidth: RAW_MARK_STROKE_WIDTH_PX,
                                opacity: rawMarksVisible ? 1 : 0,
                                transform: rawMarksVisible ? 'scale(1)' : `scale(${RAW_MARK_HIDDEN_SCALE})`,
                                transformOrigin: 'center',
                                transition: `opacity ${RAW_MARK_FADE_IN_DURATION_MS}ms ${RAW_MARK_FADE_EASING}, transform ${RAW_MARK_FADE_IN_DURATION_MS}ms ${RAW_MARK_FADE_EASING}`
                            }
                        }}
                    >
                        {targetIsValid && (
                            <ChartsReferenceLine
                                y={goal!.target_weight}
                                label={t('goals.targetLineLabel', {
                                    value: goal!.target_weight.toFixed(1),
                                    unit: unitLabel
                                })}
                                lineStyle={{
                                    stroke: theme.palette.secondary.main,
                                    strokeDasharray: '6 6',
                                    strokeWidth: 2
                                }}
                                labelStyle={{ fill: theme.palette.text.secondary, fontWeight: 700 }}
                            />
                        )}
                    </LineChart>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1.75, alignItems: 'center' }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <Box
                            aria-hidden
                            sx={{
                                width: LEGEND_SWATCH_SIZE_PX,
                                height: LEGEND_SWATCH_SIZE_PX,
                                borderRadius: '50%',
                                backgroundColor: rawLineColor
                            }}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {rawWeightSeriesLabel}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <Box
                            aria-hidden
                            sx={{
                                width: LEGEND_SWATCH_SIZE_PX + 6,
                                height: 3,
                                backgroundColor: trendLineColor
                            }}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {trendSeriesLabel}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <Box
                            aria-hidden
                            sx={{
                                width: LEGEND_SWATCH_SIZE_PX + 8,
                                height: LEGEND_SWATCH_SIZE_PX - 2,
                                borderRadius: 999,
                                backgroundColor: expectedRangeFillColor,
                                border: `1px solid ${expectedRangeEdgeColor}`
                            }}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {expectedRangeLabel}
                        </Typography>
                    </Box>
                </Box>

                {summaryLine}
            </Stack>
        );
    }

    return (
        <AppPage>
            <Stack spacing={sectionSpacing} useFlexGap>
                <GoalTrackerCard />

                <AppCard contentSx={{ px: CHART_CARD_PADDING_X_SPACING }}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 1,
                            flexWrap: 'nowrap',
                            mb: 1.5
                        }}
                    >
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                            <Typography variant="h6">{t('goals.weightHistoryTitle')}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t('goals.weightHistoryExplainer.inline')}
                            </Typography>
                        </Box>
                        <Box sx={{ flexShrink: 0 }}>{weightHistoryHeaderActions}</Box>
                    </Box>
                    {weightHistoryContent}
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default Goals;
