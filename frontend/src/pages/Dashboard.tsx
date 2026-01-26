import React from 'react';
import { Box } from '@mui/material';
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
    // Shared card spacing across the dashboard stack.
    const cardGap = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap };

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
                gap: cardGap,
                alignItems: 'stretch'
            }}
        >
            <Box sx={{ gridColumn: { lg: '1 / -1' } }}>
                <CalorieTargetBanner isDashboard />
            </Box>

            <LogSummaryCard dashboardMode />
            <GoalTrackerCard isDashboard />
        </Box>
    );
};

export default Dashboard;
