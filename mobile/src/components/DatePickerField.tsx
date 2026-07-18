import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';
import { dateOnlyToLocalDate, formatDateOnlyForDisplay, localDateToDateOnly } from '../utils/dates';
import type { DatePickerFieldProps } from './DatePickerField.types';

/**
 * Pressable native date field used where typed date strings are error-prone on mobile.
 */
export const DatePickerField: React.FC<DatePickerFieldProps> = ({
    label,
    value,
    onChangeDate,
    placeholder = 'Choose date',
    helperText,
    minimumDate,
    maximumDate,
    fallbackDate,
    style,
    ...props
}) => {
    const [pickerDate, setPickerDate] = useState<Date | null>(null);

    function openPicker() {
        const initialDate = value || fallbackDate || maximumDate || localDateToDateOnly(new Date());
        setPickerDate(dateOnlyToLocalDate(initialDate));
    }

    function handleDatePicked(event: DateTimePickerEvent, date?: Date) {
        if (Platform.OS === 'android') {
            setPickerDate(null);
        }

        if (event.type === 'set' && date) {
            onChangeDate(localDateToDateOnly(date));
        }
    }

    return (
        <View {...props} style={[styles.group, style]}>
            <AppText variant="label">{label}</AppText>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose ${label}`}
                onPress={openPicker}
                style={({ pressed }) => [styles.field, pressed && styles.pressed]}
            >
                <AppText
                    variant="body"
                    numberOfLines={1}
                    style={!value && styles.placeholder}
                >
                    {value ? formatDateOnlyForDisplay(value) : placeholder}
                </AppText>
                <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
            </Pressable>
            {helperText && <AppText variant="caption">{helperText}</AppText>}
            {pickerDate && (
                <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display={Platform.OS === 'android' ? 'calendar' : 'inline'}
                    minimumDate={minimumDate ? dateOnlyToLocalDate(minimumDate) : undefined}
                    maximumDate={maximumDate ? dateOnlyToLocalDate(maximumDate) : undefined}
                    onChange={handleDatePicked}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    group: {
        gap: spacing.sm
    },
    field: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: '#FBFCFA',
        paddingHorizontal: spacing.md
    },
    placeholder: {
        color: colors.muted
    },
    pressed: {
        borderColor: colors.primary,
        backgroundColor: colors.surface
    }
});
