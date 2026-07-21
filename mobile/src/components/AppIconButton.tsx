import React from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '../theme';

type AppIconButtonProps = Omit<PressableProps, 'children'> & {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    iconColor?: string;
    iconSize?: number;
    variant?: 'surface' | 'container' | 'ghost';
};

/** Consistent icon-only control with an accessible 48dp interaction target. */
export const AppIconButton: React.FC<AppIconButtonProps> = ({
    icon,
    iconColor,
    iconSize = 20,
    variant = 'surface',
    disabled,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const defaultIconColor = variant === 'container' ? theme.colors.primary : theme.colors.onSurface;

    return (
        <Pressable
            {...props}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole={accessibilityRole ?? 'button'}
            accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
            disabled={disabled}
            style={({ pressed }) => [
                styles.base,
                styles[variant],
                disabled && styles.disabled,
                pressed && !disabled && styles.pressed,
                typeof style === 'function' ? style({ pressed }) : style
            ]}
        >
            <Ionicons name={icon} size={iconSize} color={iconColor ?? defaultIconColor} />
        </Pressable>
    );
};

function createStyles(theme: ReturnType<typeof useAppTheme>) {
    return StyleSheet.create({
        base: {
            width: theme.interaction.minimumTouchTarget,
            height: theme.interaction.minimumTouchTarget,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md
        },
        surface: {
            backgroundColor: theme.colors.surfaceContainerLow,
            borderColor: theme.colors.outlineVariant,
            borderWidth: StyleSheet.hairlineWidth
        },
        container: {
            backgroundColor: theme.colors.primaryContainer,
            borderColor: theme.colors.outlineVariant,
            borderWidth: StyleSheet.hairlineWidth
        },
        ghost: {
            backgroundColor: 'transparent'
        },
        disabled: {
            opacity: 0.36
        },
        pressed: {
            backgroundColor: theme.colors.surfacePressed,
            transform: [{ translateY: 1 }]
        }
    });
}
