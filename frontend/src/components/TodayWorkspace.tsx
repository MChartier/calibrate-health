import React, { useCallback } from 'react';
import { Box, Container, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { MealPeriod } from '../types/mealPeriod';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { useQuickAddLogDateBridge, useQuickAddShortcutAction } from '../hooks/useQuickAddRouteState';
import { APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR } from '../ui/layoutCssVars';
import CalorieSummary from './CalorieSummary';
import DayCompletionControl from './DayCompletionControl';
import FoodLog from './FoodLog';
import GoalProjection from './GoalProjection';
import TodayHeader from './TodayHeader';
import WeightSummaryCard from './WeightSummaryCard';
import WeightTrend from './WeightTrend';

const TODAY_WORKSPACE_COLUMNS = {
    xs: '1fr',
    md: 'minmax(0, 1.25fr) minmax(360px, 0.95fr)',
    lg: 'minmax(0, 1.35fr) minmax(420px, 1fr)'
}; // Responsive Today workspace grid: work area first, context panels second.
const TODAY_WORKSPACE_AREAS = {
    xs: '"calories" "food" "weight" "trend" "goal" "completion"',
    md: '"calories weight" "food context" "completion completion"'
}; // Named areas keep the mobile task flow and desktop workspace mode explicit.
const TODAY_WORKSPACE_AVAILABLE_HEIGHT = `var(${APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR}, 100svh)`;
const TODAY_WORKSPACE_GRID_ROWS = {
    xs: 'auto',
    md: 'auto minmax(0, 1fr) auto'
}; // Desktop rows consume the measured AppPage viewport instead of relying on a static-height estimate.

/**
 * Main logged-in workspace centered around the selected local day.
 */
const TodayWorkspace: React.FC = () => {
    const theme = useTheme();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap + 0.75 };
    const { selectedDate, today, navigation } = useLogDateNavigationState();
    const isSelectedToday = selectedDate === today;
    const {
        dialogs,
        openWeightDialogFromFab,
        openWeightDialogForLogDate,
        setLogDateNavigation,
        setLogDateOverride
    } = useQuickAddFab();
    const { openFoodDialog } = dialogs;

    useQuickAddLogDateBridge({
        selectedDate,
        navigation,
        setLogDateNavigation,
        setLogDateOverride
    });

    useQuickAddShortcutAction({
        navigation,
        today,
        openFoodDialog,
        openWeightDialog: openWeightDialogFromFab
    });

    const handleAddFood = useCallback(
        (mealPeriod?: MealPeriod | null) => {
            openFoodDialog(mealPeriod ?? null);
        },
        [openFoodDialog]
    );

    return (
        <Container maxWidth="xl" disableGutters sx={{ height: { md: TODAY_WORKSPACE_AVAILABLE_HEIGHT }, minHeight: { md: 0 } }}>
            <Stack spacing={sectionSpacing} useFlexGap sx={{ height: { md: '100%' }, minHeight: { md: 0 } }}>
                <TodayHeader navigation={navigation} />

                <Box
                    sx={{
                        flex: { md: 1 },
                        minHeight: { md: 0 },
                        display: 'grid',
                        gap: sectionSpacing,
                        gridTemplateColumns: TODAY_WORKSPACE_COLUMNS,
                        gridTemplateAreas: TODAY_WORKSPACE_AREAS,
                        gridTemplateRows: TODAY_WORKSPACE_GRID_ROWS,
                        alignItems: { xs: 'start', md: 'stretch' }
                    }}
                >
                    <Box sx={{ gridArea: 'calories', minWidth: 0, display: 'flex' }}>
                        <CalorieSummary date={selectedDate} isSelectedToday={isSelectedToday} sx={{ height: '100%' }} />
                    </Box>

                    <Box sx={{ gridArea: 'weight', minWidth: 0, display: 'flex' }}>
                        <WeightSummaryCard
                            date={selectedDate}
                            onOpenWeightEntry={openWeightDialogForLogDate}
                            sx={{ height: '100%' }}
                        />
                    </Box>

                    <Box sx={{ gridArea: 'food', minWidth: 0, minHeight: 0, display: 'flex' }}>
                        <FoodLog
                            date={selectedDate}
                            isSelectedToday={isSelectedToday}
                            onAddFood={handleAddFood}
                            fillAvailableHeight
                        />
                    </Box>

                    <Box
                        sx={{
                            gridArea: { md: 'context' },
                            minWidth: 0,
                            minHeight: 0,
                            display: { xs: 'contents', md: 'flex' },
                            flexDirection: { md: 'column' },
                            gap: sectionSpacing,
                            height: { md: '100%' }
                        }}
                    >
                        <Box sx={{ gridArea: 'trend', minWidth: 0, minHeight: 0, display: { md: 'flex' }, flex: { md: 1 } }}>
                            <WeightTrend fillAvailableHeight sx={{ minHeight: 0 }} />
                        </Box>
                        <Box sx={{ gridArea: 'goal', minWidth: 0, flexShrink: { md: 0 } }}>
                            <GoalProjection />
                        </Box>
                    </Box>

                    <Box sx={{ gridArea: 'completion', minWidth: 0 }}>
                        <DayCompletionControl date={selectedDate} />
                    </Box>
                </Box>
            </Stack>
        </Container>
    );
};

export default TodayWorkspace;
