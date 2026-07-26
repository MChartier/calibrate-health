import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText';
import type { DateNavigationProps } from './DateNavigation.types';
import {
    DateNavigationIconButton,
    useDateNavigationPresentation
} from './DateNavigation.shared';

/** Browser day navigation uses a native date input instead of the unsupported native picker module. */
export const DateNavigation: React.FC<DateNavigationProps> = ({ navigation, style, ...props }) => {
    const { theme, styles } = useDateNavigationPresentation();
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
                <DateNavigationIconButton
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
                <DateNavigationIconButton
                    label="Next day"
                    icon="chevron-forward"
                    disabled={!navigation.canGoForward}
                    onPress={navigation.goToNextDate}
                />
            </View>
        </View>
    );
};

const WEB_DATE_INPUT_STYLE: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    border: 0,
    cursor: 'pointer',
    opacity: 0.001
};
