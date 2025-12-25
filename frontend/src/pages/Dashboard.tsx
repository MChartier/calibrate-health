import React from 'react';
import { Box, Grid } from '@mui/material';
import { useAuth } from '../context/useAuth';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import LogSummaryCard from '../components/LogSummaryCard';
import WeightProgressCard from '../components/WeightProgressCard';

const Dashboard: React.FC = () => {
    useAuth(); // ensure auth context is initialized

    return (
        <Box>
            <CalorieTargetBanner />

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
