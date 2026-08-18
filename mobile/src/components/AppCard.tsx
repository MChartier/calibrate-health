import React from 'react';
import { View, StyleSheet, type ViewProps, type ViewStyle } from 'react-native';
import { spacing, type AppTheme, useAppTheme } from '../theme';

export type CardDensity = 'compact' | 'comfortable';

// Shared dashboard insets keep header alignment stable across static and navigable cards.
export const compactCardContentStyle = {
    padding: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.sm
} satisfies ViewStyle;

type AppCardProps = ViewProps & {
    density?: CardDensity;
};

export const AppCard: React.FC<AppCardProps> = ({ density = 'comfortable', style, ...props }) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    return <View {...props} style={[styles.card, density === 'compact' && compactCardContentStyle, style]} />;
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
