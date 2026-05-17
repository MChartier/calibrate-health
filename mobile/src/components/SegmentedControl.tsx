import React from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type SegmentedOption<T extends string> = {
    value: T;
    label: string;
};

type SegmentedControlProps<T extends string> = ViewProps & {
    options: Array<SegmentedOption<T>>;
    value: T;
    onChange: (value: T) => void;
};

/**
 * Native segmented selector for mutually exclusive modes such as goal direction or input units.
 */
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    style,
    ...props
}: SegmentedControlProps<T>) {
    return (
        <View {...props} style={[styles.root, style]}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => onChange(option.value)}
                        style={({ pressed }) => [
                            styles.segment,
                            selected && styles.segmentSelected,
                            pressed && !selected && styles.segmentPressed
                        ]}
                    >
                        <AppText style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
                            {option.label}
                        </AppText>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row',
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.xs,
        gap: spacing.xs
    },
    segment: {
        flex: 1,
        minHeight: 40,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.sm
    },
    segmentSelected: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    segmentPressed: {
        backgroundColor: colors.surfacePressed
    },
    label: {
        color: colors.muted,
        fontSize: 14,
        fontWeight: '800'
    },
    labelSelected: {
        color: colors.primaryDark
    }
});
