import React from 'react';
import { Box, LinearProgress, Paper, Skeleton, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
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
    const navigate = useNavigate();
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
    const isMaintenanceGoal = goal?.daily_deficit === 0;

    const isLoading = goalQuery.isLoading || metricsQuery.isLoading;
    const isError = goalQuery.isError || metricsQuery.isError;

    let progressPercent: number | null = null;
    let maintenanceDeltaLabel: string | null = null;

    if (!isLoading && !isError && startWeight !== null && targetWeight !== null && currentWeight !== null) {
        if (isMaintenanceGoal) {
            const tolerance = weightUnitLabel === 'lb' ? 1 : 0.5;
            const delta = currentWeight - targetWeight;
            const absDelta = Math.abs(delta);
            const maxDelta = tolerance * 4;
            progressPercent = Math.max(0, Math.min(100, 100 - (absDelta / maxDelta) * 100));
            if (absDelta < 0.05) {
                maintenanceDeltaLabel = 'On target';
            } else {
                maintenanceDeltaLabel = `${absDelta.toFixed(1)} ${weightUnitLabel} ${delta > 0 ? 'above' : 'below'} target`;
            }
        } else {
            const totalDelta = startWeight - targetWeight;
            const achievedDelta = startWeight - currentWeight;
            progressPercent = totalDelta === 0 ? 100 : Math.max(Math.min((achievedDelta / totalDelta) * 100, 100), 0);
        }
    }

    // Assign the card body separately so the main JSX stays readable.
    let cardBody: React.ReactNode;
    if (isLoading) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Skeleton width="70%" />
                <Skeleton width="55%" />
                <Skeleton variant="rounded" height={10} />
                <Skeleton width="40%" />
            </Box>
        );
    } else if (isError) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                    Unable to load weight progress.
                </Typography>
                <Typography variant="body2" color="primary">
                    View goals and details
                </Typography>
            </Box>
        );
    } else {
        cardBody = (
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
                            {isMaintenanceGoal
                                ? maintenanceDeltaLabel ?? 'Close to target'
                                : `${progressPercent.toFixed(0)}% toward goal`}
                        </Typography>
                    </>
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        Add a start weight, target weight, and a current weight to see progress.
                    </Typography>
                )}
                <Typography variant="body2" color="primary">
                    View goals and details
                </Typography>
            </Box>
        );
    }

    return (
        <Paper
            sx={{
                p: 2,
                cursor: 'pointer',
                transition: 'transform 120ms ease',
                '&:hover': { transform: 'translateY(-2px)' },
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                width: '100%'
            }}
            onClick={() => navigate('/goals')}
        >
            <Typography variant="h6" gutterBottom>
                Weight Progress
            </Typography>
            {cardBody}
        </Paper>
    );
};

export default WeightProgressCard;
