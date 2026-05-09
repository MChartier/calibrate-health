import React, { useCallback, useMemo } from 'react';
import { Button, Stack } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import CalorieSummary from '../components/CalorieSummary';
import FoodLog from '../components/FoodLog';
import TodayHeader from '../components/TodayHeader';
import { useI18n } from '../i18n/useI18n';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { LOG_DATE_QUERY_PARAM, useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { useQuickAddLogDateBridge, useQuickAddShortcutAction } from '../hooks/useQuickAddRouteState';
import type { MealPeriod } from '../types/mealPeriod';

function getDashboardPath(selectedDate: string, today: string): string {
    if (selectedDate === today) return '/dashboard';
    const params = new URLSearchParams({ [LOG_DATE_QUERY_PARAM]: selectedDate });
    return `/dashboard?${params.toString()}`;
}

/**
 * Full daily log route for users who want calorie context plus focused food editing.
 */
const Log: React.FC = () => {
    const theme = useTheme();
    const { t } = useI18n();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap + 0.75 };
    const { selectedDate, today, navigation } = useLogDateNavigationState();
    const isSelectedToday = selectedDate === today;
    const {
        dialogs,
        openWeightDialogFromFab,
        setLogDateNavigation,
        setLogDateOverride
    } = useQuickAddFab();
    const { openFoodDialog } = dialogs;

    const dashboardPath = useMemo(() => getDashboardPath(selectedDate, today), [selectedDate, today]);

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
        <Stack spacing={sectionSpacing} useFlexGap>
            <Button
                component={RouterLink}
                to={dashboardPath}
                variant="text"
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ alignSelf: 'flex-start' }}
            >
                {t('log.nav.backToToday')}
            </Button>
            <TodayHeader navigation={navigation} />
            <CalorieSummary date={selectedDate} isSelectedToday={isSelectedToday} />
            <FoodLog
                date={selectedDate}
                isSelectedToday={isSelectedToday}
                onAddFood={handleAddFood}
            />
        </Stack>
    );
};

export default Log;
