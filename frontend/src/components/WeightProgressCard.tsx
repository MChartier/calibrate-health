import React from 'react';
import { Box, Card, CardActionArea, CardContent, Skeleton, Typography, LinearProgress } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/useAuth';

type GoalResponse = {
    start_weight: number;
    target_weight: number;
    daily_deficit: number;
};

type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

const WeightProgressCard: React.FC = () => {
    const { user } = useAuth();
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

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

    const goal = goalQuery.data;
    const metrics = metricsQuery.data ?? [];
    const currentWeight = metrics.length > 0 ? metrics[0].weight : null;

    const startWeight = goal?.start_weight ?? null;
    const targetWeight = goal?.target_weight ?? null;

    let progressPercent: number | null = null;
    if (startWeight !== null && targetWeight !== null && currentWeight !== null) {
        const totalDelta = startWeight - targetWeight;
        const achievedDelta = startWeight - currentWeight;
        progressPercent = totalDelta === 0 ? 100 : Math.max(Math.min((achievedDelta / totalDelta) * 100, 100), 0);
    }

    const isLoading = goalQuery.isLoading || metricsQuery.isLoading;
    const isError = goalQuery.isError || metricsQuery.isError;

    return (
        <Card
            sx={{
                transition: 'transform 120ms ease',
                '&:hover': { transform: 'translateY(-2px)' },
                height: '100%',
                width: '100%'
            }}
        >
            <CardActionArea component={RouterLink} to="/history" sx={{ height: '100%' }}>
                <CardContent sx={{ height: '100%' }}>
                    <Typography variant="h6" gutterBottom>
                        Weight Progress
                    </Typography>
                    {isLoading ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Skeleton width="70%" />
                            <Skeleton width="55%" />
                            <Skeleton variant="rounded" height={10} />
                            <Skeleton width="40%" />
                        </Box>
                    ) : isError ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">
                                Unable to load weight progress.
                            </Typography>
                            <Typography variant="body2" color="primary">
                                View history and details
                            </Typography>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                                Start: {startWeight !== null ? `${startWeight} ${weightUnitLabel}` : '—'} · Target:{' '}
                                {targetWeight !== null ? `${targetWeight} ${weightUnitLabel}` : '—'}
                            </Typography>
                            <Typography variant="body1">
                                Current: {currentWeight !== null ? `${currentWeight} ${weightUnitLabel}` : '—'}
                            </Typography>
                            {progressPercent !== null ? (
                                <>
                                    <LinearProgress
                                        variant="determinate"
                                        value={Math.min(progressPercent, 100)}
                                        sx={{ height: 10, borderRadius: 5 }}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        {progressPercent.toFixed(0)}% toward goal
                                    </Typography>
                                </>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    Add a start weight, target weight, and a current weight to see progress.
                                </Typography>
                            )}
                            <Typography variant="body2" color="primary">
                                View history and details
                            </Typography>
                        </Box>
                    )}
                </CardContent>
            </CardActionArea>
        </Card>
    );
};

export default WeightProgressCard;
