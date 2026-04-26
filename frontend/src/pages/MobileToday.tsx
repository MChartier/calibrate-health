import React, { useCallback, useEffect } from 'react';
import { Button, Stack } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useSearchParams } from 'react-router-dom';
import CalorieSummary from '../components/CalorieSummary';
import DayCompletionControl from '../components/DayCompletionControl';
import TodayHeader from '../components/TodayHeader';
import WeightSummaryCard from '../components/WeightSummaryCard';
import { QUICK_ADD_SHORTCUT_ACTIONS, QUICK_ADD_SHORTCUT_QUERY_PARAM } from '../constants/pwaShortcuts';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useI18n } from '../i18n/useI18n';
import { useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { useSelectedAndTodayDayCompletion } from '../hooks/useSelectedAndTodayDayCompletion';
import { getQuickAddAction } from '../utils/quickAddShortcut';

/**
 * Mobile Today route: a glanceable answer plus top-level logging actions.
 */
const MobileToday: React.FC = () => {
    const { t } = useI18n();
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedDate, today, navigation } = useLogDateNavigationState();
    const isSelectedToday = selectedDate === today;
    const {
        dialogs,
        openWeightDialogForLogDate,
        openWeightDialogFromFab,
        setLogDateNavigation,
        setLogDateOverride
    } = useQuickAddFab();
    const { isSelectedDayComplete: isDayComplete, isTodayComplete, isTodayCompletionLoading } =
        useSelectedAndTodayDayCompletion(selectedDate, today);

    useEffect(() => {
        setLogDateOverride(selectedDate);
        return () => {
            setLogDateOverride(null);
        };
    }, [selectedDate, setLogDateOverride]);

    useEffect(() => {
        setLogDateNavigation(navigation);
        return () => {
            setLogDateNavigation(null);
        };
    }, [navigation, setLogDateNavigation]);

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

    const handleAddFood = useCallback(() => {
        if (isDayComplete) return;
        dialogs.openFoodDialog(null);
    }, [dialogs, isDayComplete]);

    return (
        <Stack spacing={1.5} useFlexGap>
            <TodayHeader navigation={navigation} />
            <CalorieSummary date={selectedDate} isSelectedToday={isSelectedToday} />
            <Button
                variant="contained"
                size="large"
                startIcon={<AddRoundedIcon />}
                onClick={handleAddFood}
                disabled={isDayComplete}
                sx={{ py: 1.35 }}
            >
                {t('today.addFood')}
            </Button>
            <WeightSummaryCard date={selectedDate} onOpenWeightEntry={openWeightDialogForLogDate} disabled={isDayComplete} />
            <DayCompletionControl date={selectedDate} />
        </Stack>
    );
};

export default MobileToday;
