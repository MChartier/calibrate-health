import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radius } from '../theme';

type ProgressBarProps = ViewProps & {
    value: number;
    tone?: 'primary' | 'warning' | 'danger';
};

const toneColors = {
    primary: colors.primary,
    warning: colors.warning,
    danger: colors.danger
};

/**
 * Stable-width progress indicator for calorie and goal summaries.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({ value, tone = 'primary', style, ...props }) => {
    const clampedValue = Math.max(0, Math.min(1, value));

    return (
        <View {...props} style={[styles.track, style]}>
            <View style={[styles.fill, { width: `${clampedValue * 100}%`, backgroundColor: toneColors[tone] }]} />
        </View>
    );
};

const styles = StyleSheet.create({
    track: {
        height: 8,
        borderRadius: radius.pill,
        overflow: 'hidden',
        backgroundColor: colors.surfaceAlt
    },
    fill: {
        height: '100%',
        borderRadius: radius.pill
    }
});
