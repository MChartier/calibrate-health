import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { LineChart, lineClasses } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { alpha, useTheme, type SxProps, type Theme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { METRICS_RANGE_OPTIONS, type MetricsRange } from '../constants/metricsRanges';
import { fetchTrendMetrics } from '../queries/metrics';
import { parseDateOnlyToLocalDate, startOfLocalDay } from '../utils/goalTracking';
import { addDaysToIsoDate, MS_PER_DAY } from '../utils/date';
import AppCard from '../ui/AppCard';
import { useI18n } from '../i18n/useI18n';
import { mergeSx } from '../ui/sx';

type GoalResponse = {
    target_weight: number;
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

const TODAY_TREND_CHART_HEIGHT_PX = { xs: 200, md: 226 }; // Compact height keeps the trend contextual rather than competing with food logging.
const TODAY_TREND_CHART_FILL_MIN_HEIGHT_PX = 226; // Minimum chart body when the Today rail stretches to match the food log.
const WEIGHT_TREND_FULLSCREEN_CHART_MIN_HEIGHT_PX = { xs: 360, sm: 440 }; // Full-screen history keeps the chart dominant in portrait and landscape.
const TODAY_TREND_MARGIN_COMPACT = { top: 8, right: 6, bottom: 26, left: 30 }; // Compact margin maximizes chart width in narrow panels.
const TODAY_TREND_MARGIN_DEFAULT = { top: 6, right: 6, bottom: 26, left: 30 }; // Desktop margin avoids the oversized left gutter from the full goals page.
const TODAY_TREND_MARGIN_FILL = { top: 4, right: 12, bottom: 2, left: 2 }; // Flexible Today chart keeps a small right buffer so edge markers do not clip.
const TODAY_TREND_Y_AXIS_WIDTH_PX = 30; // Short weight tick labels do not need MUI's default axis-title gutter.
const TODAY_TREND_X_AXIS_HEIGHT_PX = 24; // Date tick labels need a compact baseline but no extra title space.
const CONTROLS_ROW_GAP = 1; // Spacing between range selection and pan controls when the row wraps.
const LEGEND_SWATCH_SIZE_PX = 10; // Small legend swatches fit the Today context card.
const CHART_GAP_BREAK_DAYS = 21; // Break sparse histories instead of implying continuous measurements.
const TREND_LINE_STROKE_WIDTH_PX = 4; // Weight trend remains the primary chart signal.
const RAW_LINE_STROKE_WIDTH_PX = 1.5; // Raw daily measurements stay visible but secondary.
const RAW_LINE_ALPHA = 0.55; // Reduce visual noise from noisy day-to-day measurements.
const EXPECTED_RANGE_FILL_ALPHA = 0.065; // Subtle confidence band matches the richer history graph.
const EXPECTED_RANGE_EDGE_ALPHA = 0.14; // Thin edge keeps the band readable.
const RAW_MARK_STROKE_WIDTH_PX = 1.25; // Light marker outlines reduce clutter in the compact card.
const WEIGHT_HISTORY_TOOLTIP_MAX_WIDTH_PX = 340; // Tooltip text wraps consistently on mobile and desktop.
const RANGE_TOGGLE_TOUCH_HEIGHT_PX = 40; // Mobile touch target for the range controls.
const PAN_WINDOW_LABEL_MIN_WIDTH_CH = 19; // Stable pan label width prevents control shifting.
const PAN_WINDOW_CONTROLS_GAP = 0.75; // Compact pan controls fit narrow context panels.
const TODAY_TREND_CONTROL_WRAP_GAP = 0.75; // Today rail stacks chart controls so narrow context columns do not truncate dates.
const CHART_LINE_ANIMATION_DURATION_MS = 420; // Approximate domain transition duration for panning/range changes.
const RAW_MARK_REVEAL_BUFFER_MS = 190; // Delay raw marks until the line has settled.
const RAW_MARK_FADE_IN_DURATION_MS = 640; // Soft marker reveal after range changes.
const RAW_MARK_FADE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'; // Ease-out curve with a gentle finish.
const RAW_MARK_HIDDEN_SCALE = 0.74; // Hidden marks shrink slightly so reveal does not feel abrupt.

export type WeightTrendProps = {
    /**
     * Stretch the Today workspace trend card so the right rail can align with the food log.
     */
    fillAvailableHeight?: boolean;
    /**
     * Expand the history card to fill its route container for the dedicated history view.
     */
    fullScreen?: boolean;
    /** Optional header action, such as a link from the compact Today preview to full history. */
    action?: React.ReactNode;
    /** Optional wrapper styles used by dashboard grid alignment. */
    sx?: SxProps<Theme>;
};

/**
 * Normalize a backend date/time string into a `YYYY-MM-DD` key.
 */
function getDatePart(value: string): string {
    return value.split('T')[0] ?? value;
}

/**
 * Returns true when the range can be shifted backward/forward in fixed windows.
 */
function isPannableRange(range: MetricsRange): range is PannableMetricsRange {
    return range !== METRICS_RANGE_OPTIONS.ALL;
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
    if (spanDays <= 14) return { weekday: 'short', month: 'short', day: 'numeric' };
    if (spanDays <= 120) return { month: 'short', day: 'numeric' };
    if (spanDays <= 370) return { month: 'short' };
    return { month: 'short', year: 'numeric' };
}

/**
 * Select chart margins for the current card mode without burying layout logic in JSX.
 */
function getTrendChartMargin(args: { fillAvailableHeight: boolean; isCompactViewport: boolean }) {
    if (args.fillAvailableHeight) return TODAY_TREND_MARGIN_FILL;
    return args.isCompactViewport ? TODAY_TREND_MARGIN_COMPACT : TODAY_TREND_MARGIN_DEFAULT;
}

type WeightTrendControlsProps = {
    selectedRange: MetricsRange;
    isCompactViewport: boolean;
    fillAvailableHeight: boolean;
    requestedWindow: RequestedWindow | null;
    visibleWindowLabel: string | null;
    canPanBackward: boolean;
    canPanForward: boolean;
    onRangeChange: (nextRange: MetricsRange) => void;
    onPanBackward: () => void;
    onPanForward: () => void;
};

/**
 * Range and panning controls for the trend chart.
 */
const WeightTrendControls: React.FC<WeightTrendControlsProps> = ({
    selectedRange,
    isCompactViewport,
    fillAvailableHeight,
    requestedWindow,
    visibleWindowLabel,
    canPanBackward,
    canPanForward,
    onRangeChange,
    onPanBackward,
    onPanForward
}) => {
    const { t } = useI18n();
    const controlsDirection = fillAvailableHeight ? 'column' : { xs: 'column', md: 'row' };
    const controlsAlignment = fillAvailableHeight ? 'stretch' : { xs: 'stretch', md: 'center' };
    const controlsJustification = fillAvailableHeight ? 'flex-start' : 'space-between';
    const rangeControlWidth = fillAvailableHeight ? '100%' : { xs: '100%', md: 'auto' };
    const panControlWidth = fillAvailableHeight ? '100%' : { xs: '100%', md: 'auto' };
    const panControlJustification = fillAvailableHeight ? 'space-between' : { xs: 'center', md: 'flex-end' };

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: controlsDirection,
                gap: fillAvailableHeight ? TODAY_TREND_CONTROL_WRAP_GAP : CONTROLS_ROW_GAP,
                alignItems: controlsAlignment,
                justifyContent: controlsJustification
            }}
        >
            <ToggleButtonGroup
                color="primary"
                exclusive
                size={isCompactViewport ? 'medium' : 'small'}
                value={selectedRange}
                onChange={(_event, nextRange) => {
                    if (!nextRange) return;
                    onRangeChange(nextRange as MetricsRange);
                }}
                aria-label={t('goals.weightHistoryRangeLabel')}
                sx={{
                    width: rangeControlWidth,
                    '& .MuiToggleButton-root': {
                        flex: fillAvailableHeight ? 1 : { xs: 1, md: 'initial' },
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
                    justifyContent: panControlJustification,
                    gap: PAN_WINDOW_CONTROLS_GAP,
                    minHeight: 32,
                    width: panControlWidth
                }}
            >
                {requestedWindow && (
                    <>
                        <Tooltip title={t('goals.weightHistoryPanPrevious')}>
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={onPanBackward}
                                    disabled={!canPanBackward}
                                    aria-label={t('goals.weightHistoryPanPrevious')}
                                >
                                    <ChevronLeftRoundedIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'text.secondary',
                                minWidth: `${PAN_WINDOW_LABEL_MIN_WIDTH_CH}ch`,
                                textAlign: 'center'
                            }}
                        >
                            {visibleWindowLabel}
                        </Typography>
                        <Tooltip title={t('goals.weightHistoryPanNext')}>
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={onPanForward}
                                    disabled={!canPanForward}
                                    aria-label={t('goals.weightHistoryPanNext')}
                                >
                                    <ChevronRightRoundedIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </>
                )}
            </Box>
        </Box>
    );
};

