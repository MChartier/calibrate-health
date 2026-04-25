import React from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import { useQuickAddFab } from '../context/useQuickAddFab';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import LogSummaryCard from '../components/LogSummaryCard';
import GoalTrackerCard from '../components/GoalTrackerCard';
import WeightSummaryCard from '../components/WeightSummaryCard';
import { getTodayIsoDate } from '../utils/date';

/**
 * Dashboard landing page for signed-in users.
 *
 * Presents the current day's action state first, then supporting target and goal context so the tab has a distinct
 * "what needs attention now?" purpose instead of duplicating the detail pages.
 */
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { openWeightDialogFromFab } = useQuickAddFab();
    const theme = useTheme();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    const today = React.useMemo(() => getTodayIsoDate(user?.timezone), [user?.timezone]);
    // Shared card spacing across the dashboard grid; compact on mobile to reduce unnecessary scrolling.
    const cardGap = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap };

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' },
                gap: cardGap,
                alignItems: 'stretch',
                gridAutoFlow: 'dense'
            }}
        >
            <Box sx={{ gridColumn: { lg: 'span 2' } }}>
                <LogSummaryCard dashboardMode completionMode="status" />
            </Box>

            <WeightSummaryCard date={today} onOpenWeightEntry={openWeightDialogFromFab} />

            <Box sx={{ gridColumn: { lg: 'span 2' } }}>
                <GoalTrackerCard isDashboard />
            </Box>

            <CalorieTargetBanner isDashboard />
        </Box>
    );
};

export default Dashboard;
