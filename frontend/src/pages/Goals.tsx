import React, { useMemo, useState } from 'react';
import { Alert, Box, IconButton, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import GoalTrackerCard from '../components/GoalTrackerCard';
import { useAuth } from '../context/useAuth';
import { parseDateOnlyToLocalDate, startOfLocalDay } from '../utils/goalTracking';
import { MS_PER_DAY } from '../utils/date';
import { METRICS_RANGE_OPTIONS, type MetricsRange } from '../constants/metricsRanges';
import { fetchTrendMetrics } from '../queries/metrics';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';
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

    // Default to YEAR so long histories do not fetch/render the full timeline on initial load.
    const [selectedRange, setSelectedRange] = useState<MetricsRange>(METRICS_RANGE_OPTIONS.YEAR);

    const goalQuery = useQuery({
        queryKey: ['goal'],
        queryFn: async (): Promise<GoalResponse | null> => {
            const res = await axios.get('/api/goals');
            return res.data ?? null;
        }
    });

    const trendMetricsQuery = useQuery({
        queryKey: ['metrics', 'trend', selectedRange],
        queryFn: async () => fetchTrendMetrics(selectedRange)
    });

    const goal = goalQuery.data;
    const trendMetrics = useMemo(() => trendMetricsQuery.data?.metrics ?? [], [trendMetricsQuery.data]);
    const trendMeta = trendMetricsQuery.data?.meta ?? null;

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

    const activeSpanDays = useMemo(() => {
        if (points.length === 0) return 0;
        const start = startOfLocalDay(points[0].date);
        const end = startOfLocalDay(points[points.length - 1].date);
        const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
        return Math.max(1, diffDays + 1);
    }, [points]);

    const xAxisLabelOptions = useMemo(() => getAxisLabelOptions(activeSpanDays), [activeSpanDays]);
    const xAxisFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, xAxisLabelOptions), [xAxisLabelOptions]);
    const tooltipDateFormatter = useMemo(
        () => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
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

    const targetIsValid = typeof goal?.target_weight === 'number' && Number.isFinite(goal.target_weight);
    const yDomain = useMemo(() => {
        const values = points
            .flatMap((point) => [point.rawWeight, point.trendWeight, point.rangeLower, point.rangeUpper])
            .filter((value) => Number.isFinite(value));
        if (targetIsValid) values.push(goal!.target_weight);
        if (values.length === 0) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(0.1, max - min);
        const padding = range * 0.1;
        return { min: min - padding, max: max + padding };
    }, [goal, points, targetIsValid]);

    const showRangeControl =
        (trendMeta?.total_span_days ?? activeSpanDays) >= RANGE_CONTROL_MIN_DAYS ||
        (trendMeta?.total_points ?? points.length) >= RANGE_CONTROL_MIN_POINTS;

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
                flexWrap: 'wrap',
                gap: CONTROLS_ROW_GAP,
                alignItems: 'center',
                justifyContent: 'flex-end'
            }}
        >
            <ToggleButtonGroup
                color="primary"
                exclusive
                size="small"
                value={selectedRange}
                onChange={(_event, nextRange) => {
                    if (nextRange) setSelectedRange(nextRange as MetricsRange);
                }}
                aria-label={t('goals.weightHistoryRangeLabel')}
            >
                <ToggleButton value={METRICS_RANGE_OPTIONS.WEEK}>{t('goals.weightHistoryRangeWeek')}</ToggleButton>
                <ToggleButton value={METRICS_RANGE_OPTIONS.MONTH}>{t('goals.weightHistoryRangeMonth')}</ToggleButton>
                <ToggleButton value={METRICS_RANGE_OPTIONS.YEAR}>{t('goals.weightHistoryRangeYear')}</ToggleButton>
                <ToggleButton value={METRICS_RANGE_OPTIONS.ALL}>{t('goals.weightHistoryRangeAll')}</ToggleButton>
            </ToggleButtonGroup>
        </Box>
    ) : null;

    let weightHistoryContent: React.ReactNode;

    if (trendMetricsQuery.isError) {
        weightHistoryContent = <Alert severity="warning">{t('goals.weightHistoryLoadError')}</Alert>;
    } else if (trendMetricsQuery.isLoading) {
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
                <LineChart
                    xAxis={[
                        {
                            data: xData,
                            scaleType: 'time',
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
                            strokeWidth: RAW_MARK_STROKE_WIDTH_PX
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

                <AppCard>
                    <SectionHeader
                        title={t('goals.weightHistoryTitle')}
                        subtitle={t('goals.weightHistoryExplainer.inline')}
                        actions={weightHistoryHeaderActions}
                        sx={{ mb: 1.5 }}
                    />
                    {weightHistoryContent}
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default Goals;
