import React, { useCallback, useEffect } from 'react';
import { Box, Container, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import type { MealPeriod } from '../types/mealPeriod';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { QUICK_ADD_SHORTCUT_ACTIONS, QUICK_ADD_SHORTCUT_QUERY_PARAM } from '../constants/pwaShortcuts';
import { getQuickAddAction } from '../utils/quickAddShortcut';
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
    md: 'minmax(0, 1.4fr) minmax(320px, 0.8fr)',
    lg: 'minmax(0, 1.55fr) minmax(360px, 0.9fr)'
}; // Responsive Today workspace grid: work area first, context panels second.
const TODAY_WORKSPACE_AREAS = {
    xs: '"calories" "food" "weight" "trend" "goal" "completion"',
    md: '"calories weight" "food context" "completion completion"'
}; // Named areas keep the mobile task flow and desktop workspace mode explicit.
const TODAY_WORKSPACE_STATIC_HEIGHT_PX = 560; // Header, summary row, completion row, and grid gaps outside the flexible desktop work row.
const TODAY_WORKSPACE_AVAILABLE_HEIGHT = `var(${APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR}, 100svh)`;
const TODAY_WORKSPACE_MAIN_ROW_HEIGHT = {
    md: `clamp(540px, calc(${TODAY_WORKSPACE_AVAILABLE_HEIGHT} - ${TODAY_WORKSPACE_STATIC_HEIGHT_PX}px), 640px)`,
    lg: `clamp(580px, calc(${TODAY_WORKSPACE_AVAILABLE_HEIGHT} - ${TODAY_WORKSPACE_STATIC_HEIGHT_PX}px), 680px)`
}; // Caps the desktop work row against AppPage's content viewport; food log scrolls inside this track.

/**
 * Main logged-in workspace centered around the selected local day.
 */
const TodayWorkspace: React.FC = () => {
    const theme = useTheme();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap + 0.75 };
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedDate, today, navigation } = useLogDateNavigationState();
    const isSelectedToday = selectedDate === today;
    const {
        dialogs,
        openWeightDialogFromFab,
        openWeightDialogForLogDate,
        setLogDateNavigation,
        setLogDateOverride
    } = useQuickAddFab();

    useEffect(() => {
        setLogDateOverride(selectedDate);
    }, [selectedDate, setLogDateOverride]);

    useEffect(() => {
        setLogDateNavigation(navigation);
        return () => {
            setLogDateNavigation(null);
        };
    }, [navigation, setLogDateNavigation]);

    useEffect(() => {
        return () => {
            setLogDateOverride(null);
        };
    }, [setLogDateOverride]);

    const quickAddAction = getQuickAddAction(searchParams);

    useEffect(() => {
        if (!quickAddAction) return;

        navigation.setDate(today);

        switch (quickAddAction) {
            case QUICK_ADD_SHORTCUT_ACTIONS.food:
                dialogs.openFoodDialog();
                break;
            case QUICK_ADD_SHORTCUT_ACTIONS.weight:
                openWeightDialogFromFab();
                break;
            default:
                break;
        }

        if (searchParams.has(QUICK_ADD_SHORTCUT_QUERY_PARAM)) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete(QUICK_ADD_SHORTCUT_QUERY_PARAM);
            setSearchParams(nextParams, { replace: true });
        }
    }, [
        dialogs,
        navigation,
        openWeightDialogFromFab,
        quickAddAction,
        searchParams,
        setSearchParams,
        today
    ]);

    const handleAddFood = useCallback(
        (mealPeriod?: MealPeriod | null) => {
            dialogs.openFoodDialog(mealPeriod ?? null);
        },
        [dialogs]
    );

    return (
        <Container maxWidth="xl" disableGutters>
            <Stack spacing={sectionSpacing} useFlexGap>
                <TodayHeader navigation={navigation} />

                <Box
                    sx={{
                        display: 'grid',
                        gap: sectionSpacing,
                        gridTemplateColumns: TODAY_WORKSPACE_COLUMNS,
                        gridTemplateAreas: TODAY_WORKSPACE_AREAS,
                        gridTemplateRows: { xs: 'auto', md: `auto ${TODAY_WORKSPACE_MAIN_ROW_HEIGHT.md} auto` },
                        alignItems: { xs: 'start', md: 'stretch' },
                        [theme.breakpoints.up('lg')]: {
                            gridTemplateRows: `auto ${TODAY_WORKSPACE_MAIN_ROW_HEIGHT.lg} auto`
                        }
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
