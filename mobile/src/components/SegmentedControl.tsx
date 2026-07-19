import React from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { AppText } from './AppText';
import { type AppTheme, useAppTheme } from '../theme';

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
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <View {...props} accessibilityRole="radiogroup" style={[styles.root, style]}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        aria-checked={selected}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        onPress={() => onChange(option.value)}
                        style={({ pressed }) => [
                            styles.segment,
                            selected && styles.segmentSelected,
                            pressed && !selected && styles.segmentPressed
                        ]}
                    >
                        <AppText
                            style={selected ? styles.labelSelected : styles.label}
                            numberOfLines={2}
                        >
                            {option.label}
                        </AppText>
                    </Pressable>
                );
            })}
        </View>
    );
}

function createStyles(theme: AppTheme) {
    const labelBase = {
        fontSize: theme.typography.small,
        lineHeight: 19,
        fontWeight: '600',
        textAlign: 'center'
    } as const;

    return StyleSheet.create({
    root: {
        flexDirection: 'row',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceContainer,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        padding: theme.spacing.xs,
        gap: theme.spacing.xs
    },
    segment: {
        flex: 1,
        minHeight: theme.interaction.minimumTouchTarget,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceContainer,
        borderColor: 'transparent',
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs
    },
    segmentSelected: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth
    },
    segmentPressed: {
        backgroundColor: theme.colors.surfacePressed
    },
    label: {
        ...labelBase,
        color: theme.colors.onSurfaceVariant,
    },
    labelSelected: {
        ...labelBase,
        color: theme.colors.onPrimaryContainer
    }
    });
}
