import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { MealPeriod } from '@calibrate/shared';
import { AddFoodSheet } from '../../src/components/AddFoodSheet';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { DateNavigation } from '../../src/components/DateNavigation';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
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

            <AppCard>
                <SectionHeader title="Add food" description="Use the focused sheet to add a manual entry, provider food, barcode scan, or saved food." />
                <AppText variant="muted">This route is kept for notifications and deep links; the main Log tab opens the same sheet directly.</AppText>
                <AppButton title="Open add food" onPress={() => setIsSheetOpen(true)} />
            </AppCard>

            <AddFoodSheet
                visible={isSheetOpen}
                date={dateNavigation.selectedDate}
                initialMeal={meal ?? null}
                onClose={closeSheet}
            />
        </Screen>
    );
}
