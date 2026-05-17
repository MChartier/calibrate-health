import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { DateNavigation } from '../../src/components/DateNavigation';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
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

            <AppCard>
                <SectionHeader title="Log weight" description="Use the focused sheet to save a daily weigh-in." />
                <AppButton title="Open weigh-in" onPress={() => setIsSheetOpen(true)} />
            </AppCard>

            <WeightEntrySheet
                visible={isSheetOpen}
                date={dateNavigation.selectedDate}
                onClose={closeSheet}
            />
        </Screen>
    );
}
