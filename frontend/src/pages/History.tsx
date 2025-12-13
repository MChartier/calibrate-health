import React, { useEffect, useMemo, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';

type Metric = {
    id: number;
    date: string;
    weight: number;
};

type WeightPoint = { date: Date; weight: number };

function parseDateOnlyToLocalDate(value: string): Date | null {
    const datePart = value.split('T')[0] ?? '';
    const [yearString, monthString, dayString] = datePart.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return new Date(year, month - 1, day);
}

const History: React.FC = () => {
    const { user } = useAuth();
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    const [metrics, setMetrics] = useState<Metric[]>([]);
    const [targetWeight, setTargetWeight] = useState<number | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [metricsRes, goalRes] = await Promise.all([
                    axios.get('/api/metrics'),
                    axios.get('/api/goals')
                ]);

                setMetrics(Array.isArray(metricsRes.data) ? metricsRes.data : []);
                setTargetWeight(goalRes.data?.target_weight ?? null);
            } catch (err) {
                console.error(err);
            }
        };

        fetchData();
    }, []);

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

    return (
        <Box sx={{ mt: 1 }}>
            <Typography variant="h4" gutterBottom>
                History
            </Typography>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Weight Over Time
                </Typography>

                {points.length === 0 ? (
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
                )}
            </Paper>
        </Box>
    );
};

export default History;
