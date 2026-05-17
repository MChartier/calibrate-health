import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { MealPeriod } from '@calibrate/shared';
import { AddFoodSheet } from '../../src/components/AddFoodSheet';
import { DateNavigation } from '../../src/components/DateNavigation';
import { Screen } from '../../src/components/Screen';
import { useLogDateNavigation } from '../../src/hooks/useLogDateNavigation';

export default function LogScreen() {
    const { date, meal } = useLocalSearchParams<{ date?: string; meal?: MealPeriod }>();
    const dateNavigation = useLogDateNavigation(typeof date === 'string' ? date : null);
    const [isSheetOpen, setIsSheetOpen] = useState(true);

    function closeSheet() {
        setIsSheetOpen(false);
        router.replace('/(tabs)/today');
    }

    return (
        <Screen>
            <DateNavigation navigation={dateNavigation} />

            <AddFoodSheet
                visible={isSheetOpen}
                date={dateNavigation.selectedDate}
                initialMeal={meal ?? null}
                onClose={closeSheet}
            />
        </Screen>
    );
}
