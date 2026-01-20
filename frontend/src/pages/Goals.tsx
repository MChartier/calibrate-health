import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Skeleton,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import GoalTrackerCard from '../components/GoalTrackerCard';
import { useAuth } from '../context/useAuth';
import { addDays, parseDateOnlyToLocalDate, startOfLocalDay } from '../utils/goalTracking';
import { MS_PER_DAY } from '../utils/date';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';
import { useI18n } from '../i18n/useI18n';

/**
 * Goals page with progress card and weight history chart.
 */
type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

type GoalResponse = {
    id: number;
    user_id: number;
    start_weight: number;
    target_weight: number;
    target_date: string | null;
    daily_deficit: number;
    created_at: string;
};

type WeightPoint = { date: Date; weight: number };

const WEIGHT_HISTORY_RANGES = {
    WEEK: 'WEEK',
    MONTH: 'MONTH',
    YEAR: 'YEAR',
    ALL: 'ALL'
} as const;

type WeightHistoryRange = (typeof WEIGHT_HISTORY_RANGES)[keyof typeof WEIGHT_HISTORY_RANGES];

const RANGE_DAYS_BY_KEY: Record<Exclude<WeightHistoryRange, 'ALL'>, number> = {
    WEEK: 7,
    MONTH: 30,
    YEAR: 365
};

const RANGE_CONTROL_MIN_POINTS = 45; // Minimum number of points before showing the range control.
const RANGE_CONTROL_MIN_DAYS = 45; // Minimum span (in days) before showing the range control.

/**
 * Compute the local-day start date for a range window ending at the latest weight entry.
 */
