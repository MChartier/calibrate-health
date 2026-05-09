import React from 'react';
import { Stack } from '@mui/material';
import DayCompletionControl from '../components/DayCompletionControl';
import TodayHeader from '../components/TodayHeader';
import WeightSummaryCard from '../components/WeightSummaryCard';
import WeightTrend from '../components/WeightTrend';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { useQuickAddLogDateBridge } from '../hooks/useQuickAddRouteState';

/**
 * Mobile Weight route for the daily check-in and trend context.
 */
const Weight: React.FC = () => {
    const { selectedDate, navigation } = useLogDateNavigationState();
    const {
        openWeightDialogForLogDate,
        setLogDateNavigation,
        setLogDateOverride
    } = useQuickAddFab();

    useQuickAddLogDateBridge({
        selectedDate,
        navigation,
        setLogDateNavigation,
        setLogDateOverride
    });

    return (
        <Stack spacing={1.5} useFlexGap>
            <TodayHeader navigation={navigation} />
            <WeightSummaryCard date={selectedDate} onOpenWeightEntry={openWeightDialogForLogDate} />
            <WeightTrend />
            <DayCompletionControl date={selectedDate} />
        </Stack>
    );
};

export default Weight;
