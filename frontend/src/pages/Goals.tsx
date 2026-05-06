import React from 'react';
import { Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import GoalTrackerCard from '../components/GoalTrackerCard';
import AppPage from '../ui/AppPage';

/**
 * Goals route: define the current weight goal and inspect the calorie target it drives.
 */
const Goals: React.FC = () => {
    const theme = useTheme();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    // Goals is a detail route, so compact mobile spacing keeps the editor and target details connected.
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap };

    return (
        <AppPage maxWidth="content">
            <Stack spacing={sectionSpacing} useFlexGap>
                <GoalTrackerCard />
                <CalorieTargetBanner />
            </Stack>
        </AppPage>
    );
};

export default Goals;
