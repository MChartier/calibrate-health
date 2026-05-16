import React from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

export const AppButton: React.FC<PressableProps & { title: string; variant?: 'primary' | 'secondary' | 'danger' }> = ({
    title,
    variant = 'primary',
    disabled,
    style,
    ...props
}) => (
    <Pressable
        {...props}
        disabled={disabled}
        style={({ pressed }) => [
            styles.base,
            styles[variant],
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
            typeof style === 'function' ? style({ pressed }) : style
        ]}
    >
        <AppText style={[styles.label, variant !== 'primary' && styles.secondaryLabel]}>{title}</AppText>
    </Pressable>
);

const styles = StyleSheet.create({
    base: {
        minHeight: 48,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md
    },
    primary: {
        backgroundColor: colors.primary
    },
    secondary: {
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    danger: {
        backgroundColor: colors.danger
    },
    disabled: {
        opacity: 0.55
    },
    pressed: {
        opacity: 0.82
    },
    label: {
        color: '#ffffff',
        fontWeight: '800'
    },
    secondaryLabel: {
        color: colors.text
    }
});
