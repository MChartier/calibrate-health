import React from 'react';
import { Keyboard, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type TextStyle } from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';
import { AppText } from './AppText';

type AppButtonProps = Omit<PressableProps, 'android_ripple'> & {
    title: string;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    leftIcon?: React.ReactNode;
    /** App actions finish current text entry unless they explicitly operate in place. */
    dismissKeyboardOnPress?: boolean;
};

export const AppButton: React.FC<AppButtonProps> = ({
    title,
    variant = 'primary',
    leftIcon,
    dismissKeyboardOnPress = true,
    disabled,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    onPress,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    let labelStyle: StyleProp<TextStyle> = styles.secondaryLabel;
    if (variant === 'primary') labelStyle = styles.primaryLabel;
    if (variant === 'danger') labelStyle = styles.dangerLabel;
    const renderedLeftIcon = disabled && React.isValidElement<{ color?: string }>(leftIcon)
        ? React.cloneElement(leftIcon, { color: theme.colors.onSurfaceVariant })
        : leftIcon;

    return <Pressable
        {...props}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
        onPress={(event) => {
            if (dismissKeyboardOnPress) Keyboard.dismiss();
            onPress?.(event);
        }}
        style={({ pressed }) => [
            styles.base,
            styles[variant],
            disabled && (variant === 'primary' || variant === 'danger' ? styles.disabledSolid : styles.disabled),
            pressed && !disabled && styles.pressed,
            typeof style === 'function' ? style({ pressed }) : style
        ]}
    >
        <View style={styles.content}>
            {renderedLeftIcon}
            <AppText
                numberOfLines={2}
                style={[
                    styles.label,
                    labelStyle,
                    disabled && styles.disabledLabel
                ]}
            >
                {title}
            </AppText>
        </View>
    </Pressable>;
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    base: {
        minHeight: theme.interaction.minimumTouchTarget,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm
    },
    primary: {
        ...theme.shadows.button,
        backgroundColor: theme.colors.primary
    },
    secondary: {
        backgroundColor: theme.colors.surfaceContainer,
        borderColor: theme.colors.outlineVariant,
        borderWidth: theme.stroke.control
    },
    danger: {
        backgroundColor: theme.colors.danger
    },
    ghost: {
        backgroundColor: 'transparent'
    },
    disabled: {
        opacity: 0.36
    },
    disabledSolid: {
        backgroundColor: theme.colors.surfaceContainer,
        borderColor: theme.colors.outlineVariant,
        borderWidth: theme.stroke.control,
        shadowOpacity: 0,
        elevation: 0,
        opacity: 1
    },
    disabledLabel: {
        color: theme.colors.onSurfaceVariant
    },
    pressed: {
        transform: [{ translateY: 1 }],
        opacity: 0.88
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        minWidth: 0
    },
    label: {
        fontWeight: '700',
        flexShrink: 1,
        textAlign: 'center'
    },
    primaryLabel: {
        color: theme.colors.onPrimary
    },
    dangerLabel: {
        color: theme.colors.onDanger
    },
    secondaryLabel: {
        color: theme.colors.onSurface
    }
    });
}
