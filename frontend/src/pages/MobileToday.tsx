import React, { useCallback, useState } from 'react';
import { Box, Paper, Stack, Tab, Tabs } from '@mui/material';
import CalorieSummary from '../components/CalorieSummary';
import DayCompletionControl from '../components/DayCompletionControl';
import FoodLog from '../components/FoodLog';
import GoalProjection from '../components/GoalProjection';
import TodayHeader from '../components/TodayHeader';
import WeightSummaryCard from '../components/WeightSummaryCard';
import WeightTrend from '../components/WeightTrend';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useI18n } from '../i18n/useI18n';
import { useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { useQuickAddLogDateBridge, useQuickAddShortcutAction } from '../hooks/useQuickAddRouteState';
import type { MealPeriod } from '../types/mealPeriod';

const MOBILE_DASHBOARD_TABS = {
    log: 'log',
    goals: 'goals'
} as const;

type MobileDashboardTab = (typeof MOBILE_DASHBOARD_TABS)[keyof typeof MOBILE_DASHBOARD_TABS];
const MOBILE_DASHBOARD_TAB_BAR_HEIGHT_PX = 64; // Fixed local switcher height reserved at the bottom of the mobile hub.
const MOBILE_DASHBOARD_TAB_MIN_HEIGHT_PX = 48; // Compact but thumb-friendly tab target for the two hub modes.

/**
 * Mobile Today route: a glanceable answer plus top-level logging actions.
 */
const MobileToday: React.FC = () => {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<MobileDashboardTab>(MOBILE_DASHBOARD_TABS.log);
    const { selectedDate, today, navigation } = useLogDateNavigationState();
    const isSelectedToday = selectedDate === today;
    const {
        dialogs,
        openWeightDialogFromFab,
        setLogDateNavigation,
        setLogDateOverride
    } = useQuickAddFab();
    const { openFoodDialog } = dialogs;
    const isLogTabActive = activeTab === MOBILE_DASHBOARD_TABS.log;
    const isGoalsTabActive = activeTab === MOBILE_DASHBOARD_TABS.goals;

    useQuickAddLogDateBridge({
        selectedDate,
        navigation,
        setLogDateNavigation,
        setLogDateOverride,
        isActive: isLogTabActive
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

    const handleTabChange = (_event: React.SyntheticEvent, nextTab: MobileDashboardTab) => {
        setActiveTab(nextTab);
    };

    return (
        <Stack spacing={1.5} useFlexGap sx={{ pb: `calc(${MOBILE_DASHBOARD_TAB_BAR_HEIGHT_PX}px + var(--safe-area-inset-bottom, 0px))` }}>
            <Box role="tabpanel" hidden={!isLogTabActive} aria-label={t('today.tabs.today')}>
                {isLogTabActive && (
                    <Stack spacing={1.5} useFlexGap>
                        <TodayHeader navigation={navigation} />
                        <CalorieSummary date={selectedDate} isSelectedToday={isSelectedToday} />
                        <FoodLog
                            date={selectedDate}
                            isSelectedToday={isSelectedToday}
                            onAddFood={handleAddFood}
                        />
                        <DayCompletionControl date={selectedDate} />
                    </Stack>
                )}
            </Box>

            <Box role="tabpanel" hidden={!isGoalsTabActive} aria-label={t('today.tabs.progress')}>
                {isGoalsTabActive && (
                    <Stack spacing={1.5} useFlexGap>
                        <WeightSummaryCard date={today} onOpenWeightEntry={openWeightDialogFromFab} />
                        <WeightTrend compactPreview />
                        <GoalProjection />
                    </Stack>
                )}
            </Box>

            <Paper
                elevation={8}
                sx={(theme) => ({
                    position: 'fixed',
                    right: 0,
                    bottom: 0,
                    left: 0,
                    zIndex: theme.zIndex.appBar,
                    borderRadius: 0,
                    borderTop: 1,
                    borderColor: 'divider',
                    px: `calc(${theme.spacing(1)} + var(--safe-area-inset-left, 0px))`,
                    pt: 0.75,
                    pb: `calc(${theme.spacing(0.75)} + var(--safe-area-inset-bottom, 0px))`,
                    bgcolor: 'background.paper'
                })}
            >
                <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    variant="fullWidth"
                    aria-label={t('today.tabs.ariaLabel')}
                    sx={{
                        minHeight: MOBILE_DASHBOARD_TAB_MIN_HEIGHT_PX,
                        '& .MuiTab-root': {
                            minHeight: MOBILE_DASHBOARD_TAB_MIN_HEIGHT_PX,
                            fontWeight: 'bold'
                        }
                    }}
                >
                    <Tab value={MOBILE_DASHBOARD_TABS.log} label={t('today.tabs.today')} />
                    <Tab value={MOBILE_DASHBOARD_TABS.goals} label={t('today.tabs.progress')} />
                </Tabs>
            </Paper>
        </Stack>
    );
};

export default MobileToday;
