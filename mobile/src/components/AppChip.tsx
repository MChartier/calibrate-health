import React from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';
import { AppText } from './AppText';

type AppChipProps = PressableProps & {
    label: string;
    selected?: boolean;
};

/**
 * Native chip used for meal periods and compact option sets.
 */
export const AppChip: React.FC<AppChipProps> = ({ label, selected = false, style, android_ripple, ...props }) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    return <Pressable
        {...props}
        accessibilityRole={props.accessibilityRole ?? 'button'}
        accessibilityState={{ ...props.accessibilityState, selected }}
        android_ripple={android_ripple ?? { color: theme.colors.ripple }}
        style={({ pressed }) => [
            styles.root,
            selected && styles.selected,
            pressed && styles.pressed,
            typeof style === 'function' ? style({ pressed }) : style
        ]}
    >
        <AppText numberOfLines={2} style={[styles.label, selected && styles.selectedLabel]}>
            {label}
        </AppText>
    </Pressable>;
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    root: {
        minHeight: theme.interaction.minimumTouchTarget,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: theme.radius.pill,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.colors.surfaceContainerLow,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
    },
    selected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primaryContainer
    },
    pressed: {
        backgroundColor: theme.colors.surfacePressed
    },
    label: {
        color: theme.colors.onSurface,
        fontSize: theme.typography.small,
        lineHeight: 19,
        fontWeight: '600',
        textAlign: 'center'
    },
    selectedLabel: {
        color: theme.colors.onPrimaryContainer
    }
    });
}
