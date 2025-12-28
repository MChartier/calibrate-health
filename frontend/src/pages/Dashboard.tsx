import React from 'react';
import { Box, Grid } from '@mui/material';
import { useAuth } from '../context/useAuth';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import LogSummaryCard from '../components/LogSummaryCard';
import GoalTrackerCard from '../components/GoalTrackerCard';

const Dashboard: React.FC = () => {
    useAuth(); // ensure auth context is initialized

    return (
        <Box>
            <CalorieTargetBanner isDashboard />

            <Grid container spacing={3} alignItems="stretch">
                <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
                    <LogSummaryCard dashboardMode />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
                    <GoalTrackerCard isDashboard />
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;
