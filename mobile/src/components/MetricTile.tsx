import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

type MetricTileProps = ViewProps & {
    label: string;
    value: string | number;
    tone?: 'default' | 'danger' | 'success';
};

const toneColors = {
    default: colors.text,
    danger: colors.danger,
    success: colors.success
};

/**
 * Compact metric cell used by dashboard cards.
 */
export const MetricTile: React.FC<MetricTileProps> = ({ label, value, tone = 'default', style, ...props }) => (
    <View {...props} style={[styles.root, style]}>
        <AppText style={[styles.value, { color: toneColors[tone] }]}>{value}</AppText>
        <AppText variant="caption">{label}</AppText>
    </View>
);

const styles = StyleSheet.create({
    root: {
        flex: 1,
        minWidth: 0,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        gap: spacing.xs
    },
    value: {
        fontSize: 22,
        fontWeight: '900'
    }
});
