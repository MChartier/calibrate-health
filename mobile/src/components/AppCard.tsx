import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '../theme';

export const AppCard: React.FC<ViewProps> = ({ style, ...props }) => (
    <View {...props} style={[styles.card, style]} />
);

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        padding: spacing.lg,
        gap: spacing.md
    }
});
