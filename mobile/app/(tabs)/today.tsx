import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MealPeriod } from '@calibrate/shared';
import { AddFoodSheet } from '../../src/components/AddFoodSheet';
import { AppText } from '../../src/components/AppText';
import { CalorieBalanceCard } from '../../src/components/CalorieBalanceCard';
import { DateNavigation } from '../../src/components/DateNavigation';
import { FoodLogSummaryCard } from '../../src/components/FoodLogSummaryCard';
import { DayStatusCard, useFoodDayStatus } from '../../src/components/FoodTrackingStatus';
import { LogContentSkeleton } from '../../src/components/LogContentSkeleton';
import { Screen } from '../../src/components/Screen';
import { TodayWeightCard } from '../../src/components/TodayWeightCard';
import { WeightEntrySheet } from '../../src/components/WeightEntrySheet';
import { useAuth } from '../../src/auth/AuthContext';
import { useSharedLogDateNavigation } from '../../src/context/LogDateContext';
import { useAddFoodRequest } from '../../src/context/AddFoodRequestContext';
import { usePrefetchPreviousFoodLog } from '../../src/hooks/usePrefetchPreviousFoodLog';
import { shouldShowCalorieComparison } from '../../src/food/dayPresentation';
import { getActiveTabRoute } from '../../src/navigation/contextualFab';
import { MEAL_OPTIONS } from '../../src/utils/meals';
import { getTodayDate } from '../../src/utils/dates';
import { getMetricDate } from '../../src/utils/metrics';
import { spacing, useAppTheme } from '../../src/theme';

