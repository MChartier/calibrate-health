import React from 'react';
import { Typography, Box, Grid, Paper } from '@mui/material';
import { useAuth } from '../context/useAuth';
import { useQuery } from '@tanstack/react-query';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import DashboardLogSummaryCard from '../components/DashboardLogSummaryCard';
import axios from 'axios';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    type MetricEntry = {
        id: number;
        date: string;
        weight: number;
        body_fat_percent?: number | null;
    };

    const metricsQuery = useQuery({
        queryKey: ['metrics'],
        queryFn: async (): Promise<MetricEntry[]> => {
            const res = await axios.get('/api/metrics');
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const metrics = metricsQuery.data ?? [];
    const currentWeight = metrics.length > 0 ? metrics[0].weight : null;

    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h4" gutterBottom>Dashboard</Typography>
            <CalorieTargetBanner />

            <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Summary Today</Typography>
                        <Typography>
                            Current Weight: {typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} ${weightUnitLabel}` : 'N/A'}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <DashboardLogSummaryCard />
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;
