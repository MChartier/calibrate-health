import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DateNavigation } from '../../../src/components/DateNavigation';
import { TabScreen } from '../../../src/components/TabScreen';
import { WeightEntrySheet } from '../../../src/components/WeightEntrySheet';
import { useLogDateNavigation } from '../../../src/hooks/useLogDateNavigation';

export default function WeightScreen() {
    const router = useRouter();
    const { date } = useLocalSearchParams<{ date?: string }>();
    const dateNavigation = useLogDateNavigation(typeof date === 'string' ? date : null);
    const [isSheetOpen, setIsSheetOpen] = useState(true);

    // Tab stacks retain this route when Back returns to Today. Reopen it on the next visit.
    useFocusEffect(useCallback(() => {
        setIsSheetOpen(true);
        return () => setIsSheetOpen(false);
    }, []));

    function closeSheet() {
        setIsSheetOpen(false);
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/progress');
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
