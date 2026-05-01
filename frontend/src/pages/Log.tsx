import React, { useEffect, useMemo } from 'react';
import { Button, Stack } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import CalorieSummary from '../components/CalorieSummary';
import FoodLog from '../components/FoodLog';
import TodayHeader from '../components/TodayHeader';
import { useI18n } from '../i18n/useI18n';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { LOG_DATE_QUERY_PARAM, useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { QUICK_ADD_SHORTCUT_ACTIONS, QUICK_ADD_SHORTCUT_QUERY_PARAM } from '../constants/pwaShortcuts';
import { getQuickAddAction } from '../utils/quickAddShortcut';

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
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedDate, today, navigation } = useLogDateNavigationState();
    const isSelectedToday = selectedDate === today;
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
    const dashboardPath = useMemo(() => getDashboardPath(selectedDate, today), [selectedDate, today]);

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
                onAddFood={(mealPeriod) => {
                    dialogs.openFoodDialog(mealPeriod ?? null);
                }}
            />
        </Stack>
    );
};

export default Log;
