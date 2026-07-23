import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type AppTheme, useAppTheme } from '../theme';
import { AppText } from './AppText';
import { dateOnlyToLocalDate, localDateToDateOnly } from '../utils/dates';
import type { DateNavigationProps } from './DateNavigation.types';

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
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

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
                    <AppText variant="subtitle" numberOfLines={2} style={styles.dateText}>
                        {navigation.isToday ? 'Today' : navigation.selectedDateLabel}
                    </AppText>
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
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

const IconPressable: React.FC<IconPressableProps> = ({ label, icon, disabled, onPress }) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    return <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
        <Ionicons name={icon} size={22} color={disabled ? theme.colors.onSurfaceVariant : theme.colors.onSurface} />
    </Pressable>
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    container: {
        gap: theme.spacing.sm
    },
    root: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm
    },
    iconButton: {
        width: theme.interaction.minimumTouchTarget,
        height: theme.interaction.minimumTouchTarget,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceContainer,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden'
    },
    datePill: {
        flex: 1,
        minHeight: theme.interaction.minimumTouchTarget,
        flexDirection: 'row',
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.surfaceContainerLow,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
        overflow: 'hidden'
    },
    dateText: {
        textAlign: 'center',
        flexShrink: 1
    },
    disabled: {
        opacity: 0.45
    },
    pressed: {
        backgroundColor: theme.colors.surfacePressed
    }
    });
}
