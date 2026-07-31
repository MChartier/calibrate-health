import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText';
import type { DateNavigationProps } from './DateNavigation.types';
import { HistoricalDatePicker } from './HistoricalDatePicker';
import {
    DateNavigationIconButton,
    useDateNavigationPresentation
} from './DateNavigation.shared';

/**
 * In-content local-day navigation for log-focused screens.
 *
 * The date pill opens the native calendar, so the row stays compact on phones
 * and avoids the separate calendar button that made the Log tab feel crowded.
 */
export const DateNavigation: React.FC<DateNavigationProps> = ({
    navigation,
    style,
    ...props
}) => {
    const [pickerOpen, setPickerOpen] = useState(false);
    const { theme, styles } = useDateNavigationPresentation();

    function openPicker() {
        setPickerOpen(true);
    }

    return (
        <View {...props} style={[styles.container, style]}>
            <View style={styles.root}>
                <DateNavigationIconButton
                    label="Previous day"
                    icon="chevron-back"
                    disabled={!navigation.canGoBack}
                    onPress={navigation.goToPreviousDate}
                />
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose date"
                    onPress={openPicker}
                    style={({ pressed }) => [styles.datePill, pressed && styles.pressed]}
                >
                    <AppText variant="subtitle" numberOfLines={2} style={styles.dateText}>
                        {navigation.isToday ? 'Today' : navigation.selectedDateLabel}
                    </AppText>
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                </Pressable>
                <DateNavigationIconButton
                    label="Next day"
                    icon="chevron-forward"
                    disabled={!navigation.canGoForward}
                    onPress={navigation.goToNextDate}
                />
            </View>

            <HistoricalDatePicker
                visible={pickerOpen}
                selectedDate={navigation.selectedDate}
                minDate={navigation.minDate}
                maxDate={navigation.maxDate}
                onSelectDate={navigation.setDate}
                onRequestClose={() => setPickerOpen(false)}
            />
        </View>
    );
};
