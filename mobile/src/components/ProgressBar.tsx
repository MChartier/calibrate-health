import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { radius, useAppTheme } from '../theme';

type ProgressBarProps = ViewProps & {
    value: number;
    tone?: 'primary' | 'warning' | 'danger';
};

/**
 * Stable-width progress indicator for calorie and goal summaries.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({ value, tone = 'primary', style, ...props }) => {
    const { colors } = useAppTheme();
    const clampedValue = Math.max(0, Math.min(1, value));
    const toneColors = {
        primary: colors.primary,
        warning: colors.warning,
        danger: colors.danger
    };

    return (
        <View {...props} style={[styles.track, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }, style]}>
            <View style={[styles.fill, { width: `${clampedValue * 100}%`, backgroundColor: toneColors[tone] }]} />
        </View>
    );
};

const styles = StyleSheet.create({
    track: {
        height: 8,
        borderRadius: radius.pill,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth
    },
    fill: {
        height: '100%',
        borderRadius: radius.pill
    }
});