export default function TodayScreen() {
    const { colors } = useAppTheme();
    const routeParams = useLocalSearchParams<{ openAddFood?: string; date?: string; meal?: string }>();
    const pathname = usePathname();
    const { api, user } = useAuth();
    const dateNavigation = useSharedLogDateNavigation();
    const setLogDate = dateNavigation.setDate;
    const { request: addFoodRequest, consumeRequest: consumeAddFoodRequest } = useAddFoodRequest();
    const selectedDate = dateNavigation.selectedDate;
    const handledAddFoodRouteRef = React.useRef<string | null>(null);
    const [addFoodMeal, setAddFoodMeal] = useState<MealPeriod | null | undefined>(undefined);
    const [isWeightSheetOpen, setIsWeightSheetOpen] = useState(false);
    usePrefetchPreviousFoodLog(selectedDate, dateNavigation.minDate);

    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const foodQuery = useQuery({ queryKey: ['mobile-food', selectedDate], queryFn: () => api.getFoodLog(selectedDate) });
    const foodDayQuery = useFoodDayStatus(selectedDate);
    const metricsQuery = useQuery({ queryKey: ['mobile-metrics'], queryFn: () => api.getMetrics() });

    useEffect(() => {
        if (!addFoodRequest || getActiveTabRoute(pathname) !== 'today') return;
        const requestDate = addFoodRequest.date ?? selectedDate;
        if (requestDate !== selectedDate) {
            setLogDate(requestDate);
            return;
        }
        if (foodDayQuery.data?.status !== 'OPEN') return;
        setAddFoodMeal(addFoodRequest.meal ?? null);
        consumeAddFoodRequest(addFoodRequest.id);
    }, [addFoodRequest, consumeAddFoodRequest, foodDayQuery.data?.status, pathname, selectedDate, setLogDate]);

    useEffect(() => {
        if (routeParams.openAddFood !== 'true') {
            handledAddFoodRouteRef.current = null;
            return;
        }
        const routeRequestKey = `${routeParams.date ?? ''}|${routeParams.meal ?? ''}`;
        if (handledAddFoodRouteRef.current === routeRequestKey) return;
        const requestDate = typeof routeParams.date === 'string' ? routeParams.date : selectedDate;
        if (requestDate !== selectedDate) {
            setLogDate(requestDate);
            return;
        }
        if (foodDayQuery.data?.status !== 'OPEN') return;
        const requestedMeal = typeof routeParams.meal === 'string' && MEAL_OPTIONS.includes(routeParams.meal as MealPeriod)
            ? routeParams.meal as MealPeriod
            : null;
        setAddFoodMeal(requestedMeal);
        handledAddFoodRouteRef.current = routeRequestKey;
    }, [foodDayQuery.data?.status, routeParams.date, routeParams.meal, routeParams.openAddFood, selectedDate, setLogDate]);

    const entries = foodQuery.data ?? [];
    const calories = entries.reduce((total, entry) => total + entry.calories, 0);
    const target = profileQuery.data?.calorieSummary.dailyCalorieTarget ?? null;
    const selectedDateMetric = (metricsQuery.data ?? []).find((metric) => getMetricDate(metric) === selectedDate) ?? null;
    const isToday = selectedDate === getTodayDate(user?.timezone);
    const dayStatus = foodDayQuery.data;
    const isPaused = dayStatus?.status === 'PAUSED';
    const showCalorieComparison = shouldShowCalorieComparison({
        status: dayStatus?.status,
        isToday,
        hasFoodEntries: entries.length > 0
    });
    let unavailableLabel = 'Day unresolved';
    if (dayStatus?.status === 'INCOMPLETE') unavailableLabel = 'Incomplete day';
    const showContentSkeleton =
        (!profileQuery.data || !foodQuery.data || !metricsQuery.data || !foodDayQuery.data) &&
        (profileQuery.isLoading || foodQuery.isLoading || metricsQuery.isLoading || foodDayQuery.isLoading);

    return (
        <Screen reserveBottomTabs style={styles.screenContent}>
            <DateNavigation navigation={dateNavigation} />
            {isPaused && <DayStatusCard date={selectedDate} isToday={isToday} compact />}

            {showContentSkeleton ? (
                <LogContentSkeleton />
            ) : (
                <>
                    {!isPaused && (
                        <CalorieBalanceCard
                            totalCalories={calories}
                            targetCalories={showCalorieComparison ? target : null}
                            unavailableLabel={unavailableLabel}
                            compact
                        />
                    )}

                    {(!isPaused || entries.length > 0) && (
                        <FoodLogSummaryCard
                            entries={entries}
                            trackingUnavailable={dayStatus?.status !== 'OPEN' && dayStatus?.status !== 'COMPLETE'}
                            onPress={() => router.push({ pathname: '/(tabs)/food-log', params: { date: selectedDate } })}
                            compact
                        />
                    )}

                    <TodayWeightCard
                        metric={selectedDateMetric}
                        weightUnit={user?.weight_unit}
                        isToday={isToday}
                        onPress={() => setIsWeightSheetOpen(true)}
                        compact
                    />
                </>
            )}

            {!isPaused && <DayStatusCard date={selectedDate} isToday={isToday} compact />}

            {foodQuery.error && <AppText style={{ color: colors.danger }}>{foodQuery.error.message}</AppText>}
            {profileQuery.error && <AppText style={{ color: colors.danger }}>{profileQuery.error.message}</AppText>}
            {metricsQuery.error && <AppText style={{ color: colors.danger }}>{metricsQuery.error.message}</AppText>}
            {foodDayQuery.error && <AppText style={{ color: colors.danger }}>{foodDayQuery.error.message}</AppText>}
            <AddFoodSheet
                visible={addFoodMeal !== undefined && dayStatus?.status === 'OPEN'}
                date={selectedDate}
                initialMeal={addFoodMeal}
                onClose={() => setAddFoodMeal(undefined)}
            />
            <WeightEntrySheet
                visible={isWeightSheetOpen}
                date={selectedDate}
                onClose={() => setIsWeightSheetOpen(false)}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    screenContent: {
        flexGrow: 1,
        gap: spacing.md,
        paddingTop: spacing.md
    }
});
