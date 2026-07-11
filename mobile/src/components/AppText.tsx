import React from 'react';
import { Text, type TextProps, StyleSheet } from 'react-native';
import { colors, typography } from '../theme';

export const AppText: React.FC<TextProps & { variant?: 'title' | 'screenTitle' | 'subtitle' | 'body' | 'muted' | 'label' | 'metric' | 'caption' }> = ({
    style,
    variant = 'body',
    ...props
}) => <Text {...props} style={[styles.base, styles[variant], style]} />;

const styles = StyleSheet.create({
    base: {
        color: colors.text,
        fontVariant: ['tabular-nums']
    },
    title: {
        fontSize: typography.title,
        fontWeight: '900',
        letterSpacing: 0
    },
    screenTitle: {
        fontSize: typography.screenTitle,
        fontWeight: '900',
        letterSpacing: 0
    },
    subtitle: {
        fontSize: typography.subtitle,
        fontWeight: '800',
        letterSpacing: 0
    },
    body: {
        fontSize: typography.body,
        lineHeight: 20
    },
    muted: {
        color: colors.muted,
        fontSize: typography.small,
        lineHeight: 18
    },
    label: {
        color: colors.muted,
        fontSize: typography.caption,
        fontWeight: '800',
        letterSpacing: 0,
        textTransform: 'uppercase'
    },
    metric: {
        fontSize: 30,
        fontWeight: '900',
        letterSpacing: 0
    },
    caption: {
        color: colors.muted,
        fontSize: typography.caption,
        lineHeight: 16
    }
});
