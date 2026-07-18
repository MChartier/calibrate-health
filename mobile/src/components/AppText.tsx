import React from 'react';
import { Text, type TextProps, StyleSheet } from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';

export const AppText: React.FC<TextProps & { variant?: 'title' | 'screenTitle' | 'subtitle' | 'body' | 'muted' | 'label' | 'metric' | 'caption' }> = ({
    style,
    variant = 'body',
    ...props
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    return <Text {...props} style={[styles.base, styles[variant], style]} />;
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    base: {
        color: theme.colors.onSurface,
        fontVariant: ['tabular-nums']
    },
    title: {
        fontSize: theme.typography.title,
        lineHeight: 34,
        fontWeight: '800',
        letterSpacing: -0.3
    },
    screenTitle: {
        fontSize: theme.typography.screenTitle,
        lineHeight: 30,
        fontWeight: '700',
        letterSpacing: -0.2
    },
    subtitle: {
        fontSize: theme.typography.subtitle,
        lineHeight: 24,
        fontWeight: '700',
        letterSpacing: 0
    },
    body: {
        fontSize: theme.typography.body,
        lineHeight: 24,
        fontWeight: '400'
    },
    muted: {
        color: theme.colors.onSurfaceVariant,
        fontSize: theme.typography.small,
        lineHeight: 20
    },
    label: {
        color: theme.colors.onSurfaceVariant,
        fontSize: theme.typography.small,
        lineHeight: 20,
        fontWeight: '600',
        letterSpacing: 0.1
    },
    metric: {
        fontSize: theme.typography.metric,
        lineHeight: 38,
        fontWeight: '800',
        letterSpacing: -0.4
    },
    caption: {
        color: theme.colors.onSurfaceVariant,
        fontSize: theme.typography.caption,
        lineHeight: 17
    }
    });
}
