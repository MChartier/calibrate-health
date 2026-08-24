import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';
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
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [pickerDate, setPickerDate] = useState<Date | null>(null);

    function openPicker() {
        const initialDate = value || fallbackDate || maximumDate || localDateToDateOnly(new Date());
        setPickerDate(dateOnlyToLocalDate(initialDate));
    }

    function handleDatePicked(event: DateTimePickerEvent, date?: Date) {
        if (Platform.OS === 'android') {
            setPickerDate(null);
            if (event.type === 'set' && date) {
                onChangeDate(localDateToDateOnly(date));
            }
            return;
        }

        if (event.type === 'set' && date) {
            setPickerDate(date);
        }
    }

    function confirmPicker() {
        if (!pickerDate) return;
        onChangeDate(localDateToDateOnly(pickerDate));
        setPickerDate(null);
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
                <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
            </Pressable>
            {helperText && <AppText variant="caption">{helperText}</AppText>}
            {pickerDate && (
                <View style={styles.pickerContainer}>
                    <DateTimePicker
                        value={pickerDate}
                        mode="date"
                        display={Platform.OS === 'android' ? 'calendar' : 'inline'}
                        minimumDate={minimumDate ? dateOnlyToLocalDate(minimumDate) : undefined}
                        maximumDate={maximumDate ? dateOnlyToLocalDate(maximumDate) : undefined}
                        onChange={handleDatePicked}
                    />
                    {Platform.OS === 'ios' && (
                        <View style={styles.pickerActions}>
                            <AppButton title="Cancel" variant="ghost" onPress={() => setPickerDate(null)} style={styles.pickerAction} />
                            <AppButton title="Done" onPress={confirmPicker} style={styles.pickerAction} />
                        </View>
                    )}
                </View>
            )}
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
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
        borderWidth: theme.stroke.control,
        borderColor: theme.colors.outlineVariant,
        backgroundColor: theme.colors.surfaceContainerLow,
        paddingHorizontal: spacing.md
    },
    placeholder: {
        color: theme.colors.onSurfaceVariant
    },
    pickerContainer: {
        alignItems: 'stretch'
    },
    pickerActions: {
        flexDirection: 'row',
        gap: spacing.sm
    },
    pickerAction: {
        flex: 1
    },
    pressed: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.surface
    }
});
