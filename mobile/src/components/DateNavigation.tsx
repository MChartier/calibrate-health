import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';
import type { LogDateNavigation } from '../hooks/useLogDateNavigation';
import { dateOnlyToLocalDate, localDateToDateOnly } from '../utils/dates';

type DateNavigationProps = ViewProps & {
    navigation: LogDateNavigation;
};

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
                <IconPressable
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
                    <AppText variant="subtitle" numberOfLines={1} adjustsFontSizeToFit style={styles.dateText}>
                        {navigation.isToday ? 'Today' : navigation.selectedDateLabel}
                    </AppText>
                    <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
                </Pressable>
                <IconPressable
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

type IconPressableProps = {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    disabled: boolean;
    onPress: () => void;
};

const IconPressable: React.FC<IconPressableProps> = ({ label, icon, disabled, onPress }) => (
    <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
        <Ionicons name={icon} size={20} color={disabled ? colors.muted : colors.text} />
    </Pressable>
);

const styles = StyleSheet.create({
    container: {
        gap: spacing.sm
    },
    root: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    iconButton: {
        width: 42,
        height: 42,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    datePill: {
        flex: 1,
        minHeight: 42,
        flexDirection: 'row',
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: spacing.md
    },
    dateText: {
        textAlign: 'center',
        flexShrink: 1
    },
    disabled: {
        opacity: 0.45
    },
    pressed: {
        opacity: 0.82
    }
});
