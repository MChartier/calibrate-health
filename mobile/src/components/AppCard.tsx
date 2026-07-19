import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';

export const AppCard: React.FC<ViewProps> = ({ style, ...props }) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    return <View {...props} style={[styles.card, style]} />;
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        card: {
            ...theme.shadows.card,
            backgroundColor: theme.colors.surfaceContainerLow,
            borderColor: theme.colors.outlineVariant,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: theme.radius.lg,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            width: '100%'
        }
    });
}
