import React, { useMemo } from 'react';
import {
    Alert,
    Box,
    Skeleton,
    Stack,
    Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import GoalTrackerCard from '../components/GoalTrackerCard';
import { useAuth } from '../context/useAuth';
import { parseDateOnlyToLocalDate } from '../utils/goalTracking';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';
import { useI18n } from '../i18n/useI18n';

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

    const xData = useMemo(() => points.map((point) => point.date), [points]);
    const yData = useMemo(() => points.map((point) => point.weight), [points]);

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
                <LineChart
                    xAxis={[
                        {
                            data: xData,
                            scaleType: 'time',
                            valueFormatter: (value) =>
                                new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value)
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
