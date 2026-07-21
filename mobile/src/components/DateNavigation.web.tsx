import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText';
import { type AppTheme, useAppTheme } from '../theme';
import type { DateNavigationProps } from './DateNavigation.types';

/** Browser day navigation uses a native date input instead of the unsupported native picker module. */
export const DateNavigation: React.FC<DateNavigationProps> = ({ navigation, style, ...props }) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const [isDateFocused, setIsDateFocused] = React.useState(false);
    const dateInputRef = React.useRef<HTMLInputElement>(null);
    const handleDateChange = (event: React.FormEvent<HTMLInputElement>) => {
        if (event.currentTarget.value) navigation.setDate(event.currentTarget.value);
    };
    const openDatePicker = () => {
        const input = dateInputRef.current;
        if (!input) return;
        try {
            if (typeof input.showPicker === 'function') {
                input.showPicker();
                return;
            }
        } catch {
            // The native input still handles its own trusted click when showPicker is unavailable.
        }
        input.focus();
    };

    return (
        <View {...props} style={[styles.container, style]}>
            <View accessibilityRole="toolbar" accessibilityLabel="Food log date" style={styles.root}>
                <IconPressable
                    label="Previous day"
                    icon="chevron-back"
                    disabled={!navigation.canGoBack}
                    onPress={navigation.goToPreviousDate}
                />
                <View
                    style={[
                        styles.datePill,
                        isDateFocused && styles.datePillFocused
                    ]}
                >
                    <AppText variant="subtitle" numberOfLines={2} style={styles.dateText}>
                        {navigation.isToday ? 'Today' : navigation.selectedDateLabel}
                    </AppText>
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                    <input
                        ref={dateInputRef}
                        aria-label="Choose date"
                        max={navigation.maxDate}
                        min={navigation.minDate}
                        onBlur={() => setIsDateFocused(false)}
                        onChange={handleDateChange}
                        onClick={openDatePicker}
                        onFocus={() => setIsDateFocused(true)}
                        onInput={handleDateChange}
                        style={WEB_DATE_INPUT_STYLE}
                        type="date"
                        value={navigation.selectedDate}
                    />
                </View>
                <IconPressable
                    label="Next day"
                    icon="chevron-forward"
                    disabled={!navigation.canGoForward}
                    onPress={navigation.goToNextDate}
                />
            </View>
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
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}
        >
            <Ionicons name={icon} size={22} color={disabled ? theme.colors.onSurfaceVariant : theme.colors.onSurface} />
        </Pressable>
    );
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
            borderWidth: StyleSheet.hairlineWidth
        },
        datePill: {
            position: 'relative',
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
        datePillFocused: {
            borderColor: theme.colors.primary,
            borderWidth: 2
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

const WEB_DATE_INPUT_STYLE: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    border: 0,
    cursor: 'pointer',
    opacity: 0.001
};
