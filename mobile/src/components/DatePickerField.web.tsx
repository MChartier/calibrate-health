import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { radius, spacing, useAppTheme } from '../theme';
import type { DatePickerFieldProps } from './DatePickerField.types';

/** Uses the browser's accessible, locale-aware date control on web. */
export const DatePickerField: React.FC<DatePickerFieldProps> = ({
    label,
    value,
    onChangeDate,
    helperText,
    minimumDate,
    maximumDate,
    style,
    ...props
}) => {
    const { colors, dark } = useAppTheme();
    const [isFocused, setIsFocused] = React.useState(false);
    const handleChange = (event: React.FormEvent<HTMLInputElement>) => {
        onChangeDate(event.currentTarget.value);
    };

    return (
        <View {...props} style={[styles.group, style]}>
            <AppText variant="label">{label}</AppText>
            <input
                aria-label={label}
                max={maximumDate}
                min={minimumDate}
                onBlur={() => setIsFocused(false)}
                onChange={handleChange}
                onFocus={() => setIsFocused(true)}
                onInput={handleChange}
                style={{
                    minHeight: 48,
                    width: '100%',
                    boxSizing: 'border-box',
                    border: `1px solid ${isFocused ? colors.primary : colors.outline}`,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    color: colors.onSurface,
                    colorScheme: dark ? 'dark' : 'light',
                    font: 'inherit',
                    fontSize: 16,
                    outline: isFocused ? `2px solid ${colors.primary}` : 'none',
                    outlineOffset: 2,
                    padding: `0 ${spacing.md}px`
                }}
                type="date"
                value={value}
            />
            {helperText && <AppText variant="caption">{helperText}</AppText>}
        </View>
    );
};

const styles = StyleSheet.create({
    group: {
        gap: spacing.sm
    }
});