type WeightTrendLegendProps = {
    rawWeightSeriesLabel: string;
    trendSeriesLabel: string;
    expectedRangeLabel: string;
    rawLineColor: string;
    trendLineColor: string;
    expectedRangeFillColor: string;
    expectedRangeEdgeColor: string;
};

/**
 * Compact legend for the Today trend chart.
 */
const WeightTrendLegend: React.FC<WeightTrendLegendProps> = ({
    rawWeightSeriesLabel,
    trendSeriesLabel,
    expectedRangeLabel,
    rawLineColor,
    trendLineColor,
    expectedRangeFillColor,
    expectedRangeEdgeColor
}) => (
    <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Box
                aria-hidden
                sx={{
                    width: LEGEND_SWATCH_SIZE_PX,
                    height: LEGEND_SWATCH_SIZE_PX,
                    borderRadius: '50%',
                    backgroundColor: rawLineColor
                }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {rawWeightSeriesLabel}
            </Typography>
        </Box>

        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Box
                aria-hidden
                sx={{
                    width: LEGEND_SWATCH_SIZE_PX + 6,
                    height: 3,
                    backgroundColor: trendLineColor
                }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {trendSeriesLabel}
            </Typography>
        </Box>

        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
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
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {expectedRangeLabel}
            </Typography>
        </Box>
    </Box>
);

/**
 * Full-featured weight trend panel for Today previews and the dedicated history route.
 */
const WeightTrend: React.FC<WeightTrendProps> = ({ fillAvailableHeight = false, fullScreen = false, action, sx }) => {
    const { user } = useAuth();
    const { t } = useI18n();
    const theme = useTheme();
    const isCompactViewport = useMediaQuery(theme.breakpoints.down('sm'));
    const shouldStretchChart = fillAvailableHeight || fullScreen;
    const chartLibraryAnimationSkipped = !fullScreen; // Compact previews mount in tabs; skipping chart tween avoids transient SVG NaN coordinates.
    const chartAxisHighlight = chartLibraryAnimationSkipped ? { x: 'none' as const, y: 'none' as const } : undefined;
    const tooltipTrigger = chartLibraryAnimationSkipped ? 'none' as const : 'axis' as const; // Compact previews do not need pointer tooltips, and disabling them prevents hidden-tab axis math warnings.
    const [selectedRange, setSelectedRange] = useState<MetricsRange>(METRICS_RANGE_OPTIONS.MONTH);
    const [panWindowIndex, setPanWindowIndex] = useState(0);
    const [rawMarksVisible, setRawMarksVisible] = useState(true);
    const [chartContainerWidth, setChartContainerWidth] = useState<number | null>(null);
    const [chartContainerHeight, setChartContainerHeight] = useState<number | null>(null);
    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    const markRevealTimeoutRef = useRef<number | null>(null);
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const rawWeightSeriesLabel = t('goals.weightSeriesLabel', { unit: unitLabel });
    const trendSeriesLabel = t('goals.trendLabel');
    const expectedRangeLabel = t('goals.expectedRangeLabel');
    const trendLineColor = theme.palette.primary.dark;
    const rawLineColor = alpha(theme.palette.primary.main, RAW_LINE_ALPHA);
    const expectedRangeFillColor = alpha(theme.palette.primary.main, EXPECTED_RANGE_FILL_ALPHA);
    const expectedRangeEdgeColor = alpha(theme.palette.primary.main, EXPECTED_RANGE_EDGE_ALPHA);
    const chartMargin = getTrendChartMargin({ fillAvailableHeight, isCompactViewport });

    const goalQuery = useQuery({
        queryKey: ['goal'],
        queryFn: async (): Promise<GoalResponse | null> => {
            const res = await axios.get('/api/goals');
            return res.data ?? null;
        }
    });

    const trendMetricsQuery = useQuery({
        queryKey: ['metrics', 'trend', METRICS_RANGE_OPTIONS.ALL],
        queryFn: async () => fetchTrendMetrics({ range: METRICS_RANGE_OPTIONS.ALL })
    });

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

    const scheduleRawMarkReveal = useCallback(() => {
        if (markRevealTimeoutRef.current !== null) {
            window.clearTimeout(markRevealTimeoutRef.current);
            markRevealTimeoutRef.current = null;
        }

        if (points.length === 0 || chartLibraryAnimationSkipped) {
            setRawMarksVisible(true);
            return;
        }

        setRawMarksVisible(false);
        markRevealTimeoutRef.current = window.setTimeout(() => {
            setRawMarksVisible(true);
            markRevealTimeoutRef.current = null;
        }, CHART_LINE_ANIMATION_DURATION_MS + RAW_MARK_REVEAL_BUFFER_MS);
    }, [chartLibraryAnimationSkipped, points.length]);

    useEffect(() => {
        return () => {
            if (markRevealTimeoutRef.current !== null) {
                window.clearTimeout(markRevealTimeoutRef.current);
            }
        };
    }, []);

    const dataDomain = useMemo(() => {
        if (points.length === 0) return null;
        return {
            min: startOfLocalDay(points[0].date),
            max: startOfLocalDay(points[points.length - 1].date)
        };
    }, [points]);
    const xDomain = useMemo(() => {
        if (requestedWindow) {
            const min = parseDateOnlyToLocalDate(requestedWindow.startIso);
            const max = parseDateOnlyToLocalDate(requestedWindow.endIso);
            if (min && max) return { min, max };
        }
        return dataDomain;
    }, [dataDomain, requestedWindow]);
    const activeSpanDays = useMemo(() => {
        if (requestedWindow) return requestedWindow.windowDays;
        if (!xDomain) return 0;
        const diffDays = Math.round((xDomain.max.getTime() - xDomain.min.getTime()) / MS_PER_DAY);
        return Math.max(1, diffDays + 1);
    }, [requestedWindow, xDomain]);
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

    const visiblePoints = useMemo(() => {
        if (!xDomain) return points;
        const minMs = startOfLocalDay(xDomain.min).getTime();
        const maxMs = startOfLocalDay(xDomain.max).getTime();
        return points.filter((point) => {
            const pointMs = startOfLocalDay(point.date).getTime();
            return pointMs >= minMs && pointMs <= maxMs;
        });
    }, [points, xDomain]);
    const chartPoints = useMemo(() => {
        if (visiblePoints.length === 0) return [];

        const rows: ChartPoint[] = [
            {
                date: visiblePoints[0].date,
                rawWeight: visiblePoints[0].rawWeight,
                trendWeight: visiblePoints[0].trendWeight,
                rangeLower: visiblePoints[0].rangeLower,
                rangeUpper: visiblePoints[0].rangeUpper
            }
        ];

        for (let index = 1; index < visiblePoints.length; index += 1) {
            const previousPoint = visiblePoints[index - 1];
            const currentPoint = visiblePoints[index];
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
    }, [visiblePoints]);
    const xData = useMemo(() => chartPoints.map((point) => point.date), [chartPoints]);
    const rawData = useMemo(() => chartPoints.map((point) => point.rawWeight), [chartPoints]);
    const trendData = useMemo(() => chartPoints.map((point) => point.trendWeight), [chartPoints]);
    const rangeLowerData = useMemo(() => chartPoints.map((point) => point.rangeLower), [chartPoints]);
    const rangeUpperData = useMemo(() => chartPoints.map((point) => point.rangeUpper), [chartPoints]);
    const rangeBandData = useMemo(
        () =>
            chartPoints.map((point) =>
                point.rangeLower === null || point.rangeUpper === null ? null : Math.max(0, point.rangeUpper - point.rangeLower)
            ),
        [chartPoints]
    );

    const targetWeight = goalQuery.data?.target_weight;
    const targetIsValid = typeof targetWeight === 'number' && Number.isFinite(targetWeight);
    const yDomain = useMemo(() => {
        const values = visiblePoints
            .flatMap((point) => [point.rawWeight, point.trendWeight, point.rangeLower, point.rangeUpper])
            .filter((value) => Number.isFinite(value));
        if (targetIsValid) values.push(targetWeight);
        if (values.length === 0) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(0.1, max - min);
        const padding = range * 0.1;
        return { min: min - padding, max: max + padding };
    }, [targetIsValid, targetWeight, visiblePoints]);
    const canRenderTargetLine =
        fullScreen &&
        targetIsValid &&
        yDomain !== null &&
        xDomain !== null &&
        xDomain.max.getTime() > xDomain.min.getTime();

    const canPanBackward = useMemo(() => {
        if (!requestedWindow || !earliestMetricDateIso) return false;
        return requestedWindow.startIso > earliestMetricDateIso;
    }, [earliestMetricDateIso, requestedWindow]);
    const canPanForward = panWindowIndex > 0;
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
    const defaultChartHeight = isCompactViewport ? TODAY_TREND_CHART_HEIGHT_PX.xs : TODAY_TREND_CHART_HEIGHT_PX.md;
    const fullScreenMinChartHeight = isCompactViewport
        ? WEIGHT_TREND_FULLSCREEN_CHART_MIN_HEIGHT_PX.xs
        : WEIGHT_TREND_FULLSCREEN_CHART_MIN_HEIGHT_PX.sm;
    const stretchedMinChartHeight = fullScreen ? fullScreenMinChartHeight : TODAY_TREND_CHART_FILL_MIN_HEIGHT_PX;
    const chartHeight = shouldStretchChart ? chartContainerHeight ?? stretchedMinChartHeight : defaultChartHeight;
    const chartHasMeasuredContainer = chartContainerWidth !== null && (!shouldStretchChart || chartContainerHeight !== null); // MUI Charts needs real dimensions before it can compute stable SVG coordinates.
    const cardTitle = fullScreen ? t('goals.weightHistoryTitle') : t('today.weightTrend.title');
    const chartContainerSx: SxProps<Theme> | undefined = (() => {
        if (fillAvailableHeight) {
            return {
                flex: 1,
                minHeight: TODAY_TREND_CHART_FILL_MIN_HEIGHT_PX,
                minWidth: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                '& > *': {
                    width: '100%',
                    height: '100%'
                }
            };
        }

        if (fullScreen) {
            return {
                flex: 1,
                minHeight: WEIGHT_TREND_FULLSCREEN_CHART_MIN_HEIGHT_PX,
                minWidth: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'center',
                '& > *': {
                    width: '100%',
                    height: '100%'
                }
            };
        }

        return {
            minHeight: defaultChartHeight,
            minWidth: 0,
            width: '100%'
        };
    })();

    useEffect(() => {
        const node = chartContainerRef.current;
        if (!node) return;

        let animationFrame: number | null = null;
        const measureHeight = () => {
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }

            animationFrame = window.requestAnimationFrame(() => {
                const rect = node.getBoundingClientRect();
                const nextWidth = Math.floor(rect.width);
                if (nextWidth > 0) {
                    setChartContainerWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
                }
                if (shouldStretchChart) {
                    const nextHeight = Math.max(stretchedMinChartHeight, Math.floor(rect.height));
                    setChartContainerHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
                } else {
                    setChartContainerHeight(null);
                }
                animationFrame = null;
            });
        };

        measureHeight();
        const observer = new ResizeObserver(measureHeight);
        observer.observe(node);

        return () => {
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }
            observer.disconnect();
        };
    }, [defaultChartHeight, shouldStretchChart, stretchedMinChartHeight]);

    const weightHistoryTooltipContent = (
        <Box sx={{ maxWidth: WEIGHT_HISTORY_TOOLTIP_MAX_WIDTH_PX, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="subtitle2">{t('goals.weightHistoryExplainer.tooltipTitle')}</Typography>
            <Typography variant="body2">{t('goals.weightHistoryExplainer.tooltipTrend')}</Typography>
            <Typography variant="body2">{t('goals.weightHistoryExplainer.tooltipRange')}</Typography>
            <Typography variant="body2">{t('goals.weightHistoryExplainer.tooltipOutliers')}</Typography>
        </Box>
    );

    const handleRangeChange = useCallback(
        (nextRange: MetricsRange) => {
            scheduleRawMarkReveal();
            setSelectedRange(nextRange);
            setPanWindowIndex(0);
        },
        [scheduleRawMarkReveal]
    );

    const handlePanBackward = useCallback(() => {
        scheduleRawMarkReveal();
        setPanWindowIndex((current) => current + 1);
    }, [scheduleRawMarkReveal]);

    const handlePanForward = useCallback(() => {
        scheduleRawMarkReveal();
        setPanWindowIndex((current) => Math.max(0, current - 1));
    }, [scheduleRawMarkReveal]);

    const controlsRow = points.length > 0 ? (
        <WeightTrendControls
            selectedRange={selectedRange}
            isCompactViewport={isCompactViewport}
            fillAvailableHeight={fillAvailableHeight}
            requestedWindow={requestedWindow}
            visibleWindowLabel={visibleWindowLabel}
            canPanBackward={canPanBackward}
            canPanForward={canPanForward}
            onRangeChange={handleRangeChange}
            onPanBackward={handlePanBackward}
            onPanForward={handlePanForward}
        />
    ) : null;

    const summaryLine = trendMeta ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            {t('goals.weightHistorySummary.weeklyRate', {
                value: trendMeta.weekly_rate.toFixed(2),
                unit: unitLabel
            })}{' '}
            | {t('goals.weightHistorySummary.volatility', { level: volatilityLabel })}
        </Typography>
    ) : null;

    let content: React.ReactNode;
    if (trendMetricsQuery.isError) {
        content = <Alert severity="warning">{t('goals.weightHistoryLoadError')}</Alert>;
    } else if (trendMetricsQuery.isLoading && !trendMetricsQuery.data) {
        content = (
            <Stack spacing={1}>
                <Skeleton variant="rounded" height={36} />
                <Skeleton variant="rounded" height={chartHeight ?? TODAY_TREND_CHART_FILL_MIN_HEIGHT_PX} />
            </Stack>
        );
    } else if (points.length === 0) {
        content = <Typography sx={{ color: 'text.secondary' }}>{t('goals.noWeightEntries')}</Typography>;
    } else {
        content = (
            <Stack spacing={1} sx={shouldStretchChart ? { minHeight: 0, height: '100%', flex: 1 } : undefined}>
                {controlsRow}
                <Box ref={chartContainerRef} sx={chartContainerSx}>
                    {chartHasMeasuredContainer ? (
                        <LineChart
                            xAxis={[
                                {
                                    data: xData,
                                    scaleType: 'time',
                                    domainLimit: 'strict',
                                    min: xDomain?.min,
                                    max: xDomain?.max,
                                    height: fillAvailableHeight ? TODAY_TREND_X_AXIS_HEIGHT_PX : undefined,
                                    tickSize: fillAvailableHeight ? 0 : undefined,
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
                                    width: fillAvailableHeight ? TODAY_TREND_Y_AXIS_WIDTH_PX : undefined,
                                    tickSize: fillAvailableHeight ? 0 : undefined
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
                                    shape: 'circle',
                                    connectNulls: false,
                                    valueFormatter: (value) => (value == null ? null : `${value.toFixed(1)} ${unitLabel}`)
                                }
                            ]}
                            width={chartContainerWidth ?? undefined}
                            height={chartHeight}
                            margin={chartMargin}
                            hideLegend
                            skipAnimation={chartLibraryAnimationSkipped}
                            axisHighlight={chartAxisHighlight}
                            disableLineItemHighlight={chartLibraryAnimationSkipped}
                            slotProps={{ tooltip: { trigger: tooltipTrigger } }}
                            sx={{
                                width: '100%',
                                ...(shouldStretchChart ? { height: '100%' } : null),
                                [`& .${lineClasses.area}[data-series="expectedRangeBand"]`]: {
                                    fill: expectedRangeFillColor,
                                    fillOpacity: 1
                                },
                                [`& .${lineClasses.line}[data-series="expectedRangeBand"]`]: {
                                    stroke: expectedRangeEdgeColor,
                                    strokeWidth: 1
                                },
                                [`& .${lineClasses.line}[data-series="trend"]`]: {
                                    strokeWidth: TREND_LINE_STROKE_WIDTH_PX
                                },
                                [`& .${lineClasses.line}[data-series="raw"]`]: {
                                    strokeWidth: RAW_LINE_STROKE_WIDTH_PX
                                },
                                [`& .${lineClasses.mark}[data-series="raw"]`]: {
                                    stroke: rawLineColor,
                                    strokeWidth: RAW_MARK_STROKE_WIDTH_PX,
                                    opacity: rawMarksVisible ? 1 : 0,
                                    transform: rawMarksVisible ? 'scale(1)' : `scale(${RAW_MARK_HIDDEN_SCALE})`,
                                    transformOrigin: 'center',
                                    transition: `opacity ${RAW_MARK_FADE_IN_DURATION_MS}ms ${RAW_MARK_FADE_EASING}, transform ${RAW_MARK_FADE_IN_DURATION_MS}ms ${RAW_MARK_FADE_EASING}`
                                }
                            }}
                        >
                            {canRenderTargetLine && (
                                <ChartsReferenceLine
                                    y={targetWeight}
                                    label={t('goals.targetLineLabel', {
                                        value: targetWeight.toFixed(1),
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
                    ) : (
                        <Skeleton
                            variant="rounded"
                            height={shouldStretchChart ? '100%' : defaultChartHeight}
                            sx={{
                                width: '100%',
                                minHeight: shouldStretchChart ? stretchedMinChartHeight : defaultChartHeight
                            }}
                        />
                    )}
                </Box>

                <WeightTrendLegend
                    rawWeightSeriesLabel={rawWeightSeriesLabel}
                    trendSeriesLabel={trendSeriesLabel}
                    expectedRangeLabel={expectedRangeLabel}
                    rawLineColor={rawLineColor}
                    trendLineColor={trendLineColor}
                    expectedRangeFillColor={expectedRangeFillColor}
                    expectedRangeEdgeColor={expectedRangeEdgeColor}
                />

                {summaryLine}
            </Stack>
        );
    }

    return (
        <AppCard
            sx={mergeSx(shouldStretchChart ? { height: '100%', minHeight: 0 } : null, sx)}
            contentSx={{
                p: { xs: 1.25, sm: 1.5 },
                '&:last-child': { pb: { xs: 1.25, sm: 1.5 } },
                ...(shouldStretchChart
                    ? {
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0
                    }
                    : null)
            }}
        >
            <Stack spacing={1.25} sx={shouldStretchChart ? { height: '100%', minHeight: 0, flex: 1 } : undefined}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                        flexWrap: { xs: 'wrap', sm: 'nowrap' }
                    }}
                >
                    <Typography variant="h6" sx={{ minWidth: 0, flexGrow: 1 }}>{cardTitle}</Typography>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                        {action}
                        <Tooltip title={weightHistoryTooltipContent} arrow enterTouchDelay={0}>
                            <IconButton size="small" aria-label={t('goals.weightHistoryExplainer.tooltipAria')}>
                                <InfoOutlinedIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
                {content}
            </Stack>
        </AppCard>
    );
};

export default WeightTrend;
