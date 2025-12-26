import React, { useMemo } from 'react';
import {
    Alert,
    Box,
    Paper,
    Skeleton,
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
    const theme = useTheme();
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

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

    return (
        <Box sx={{ maxWidth: 960, mx: 'auto' }}>
            <Box sx={{ mb: 3 }}>
                <GoalTrackerCard />
            </Box>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Weight Over Time
                </Typography>

                {metricsQuery.isError ? (
                    <Alert severity="warning">Unable to load weight history.</Alert>
                ) : metricsQuery.isLoading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Skeleton width="40%" />
                        <Skeleton variant="rounded" height={320} />
                    </Box>
                ) : points.length === 0 ? (
                    <Typography color="text.secondary">No weight entries yet.</Typography>
                ) : (
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
                                label: `Weight (${unitLabel})`
                            }
                        ]}
                        series={[
                            {
                                data: yData,
                                label: 'Weight',
                                color: theme.palette.primary.main,
                                showMark: true
                            }
                        ]}
                        height={320}
                    >
                        {targetIsValid && (
                            <ChartsReferenceLine
                                y={goal!.target_weight}
                                label={`Target: ${goal!.target_weight.toFixed(1)} ${unitLabel}`}
                                lineStyle={{
                                    stroke: theme.palette.secondary.main,
                                    strokeDasharray: '6 6',
                                    strokeWidth: 2
                                }}
                                labelStyle={{ fill: theme.palette.text.secondary, fontWeight: 700 }}
                            />
                        )}
                    </LineChart>
                )}
            </Paper>
        </Box>
    );
};

export default Goals;
