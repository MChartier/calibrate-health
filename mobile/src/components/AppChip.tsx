import React from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

type AppChipProps = PressableProps & {
    label: string;
    selected?: boolean;
};

/**
 * Native chip used for meal periods and compact option sets.
 */
export const AppChip: React.FC<AppChipProps> = ({ label, selected = false, style, ...props }) => (
    <Pressable
        {...props}
        style={({ pressed }) => [
            styles.root,
            selected && styles.selected,
            pressed && styles.pressed,
            typeof style === 'function' ? style({ pressed }) : style
        ]}
    >
        <AppText style={[styles.label, selected && styles.selectedLabel]}>{label}</AppText>
    </Pressable>
);

const styles = StyleSheet.create({
    root: {
        minHeight: 42,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center'
    },
    selected: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySoft
    },
    pressed: {
        backgroundColor: colors.surfacePressed
    },
    label: {
        color: colors.text,
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '800'
    },
    selectedLabel: {
        color: colors.primaryDark
    }
});
