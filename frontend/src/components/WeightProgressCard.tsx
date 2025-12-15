import React from 'react';
import { Box, Paper, Typography, LinearProgress } from '@mui/material';
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

    let progressPercent: number | null = null;
    if (startWeight !== null && targetWeight !== null && currentWeight !== null) {
        const totalDelta = startWeight - targetWeight;
        const achievedDelta = startWeight - currentWeight;
        progressPercent = totalDelta === 0 ? 100 : Math.max(Math.min((achievedDelta / totalDelta) * 100, 100), 0);
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
            onClick={() => navigate('/history')}
        >
            <Typography variant="h6" gutterBottom>
                Weight Progress
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    Start: {startWeight !== null ? `${startWeight} ${weightUnitLabel}` : '—'} · Target: {targetWeight !== null ? `${targetWeight} ${weightUnitLabel}` : '—'}
                </Typography>
                <Typography variant="body1">
                    Current: {currentWeight !== null ? `${currentWeight} ${weightUnitLabel}` : '—'}
                </Typography>
                {progressPercent !== null ? (
                    <>
                        <LinearProgress variant="determinate" value={Math.min(progressPercent, 100)} sx={{ height: 10, borderRadius: 5 }} />
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
        </Paper>
    );
};

export default WeightProgressCard;
