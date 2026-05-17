import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { DateNavigation } from '../../src/components/DateNavigation';
import { Screen } from '../../src/components/Screen';
import { WeightEntrySheet } from '../../src/components/WeightEntrySheet';
import { useLogDateNavigation } from '../../src/hooks/useLogDateNavigation';

export default function WeightScreen() {
    const { date } = useLocalSearchParams<{ date?: string }>();
    const dateNavigation = useLogDateNavigation(typeof date === 'string' ? date : null);
    const [isSheetOpen, setIsSheetOpen] = useState(true);

    function closeSheet() {
        setIsSheetOpen(false);
        router.replace('/(tabs)/progress');
    }

    return (
        <Screen>
            <DateNavigation navigation={dateNavigation} />

            <WeightEntrySheet
                visible={isSheetOpen}
                date={dateNavigation.selectedDate}
                onClose={closeSheet}
            />
        </Screen>
    );
}
