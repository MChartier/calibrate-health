import React, { useEffect } from 'react';
import { Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import CalorieSummary from '../components/CalorieSummary';
import FoodLog from '../components/FoodLog';
import TodayHeader from '../components/TodayHeader';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { useSelectedAndTodayDayCompletion } from '../hooks/useSelectedAndTodayDayCompletion';
import { QUICK_ADD_SHORTCUT_ACTIONS, QUICK_ADD_SHORTCUT_QUERY_PARAM } from '../constants/pwaShortcuts';
import { getQuickAddAction } from '../utils/quickAddShortcut';

/**
 * Full daily log route for users who want calorie context plus focused food editing.
 */
const Log: React.FC = () => {
    const theme = useTheme();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap + 0.75 };
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedDate, today, navigation } = useLogDateNavigationState();
    const isSelectedToday = selectedDate === today;
    const { isSelectedDayComplete: isDayComplete, isTodayComplete, isTodayCompletionLoading } =
        useSelectedAndTodayDayCompletion(selectedDate, today);
    const {
        dialogs,
        openWeightDialogFromFab,
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
        if (isTodayCompletionLoading) return;

        if (isTodayComplete) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete(QUICK_ADD_SHORTCUT_QUERY_PARAM);
            setSearchParams(nextParams, { replace: true });
            return;
        }

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
        isTodayComplete,
        isTodayCompletionLoading,
        navigation,
        openWeightDialogFromFab,
        quickAddAction,
        searchParams,
        setSearchParams,
        today
    ]);

    return (
        <Stack spacing={sectionSpacing} useFlexGap>
            <TodayHeader navigation={navigation} />
            <CalorieSummary date={selectedDate} isSelectedToday={isSelectedToday} />
            <FoodLog
                date={selectedDate}
                isSelectedToday={isSelectedToday}
                onAddFood={(mealPeriod) => {
                    if (isDayComplete) return;
                    dialogs.openFoodDialog(mealPeriod ?? null);
                }}
                disabled={isDayComplete}
            />
        </Stack>
    );
};

export default Log;
