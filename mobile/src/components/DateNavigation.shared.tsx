import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type AppTheme, useAppTheme } from '../theme';

type DateNavigationIconButtonProps = {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    disabled: boolean;
    onPress: () => void;
};

export const DateNavigationIconButton: React.FC<DateNavigationIconButtonProps> = ({
    label,
    icon,
    disabled,
    onPress
}) => {
    const { theme, styles } = useDateNavigationPresentation();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.iconButton,
                disabled && styles.disabled,
                pressed && styles.pressed
            ]}
        >
            <Ionicons
                name={icon}
                size={22}
                color={disabled ? theme.colors.onSurfaceVariant : theme.colors.onSurface}
            />
        </Pressable>
    );
};

export function useDateNavigationPresentation() {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createDateNavigationStyles(theme), [theme]);
    return { theme, styles };
}

function createDateNavigationStyles(theme: AppTheme) {
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
            borderWidth: theme.stroke.control,
            overflow: 'hidden'
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
            borderWidth: theme.stroke.control,
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
