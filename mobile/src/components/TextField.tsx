import React, { useState } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextInputProps, type ViewStyle, View } from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';
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
    placeholderTextColor,
    selectionColor,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

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
                placeholderTextColor={placeholderTextColor ?? theme.colors.onSurfaceVariant}
                selectionColor={selectionColor ?? theme.colors.primary}
                style={[styles.input, isFocused && styles.inputFocused, style]}
            />
            {helperText && <AppText variant="caption">{helperText}</AppText>}
        </View>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    group: {
        gap: theme.spacing.sm
    },
    input: {
        minHeight: theme.interaction.minimumTouchTarget,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.outline,
        backgroundColor: theme.colors.surfaceContainerLow,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        color: theme.colors.onSurface,
        fontSize: theme.typography.body,
        lineHeight: 22,
        fontWeight: '500'
    },
    inputFocused: {
        borderColor: theme.colors.primary,
        borderWidth: 2,
        backgroundColor: theme.colors.surface
    }
    });
}
