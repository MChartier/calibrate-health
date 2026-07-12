import React, { useState } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextInputProps, type ViewStyle, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

export const TextField: React.FC<TextInputProps & { label: string; helperText?: string; hideLabel?: boolean; containerStyle?: StyleProp<ViewStyle> }> = ({
    label,
    helperText,
    hideLabel = false,
    containerStyle,
    style,
    onBlur,
    onFocus,
    accessibilityLabel,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);

    return (
        <View style={[styles.group, containerStyle]}>
            {!hideLabel && <AppText variant="label">{label}</AppText>}
            <TextInput
                {...props}
                accessibilityLabel={accessibilityLabel ?? label}
                onBlur={(event) => {
                    setIsFocused(false);
                    onBlur?.(event);
                }}
                onFocus={(event) => {
                    setIsFocused(true);
                    onFocus?.(event);
                }}
                placeholderTextColor={colors.muted}
                style={[styles.input, isFocused && styles.inputFocused, style]}
            />
            {helperText && <AppText variant="caption">{helperText}</AppText>}
        </View>
    );
};

const styles = StyleSheet.create({
    group: {
        gap: spacing.sm
    },
    input: {
        minHeight: 48,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: '#FBFCFA',
        paddingHorizontal: spacing.md,
        color: colors.text,
        fontSize: 16,
        fontWeight: '600'
    },
    inputFocused: {
        borderColor: colors.primary,
        backgroundColor: colors.surface
    }
});
