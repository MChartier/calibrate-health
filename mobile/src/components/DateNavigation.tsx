import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText';
import { dateOnlyToLocalDate, localDateToDateOnly } from '../utils/dates';
import type { DateNavigationProps } from './DateNavigation.types';
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
    const [pickerDate, setPickerDate] = useState<Date | null>(null);
    const { theme, styles } = useDateNavigationPresentation();

    function openPicker() {
        setPickerDate(dateOnlyToLocalDate(navigation.selectedDate));
    }

    function handleDatePicked(event: DateTimePickerEvent, date?: Date) {
        if (Platform.OS === 'android') {
            setPickerDate(null);
        }

        if (event.type === 'set' && date) {
            navigation.setDate(localDateToDateOnly(date));
        }
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

            {pickerDate && (
                <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display={Platform.OS === 'android' ? 'calendar' : 'inline'}
                    minimumDate={dateOnlyToLocalDate(navigation.minDate)}
                    maximumDate={dateOnlyToLocalDate(navigation.maxDate)}
                    onChange={handleDatePicked}
                />
            )}
        </View>
    );
};
