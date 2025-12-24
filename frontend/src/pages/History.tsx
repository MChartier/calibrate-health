import React, { useMemo } from 'react';
import { Alert, Box, Button, Paper, Skeleton, Stack, Typography } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useQuery } from '@tanstack/react-query';
import { getTodayIsoDate } from '../utils/date';
import { useUserProfileQuery } from '../queries/userProfile';

type Metric = {
    id: number;
    date: string;
    weight: number;
};

type WeightPoint = { date: Date; weight: number };
type CaloriePoint = { date: Date; calories: number };

/**
 * Convert a date-only string (`YYYY-MM-DD` or an ISO datetime string) into a UTC midnight Date.
 *
 * We intentionally use UTC so date-only values don't shift when the browser time zone changes.
 */
function parseDateOnlyToUtcDate(value: string): Date | null {
    const datePart = value.split('T')[0] ?? '';
    const [yearString, monthString, dayString] = datePart.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return new Date(Date.UTC(year, month - 1, day));
}

const History: React.FC = () => {
    const { user } = useAuth();
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const todayIso = getTodayIsoDate(user?.timezone);

    const metricsQuery = useQuery({
        queryKey: ['metrics'],
        queryFn: async (): Promise<Metric[]> => {
            const res = await axios.get('/api/metrics');
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const goalQuery = useQuery({
        queryKey: ['goal'],
        queryFn: async (): Promise<{ target_weight?: number; start_weight?: number; daily_deficit?: number } | null> => {
            const res = await axios.get('/api/goals');
            return res.data ?? null;
        }
    });

    const profileQuery = useUserProfileQuery();

    const dailyTarget = profileQuery.data?.calorieSummary?.dailyCalorieTarget;
    const hasDailyTarget = typeof dailyTarget === 'number' && Number.isFinite(dailyTarget);

    const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);
    const targetWeight = goalQuery.data?.target_weight ?? null;
    const dailyDeficit = goalQuery.data?.daily_deficit ?? null;
    const latestMetric = metrics[0] ?? null;
    const currentWeight = latestMetric?.weight ?? null;

    const projection = useMemo(() => {
        if (!latestMetric) return null;
        if (typeof currentWeight !== 'number' || !Number.isFinite(currentWeight)) return null;
        if (typeof targetWeight !== 'number' || !Number.isFinite(targetWeight)) return null;
        if (typeof dailyDeficit !== 'number' || !Number.isFinite(dailyDeficit) || dailyDeficit === 0) return null;

        const kcalPerUnit = user?.weight_unit === 'LB' ? 3500 : 7700;
        const ratePerDay = -dailyDeficit / kcalPerUnit; // negative = losing, positive = gaining
        if (!Number.isFinite(ratePerDay) || ratePerDay === 0) return null;

        const delta = targetWeight - currentWeight;
        const days = delta / ratePerDay;
        if (!Number.isFinite(days) || days <= 0) return null;

        const baseDate = parseDateOnlyToUtcDate(latestMetric.date) ?? new Date();
        const projectedDate = new Date(baseDate);
        projectedDate.setUTCDate(projectedDate.getUTCDate() + Math.ceil(days));

        return {
            projectedDate,
            ratePerWeek: ratePerDay * 7
        };
    }, [currentWeight, dailyDeficit, latestMetric, targetWeight, user?.weight_unit]);

    const calorieWindow = useMemo(() => {
        const end = new Date(todayIso);
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - 29);
        return { startIso: start.toISOString().slice(0, 10), endIso: todayIso };
    }, [todayIso]);

    const dailyCaloriesQuery = useQuery({
        queryKey: ['food-daily', calorieWindow.startIso, calorieWindow.endIso],
        queryFn: async (): Promise<Array<{ date: string; calories: number }>> => {
            const res = await axios.get('/api/food/daily', {
                params: { start: calorieWindow.startIso, end: calorieWindow.endIso }
            });
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const points = useMemo(() => {
        const parsed: WeightPoint[] = metrics
            .filter((metric) => typeof metric.weight === 'number' && Number.isFinite(metric.weight))
            .map((metric) => {
                const date = parseDateOnlyToUtcDate(metric.date);
                if (!date) return null;
                return { date, weight: metric.weight };
            })
            .filter((value): value is WeightPoint => value !== null);

        parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
        return parsed;
    }, [metrics]);

    const targetIsValid = typeof targetWeight === 'number' && Number.isFinite(targetWeight);
    const xData = useMemo(() => points.map((point) => point.date), [points]);
    const yData = useMemo(() => points.map((point) => point.weight), [points]);
    const yDomain = useMemo(() => {
        const values = [...yData, ...(targetIsValid ? [targetWeight] : [])];
        if (values.length === 0) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(0.1, max - min);
        const padding = range * 0.1;
        return { min: min - padding, max: max + padding };
    }, [targetIsValid, targetWeight, yData]);

    const caloriePoints = useMemo(() => {
        const items = dailyCaloriesQuery.data ?? [];
        const caloriesByDate = new Map<string, number>();

        for (const item of items) {
            if (typeof item?.calories !== 'number' || !Number.isFinite(item.calories)) continue;
            const datePart = typeof item?.date === 'string' ? item.date.split('T')[0] ?? '' : '';
            if (!datePart) continue;
            caloriesByDate.set(datePart, item.calories);
        }

        const start = parseDateOnlyToUtcDate(calorieWindow.startIso);
        const end = parseDateOnlyToUtcDate(calorieWindow.endIso);
        if (!start || !end) return [];

        const points: CaloriePoint[] = [];
        const cursor = new Date(start);
        while (cursor.getTime() <= end.getTime()) {
            const iso = cursor.toISOString().slice(0, 10);
            points.push({ date: new Date(cursor), calories: caloriesByDate.get(iso) ?? 0 });
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        return points;
    }, [dailyCaloriesQuery.data, calorieWindow.endIso, calorieWindow.startIso]);

    const calorieXData = useMemo(() => caloriePoints.map((point) => point.date), [caloriePoints]);
    const calorieYData = useMemo(() => caloriePoints.map((point) => point.calories), [caloriePoints]);
    const calorieYDomain = useMemo(() => {
        const values = [...calorieYData, ...(hasDailyTarget ? [dailyTarget] : [])].filter(
            (value): value is number => typeof value === 'number' && Number.isFinite(value)
        );
        if (values.length === 0) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(1, max - min);
        const padding = range * 0.1;
        return { min: Math.max(0, min - padding), max: max + padding };
    }, [calorieYData, dailyTarget, hasDailyTarget]);

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                History
            </Typography>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Weight Over Time
                </Typography>

                {(metricsQuery.isLoading || goalQuery.isLoading) && (
                    <Stack spacing={2}>
                        <Skeleton variant="rounded" height={320} />
                        <Skeleton width="40%" />
                    </Stack>
                )}

                {(metricsQuery.isError || goalQuery.isError) && (
                    <Alert
                        severity="error"
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() => {
                                    void metricsQuery.refetch();
                                    void goalQuery.refetch();
                                }}
                            >
                                Retry
                            </Button>
                        }
                    >
                        Unable to load history right now.
                    </Alert>
                )}

                {!metricsQuery.isLoading && !goalQuery.isLoading && !metricsQuery.isError && !goalQuery.isError && points.length === 0 ? (
                    <Typography color="text.secondary">No weight entries yet.</Typography>
                ) : (
                    !metricsQuery.isLoading &&
                    !goalQuery.isLoading &&
                    !metricsQuery.isError &&
                    !goalQuery.isError && (
                        <LineChart
                            xAxis={[
                                {
                                    data: xData,
                                    scaleType: 'time',
                                    valueFormatter: (value) =>
                                        new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(value)
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
                                    showMark: true
                                }
                            ]}
                            height={320}
                        >
                            {targetIsValid && (
                                <ChartsReferenceLine
                                    y={targetWeight}
                                    label={`Target: ${targetWeight.toFixed(1)} ${unitLabel}`}
                                    lineStyle={{ strokeDasharray: '6 6' }}
                                />
                            )}
                        </LineChart>
                    )
                )}

                {!metricsQuery.isLoading && !goalQuery.isLoading && !metricsQuery.isError && !goalQuery.isError && projection && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        Estimated to reach your target around{' '}
                        <strong>
                            {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
                                projection.projectedDate
                            )}
                        </strong>{' '}
                        at a steady {Math.abs(projection.ratePerWeek).toFixed(2)} {unitLabel}/week.
                    </Alert>
                )}
            </Paper>

            <Paper sx={{ p: 2, mt: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Calories Over Time
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Last 30 days · Daily totals compared to your current target.
                </Typography>

                {dailyCaloriesQuery.isLoading || profileQuery.isLoading ? (
                    <Stack spacing={2}>
                        <Skeleton variant="rounded" height={320} />
                        <Skeleton width="40%" />
                    </Stack>
                ) : dailyCaloriesQuery.isError || profileQuery.isError ? (
                    <Alert
                        severity="error"
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() => {
                                    void dailyCaloriesQuery.refetch();
                                    void profileQuery.refetch();
                                }}
                            >
                                Retry
                            </Button>
                        }
                    >
                        Unable to load calorie history right now.
                    </Alert>
                ) : (dailyCaloriesQuery.data ?? []).length === 0 ? (
                    <Typography color="text.secondary">No food entries yet.</Typography>
                ) : (
                    <LineChart
                        xAxis={[
                            {
                                data: calorieXData,
                                scaleType: 'time',
                                valueFormatter: (value) =>
                                    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(value)
                            }
                        ]}
                        yAxis={[
                            {
                                min: calorieYDomain?.min,
                                max: calorieYDomain?.max,
                                label: 'Calories'
                            }
                        ]}
                        series={[
                            {
                                data: calorieYData,
                                label: 'Consumed',
                                showMark: true
                            }
                        ]}
                        height={320}
                    >
                        {hasDailyTarget && (
                            <ChartsReferenceLine
                                y={dailyTarget}
                                label={`Target: ${Math.round(dailyTarget)} kcal`}
                                lineStyle={{ strokeDasharray: '6 6' }}
                            />
                        )}
                    </LineChart>
                )}
            </Paper>
        </Box>
    );
};

export default History;
