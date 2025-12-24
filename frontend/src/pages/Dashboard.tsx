import React, { useMemo } from 'react';
import { Typography, Box, Grid } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import LogSummaryCard from '../components/LogSummaryCard';
import WeightProgressCard from '../components/WeightProgressCard';
import { formatDateToLocalDateString } from '../utils/date';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const timeZone = user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const today = formatDateToLocalDateString(new Date(), timeZone);

    type FoodLogEntry = { calories: number };

    const foodQuery = useQuery({
        queryKey: ['food', today],
        queryFn: async (): Promise<FoodLogEntry[]> => {
            const res = await axios.get('/api/food?date=' + encodeURIComponent(today));
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const totalCalories = useMemo(
        () => foodQuery.data?.reduce((total, entry) => total + (entry?.calories ?? 0), 0) ?? 0,
        [foodQuery.data]
    );

    return (
        <Box>
            <Typography variant="h4" gutterBottom>Dashboard</Typography>
            <CalorieTargetBanner consumedCalories={totalCalories} selectedDateLabel="Today" />

            <Grid container spacing={3} alignItems="stretch">
                <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
                    <LogSummaryCard dashboardMode />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
                    <WeightProgressCard />
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;
