import React from 'react';
import { Text, type TextProps, StyleSheet } from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';

export const AppText: React.FC<TextProps & { variant?: 'page' | 'section' | 'card' | 'body' | 'label' | 'caption' | 'metric' | 'title' | 'screenTitle' | 'subtitle' | 'muted' }> = ({
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
    page: theme.typography.styles.page,
    section: theme.typography.styles.section,
    card: theme.typography.styles.card,
    body: theme.typography.styles.body,
    label: {
        color: theme.colors.onSurfaceVariant,
        ...theme.typography.styles.label
    },
    caption: {
        color: theme.colors.onSurfaceVariant,
        ...theme.typography.styles.caption
    },
    metric: theme.typography.styles.metric,
    // Compatibility variants now map to the production type scale.
    title: theme.typography.styles.page,
    screenTitle: theme.typography.styles.page,
    subtitle: theme.typography.styles.section,
    muted: {
        color: theme.colors.onSurfaceVariant,
        ...theme.typography.styles.label,
        fontWeight: '400'
    }
    });
}
