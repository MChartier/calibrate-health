import React from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { colors, radius, shadows, spacing } from '../theme';
import { AppText } from './AppText';

export const AppButton: React.FC<PressableProps & {
    title: string;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    leftIcon?: React.ReactNode;
}> = ({
    title,
    variant = 'primary',
    leftIcon,
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
        <View style={styles.content}>
            {leftIcon}
            <AppText style={[styles.label, variant !== 'primary' && variant !== 'danger' && styles.secondaryLabel]}>{title}</AppText>
        </View>
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
        ...shadows.button,
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
    ghost: {
        backgroundColor: 'transparent'
    },
    disabled: {
        opacity: 0.55
    },
    pressed: {
        transform: [{ translateY: 1 }],
        opacity: 0.88
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm
    },
    label: {
        color: '#ffffff',
        fontWeight: '800'
    },
    secondaryLabel: {
        color: colors.text
    }
});
