import React from 'react';
import { Grid, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import LogSummaryCard from '../components/LogSummaryCard';
import GoalTrackerCard from '../components/GoalTrackerCard';

/**
 * Dashboard landing page for signed-in users.
 */
const Dashboard: React.FC = () => {
    useAuth();
    const theme = useTheme();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    // Tighter section spacing on small screens keeps card stacks compact.
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap };
    // Add a touch more breathing room when cards sit side by side.
    const dashboardGridSpacingMd = sectionGap + 1;

    return (
        <Stack spacing={sectionSpacing} useFlexGap>
            <CalorieTargetBanner isDashboard />

            <Grid
                container
                spacing={{ xs: sectionGapCompact, sm: sectionGapCompact, md: dashboardGridSpacingMd }}
                alignItems="stretch"
            >
                <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
                    <LogSummaryCard dashboardMode />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
                    <GoalTrackerCard isDashboard />
                </Grid>
            </Grid>

        </Stack>
    );
};

export default Dashboard;