function getRangeStartDate(endDate: Date, range: WeightHistoryRange): Date | null {
    if (range === WEIGHT_HISTORY_RANGES.ALL) return null;
    const days = RANGE_DAYS_BY_KEY[range];
    return addDays(startOfLocalDay(endDate), -(days - 1));
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
    const sectionGap = theme.custom.layout.page.sectionGap;
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const weightSeriesLabel = t('goals.weightSeriesLabel', { unit: unitLabel });
    const legendSwatchSizePx = 12;
    const weightChartHeightPx = 320;

    const goalQuery = useQuery({
        queryKey: ['goal'],
        queryFn: async (): Promise<GoalResponse | null> => {
            const res = await axios.get('/api/goals');
            return res.data ?? null;
        }
    });

    const metricsQuery = useQuery({
        queryKey: ['metrics'],
        queryFn: async (): Promise<MetricEntry[]> => {
            const res = await axios.get('/api/metrics');
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);
    const goal = goalQuery.data;

    const [selectedRange, setSelectedRange] = useState<WeightHistoryRange | null>(null);

    const points = useMemo(() => {
        const parsed: WeightPoint[] = metrics
            .filter((metric) => typeof metric.weight === 'number' && Number.isFinite(metric.weight))
            .map((metric) => {
                const date = parseDateOnlyToLocalDate(metric.date);
                if (!date) return null;
                return { date, weight: metric.weight };
            })
            .filter((value): value is WeightPoint => value !== null);

        parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
        return parsed;
    }, [metrics]);

    const spanDays = useMemo(() => {
        if (points.length === 0) return 0;
        const start = startOfLocalDay(points[0].date);
        const end = startOfLocalDay(points[points.length - 1].date);
        const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
        return Math.max(1, diffDays + 1);
    }, [points]);

    const defaultRange = useMemo<WeightHistoryRange>(() => {
        if (spanDays >= RANGE_DAYS_BY_KEY.YEAR) return WEIGHT_HISTORY_RANGES.YEAR;
        if (spanDays >= RANGE_DAYS_BY_KEY.MONTH) return WEIGHT_HISTORY_RANGES.MONTH;
        return WEIGHT_HISTORY_RANGES.ALL;
    }, [spanDays]);

    const activeRange = selectedRange ?? defaultRange;

    const filteredPoints = useMemo(() => {
        if (points.length === 0) return [];
        const endDate = points[points.length - 1].date;
        const startDate = getRangeStartDate(endDate, activeRange);
        if (!startDate) return points;
        return points.filter((point) => point.date >= startDate);
    }, [activeRange, points]);

    const activeSpanDays = useMemo(() => {
        if (filteredPoints.length === 0) return 0;
        const start = startOfLocalDay(filteredPoints[0].date);
        const end = startOfLocalDay(filteredPoints[filteredPoints.length - 1].date);
        const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
        return Math.max(1, diffDays + 1);
    }, [filteredPoints]);

    const xAxisLabelOptions = useMemo(() => getAxisLabelOptions(activeSpanDays), [activeSpanDays]);
    const xAxisFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, xAxisLabelOptions), [xAxisLabelOptions]);
    const tooltipDateFormatter = useMemo(
        () => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        []
    );

    const xData = useMemo(() => filteredPoints.map((point) => point.date), [filteredPoints]);
    const yData = useMemo(() => filteredPoints.map((point) => point.weight), [filteredPoints]);

    const targetIsValid = typeof goal?.target_weight === 'number' && Number.isFinite(goal.target_weight);
    const yDomain = useMemo(() => {
        const values = [...yData, ...(targetIsValid ? [goal!.target_weight] : [])];
        if (values.length === 0) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(0.1, max - min);
        const padding = range * 0.1;
        return { min: min - padding, max: max + padding };
    }, [goal, targetIsValid, yData]);

    const showRangeControl = spanDays >= RANGE_CONTROL_MIN_DAYS || points.length >= RANGE_CONTROL_MIN_POINTS;
    const rangeControl = showRangeControl ? (
        <ToggleButtonGroup
            color="primary"
            exclusive
            size="small"
            value={activeRange}
            onChange={(_event, next) => {
                if (next) setSelectedRange(next);
            }}
            aria-label={t('goals.weightHistoryRangeLabel')}
        >
            <ToggleButton value={WEIGHT_HISTORY_RANGES.WEEK}>{t('goals.weightHistoryRangeWeek')}</ToggleButton>
            <ToggleButton value={WEIGHT_HISTORY_RANGES.MONTH}>{t('goals.weightHistoryRangeMonth')}</ToggleButton>
            <ToggleButton value={WEIGHT_HISTORY_RANGES.YEAR}>{t('goals.weightHistoryRangeYear')}</ToggleButton>
            <ToggleButton value={WEIGHT_HISTORY_RANGES.ALL}>{t('goals.weightHistoryRangeAll')}</ToggleButton>
        </ToggleButtonGroup>
    ) : null;

    let weightHistoryContent: React.ReactNode;

    if (metricsQuery.isError) {
        weightHistoryContent = <Alert severity="warning">{t('goals.weightHistoryLoadError')}</Alert>;
    } else if (metricsQuery.isLoading) {
        weightHistoryContent = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Skeleton width="40%" />
                <Skeleton variant="rounded" height={weightChartHeightPx} />
            </Box>
        );
    } else if (points.length === 0) {
        weightHistoryContent = <Typography color="text.secondary">{t('goals.noWeightEntries')}</Typography>;
    } else {
        weightHistoryContent = (
            <Stack spacing={1.5}>
                {rangeControl && <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>{rangeControl}</Box>}
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
                            label: weightSeriesLabel
                        }
                    ]}
                    series={[
                        {
                            data: yData,
                            label: weightSeriesLabel,
                            color: theme.palette.primary.main,
                            showMark: true
                        }
                    ]}
                    height={weightChartHeightPx}
                    slotProps={{ legend: { hidden: true } }}
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

                <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
                    <Box
                        aria-hidden
                        sx={{
                            width: legendSwatchSizePx,
                            height: legendSwatchSizePx,
                            borderRadius: '50%',
                            backgroundColor: theme.palette.primary.main
                        }}
                    />
                    <Typography variant="body2" color="text.secondary">
                        {weightSeriesLabel}
                    </Typography>
                </Box>
            </Stack>
        );
    }

    return (
        <AppPage maxWidth="wide">
            <Stack spacing={sectionGap} useFlexGap>
                <GoalTrackerCard />

                <AppCard>
                    <SectionHeader title={t('goals.weightHistoryTitle')} sx={{ mb: 1.5 }} />
                    {weightHistoryContent}
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default Goals;
