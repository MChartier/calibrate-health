import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MealPeriod } from '@calibrate/shared';
import { AddFoodSheet } from '../../src/components/AddFoodSheet';
import { AppText } from '../../src/components/AppText';
import { CalorieBalanceCard } from '../../src/components/CalorieBalanceCard';
import { DateNavigation } from '../../src/components/DateNavigation';
import { FoodLogSummaryCard } from '../../src/components/FoodLogSummaryCard';
import { LogContentSkeleton } from '../../src/components/LogContentSkeleton';
import { Screen } from '../../src/components/Screen';
import { useAuth } from '../../src/auth/AuthContext';
import { useSharedLogDateNavigation } from '../../src/context/LogDateContext';
import { useAddFoodRequest } from '../../src/context/AddFoodRequestContext';
import { usePrefetchPreviousFoodLog } from '../../src/hooks/usePrefetchPreviousFoodLog';
import { MEAL_OPTIONS } from '../../src/utils/meals';
import { useAppTheme } from '../../src/theme';

export default function TodayScreen() {
    const { colors } = useAppTheme();
    const routeParams = useLocalSearchParams<{ openAddFood?: string; date?: string; meal?: string }>();
    const { api } = useAuth();
    const dateNavigation = useSharedLogDateNavigation();
    const setLogDate = dateNavigation.setDate;
    const { request: addFoodRequest, consumeRequest: consumeAddFoodRequest } = useAddFoodRequest();
    const selectedDate = dateNavigation.selectedDate;
    const [addFoodMeal, setAddFoodMeal] = useState<MealPeriod | null | undefined>(undefined);
    usePrefetchPreviousFoodLog(selectedDate, dateNavigation.minDate);

    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const foodQuery = useQuery({ queryKey: ['mobile-food', selectedDate], queryFn: () => api.getFoodLog(selectedDate) });

    useEffect(() => {
        if (!addFoodRequest) return;

        if (addFoodRequest.date) {
            setLogDate(addFoodRequest.date);
        }
        setAddFoodMeal(addFoodRequest.meal ?? null);
        consumeAddFoodRequest(addFoodRequest.id);
    }, [addFoodRequest, consumeAddFoodRequest, setLogDate]);

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
    const showContentSkeleton =
        (!profileQuery.data || !foodQuery.data) &&
        (profileQuery.isLoading || foodQuery.isLoading);

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
                </>
            )}

            {foodQuery.error && <AppText style={{ color: colors.danger }}>{foodQuery.error.message}</AppText>}
            {profileQuery.error && <AppText style={{ color: colors.danger }}>{profileQuery.error.message}</AppText>}
            <AddFoodSheet
                visible={addFoodMeal !== undefined}
                date={selectedDate}
                initialMeal={addFoodMeal}
                onClose={() => setAddFoodMeal(undefined)}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    screenContent: {
        flexGrow: 1
    }
});
