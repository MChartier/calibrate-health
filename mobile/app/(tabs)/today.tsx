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
import { LogContentSkeleton } from '../../src/components/LogContentSkeleton';
import { Screen } from '../../src/components/Screen';
import { TodayWeightCard } from '../../src/components/TodayWeightCard';
import { WeightEntrySheet } from '../../src/components/WeightEntrySheet';
import { useAuth } from '../../src/auth/AuthContext';
import { useSharedLogDateNavigation } from '../../src/context/LogDateContext';
import { useAddFoodRequest } from '../../src/context/AddFoodRequestContext';
import { usePrefetchPreviousFoodLog } from '../../src/hooks/usePrefetchPreviousFoodLog';
import { getActiveTabRoute } from '../../src/navigation/contextualFab';
import { MEAL_OPTIONS } from '../../src/utils/meals';
import { getTodayDate } from '../../src/utils/dates';
import { getMetricDate } from '../../src/utils/metrics';
import { useAppTheme } from '../../src/theme';

export default function TodayScreen() {
    const { colors } = useAppTheme();
    const routeParams = useLocalSearchParams<{ openAddFood?: string; date?: string; meal?: string }>();
    const pathname = usePathname();
    const { api, user } = useAuth();
    const dateNavigation = useSharedLogDateNavigation();
    const setLogDate = dateNavigation.setDate;
    const { request: addFoodRequest, consumeRequest: consumeAddFoodRequest } = useAddFoodRequest();
    const selectedDate = dateNavigation.selectedDate;
    const [addFoodMeal, setAddFoodMeal] = useState<MealPeriod | null | undefined>(undefined);
    const [isWeightSheetOpen, setIsWeightSheetOpen] = useState(false);
    usePrefetchPreviousFoodLog(selectedDate, dateNavigation.minDate);

    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const foodQuery = useQuery({ queryKey: ['mobile-food', selectedDate], queryFn: () => api.getFoodLog(selectedDate) });
    const metricsQuery = useQuery({ queryKey: ['mobile-metrics'], queryFn: () => api.getMetrics() });

    useEffect(() => {
        if (!addFoodRequest || getActiveTabRoute(pathname) !== 'today') return;

        if (addFoodRequest.date) {
            setLogDate(addFoodRequest.date);
        }
        setAddFoodMeal(addFoodRequest.meal ?? null);
        consumeAddFoodRequest(addFoodRequest.id);
    }, [addFoodRequest, consumeAddFoodRequest, pathname, setLogDate]);

    useEffect(() => {
        if (routeParams.openAddFood !== 'true') return;
        const requestedMeal = typeof routeParams.meal === 'string' && MEAL_OPTIONS.includes(routeParams.meal as MealPeriod)
            ? routeParams.meal as MealPeriod
            : null;
        if (typeof routeParams.date === 'string') setLogDate(routeParams.date);
        setAddFoodMeal(requestedMeal);
    }, [routeParams.date, routeParams.meal, routeParams.openAddFood, setLogDate]);

    const entries = foodQuery.data ?? [];
    const calories = entries.reduce((total, entry) => total + entry.calories, 0);
    const target = profileQuery.data?.calorieSummary.dailyCalorieTarget ?? null;
    const selectedDateMetric = (metricsQuery.data ?? []).find((metric) => getMetricDate(metric) === selectedDate) ?? null;
    const isToday = selectedDate === getTodayDate(user?.timezone);
    const showContentSkeleton =
        (!profileQuery.data || !foodQuery.data || !metricsQuery.data) &&
        (profileQuery.isLoading || foodQuery.isLoading || metricsQuery.isLoading);

    return (
        <Screen reserveBottomTabs style={styles.screenContent}>
            <DateNavigation navigation={dateNavigation} />

            {showContentSkeleton ? (
                <LogContentSkeleton />
            ) : (
                <>
                    <CalorieBalanceCard
                        totalCalories={calories}
                        targetCalories={target}
                    />

                    <FoodLogSummaryCard
                        entries={entries}
                        onPress={() => router.push({ pathname: '/(tabs)/food-log', params: { date: selectedDate } })}
                    />

                    <TodayWeightCard
                        metric={selectedDateMetric}
                        weightUnit={user?.weight_unit}
                        isToday={isToday}
                        onPress={() => setIsWeightSheetOpen(true)}
                    />
                </>
            )}

            {foodQuery.error && <AppText style={{ color: colors.danger }}>{foodQuery.error.message}</AppText>}
            {profileQuery.error && <AppText style={{ color: colors.danger }}>{profileQuery.error.message}</AppText>}
            {metricsQuery.error && <AppText style={{ color: colors.danger }}>{metricsQuery.error.message}</AppText>}
            <AddFoodSheet
                visible={addFoodMeal !== undefined}
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
        flexGrow: 1
    }
});
