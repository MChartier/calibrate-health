import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { DateNavigation } from '../../src/components/DateNavigation';
import { TabScreen } from '../../src/components/TabScreen';
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
        <TabScreen>
            <DateNavigation navigation={dateNavigation} />

            <WeightEntrySheet
                visible={isSheetOpen}
                date={dateNavigation.selectedDate}
                onClose={closeSheet}
            />
        </TabScreen>
    );
}
