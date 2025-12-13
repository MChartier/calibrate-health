import React, { useCallback } from 'react';
import { Typography, Box, Grid, Paper } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import WeightEntryForm from '../components/WeightEntryForm';
import FoodEntryForm from '../components/FoodEntryForm';
import FoodLogMeals from '../components/FoodLogMeals';
import { useQuery } from '@tanstack/react-query';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    const today = new Date().toISOString().split('T')[0] ?? '';

    type FoodLogEntry = {
        id: number;
        meal_period: string;
        name: string;
        calories: number;
    };

    type MetricEntry = {
        id: number;
        date: string;
        weight: number;
        body_fat_percent?: number | null;
    };

    const foodQuery = useQuery({
        queryKey: ['food', today],
        queryFn: async (): Promise<FoodLogEntry[]> => {
            const res = await axios.get('/api/food?date=' + encodeURIComponent(`${today}T12:00:00`));
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const metricsQuery = useQuery({
        queryKey: ['metrics'],
        queryFn: async (): Promise<MetricEntry[]> => {
            const res = await axios.get('/api/metrics');
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const logs = foodQuery.data ?? [];
    const metrics = metricsQuery.data ?? [];

    const refetchAll = useCallback(() => {
        void foodQuery.refetch();
        void metricsQuery.refetch();
    }, [foodQuery, metricsQuery]);

    const totalCalories = logs.reduce((acc, log) => acc + log.calories, 0);
    const currentWeight = metrics.length > 0 ? metrics[0].weight : null;

    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h4" gutterBottom>Dashboard</Typography>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Summary Today</Typography>
                        <Typography>Calories Consumed: {totalCalories}</Typography>
                        <Typography>
                            Current Weight: {typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} ${weightUnitLabel}` : 'N/A'}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Track Weight</Typography>
                        <Box sx={{ mt: 2 }}>
                            <WeightEntryForm onSuccess={refetchAll} />
                        </Box>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Track Food</Typography>
                        <Box sx={{ mt: 2 }}>
                            <FoodEntryForm date={today} onSuccess={refetchAll} />
                        </Box>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Today's Food Log</Typography>
                        <Box sx={{ mt: 2 }}>
                            <FoodLogMeals logs={logs} />
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;
