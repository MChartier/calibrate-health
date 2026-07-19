import React, { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { MealPeriod } from '@calibrate/shared';
import { LoadingState } from '../../src/components/LoadingState';
import { useAddFoodRequest } from '../../src/context/AddFoodRequestContext';
import { MEAL_OPTIONS } from '../../src/utils/meals';

export default function LogScreen() {
    const { date, meal } = useLocalSearchParams<{ date?: string; meal?: MealPeriod }>();
    const { requestAddFood } = useAddFoodRequest();

    useEffect(() => {
        const requestedMeal = typeof meal === 'string' && MEAL_OPTIONS.includes(meal as MealPeriod)
            ? meal as MealPeriod
            : undefined;
        requestAddFood({
            date: typeof date === 'string' ? date : undefined,
            meal: requestedMeal
        });
        router.replace({
            pathname: '/(tabs)/today',
            params: {
                openAddFood: 'true',
                date: typeof date === 'string' ? date : undefined,
                meal: requestedMeal
            }
        });
    }, [date, meal, requestAddFood]);

    return <LoadingState label="Opening add food..." />;
}
