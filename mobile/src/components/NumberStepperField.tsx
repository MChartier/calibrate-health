import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { TextField } from './TextField';
import { colors, radius, spacing } from '../theme';

type NumberStepperFieldProps = {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    step?: number;
    min?: number;
    max?: number;
    suffix?: string;
    helperText?: string;
    editable?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
};

function formatStepperValue(value: number, step: number): string {
    const hasFractionalStep = !Number.isInteger(step);
    return hasFractionalStep ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value));
}

/**
 * Numeric input with native-sized increment buttons for weights, calories, servings, and recipe yields.
 */
export const NumberStepperField: React.FC<NumberStepperFieldProps> = ({
    label,
    value,
    onChangeText,
    step = 1,
    min,
    max,
    suffix,
    helperText,
    editable = true,
    containerStyle
}) => {
    const parsed = Number(value);
    const currentValue = Number.isFinite(parsed) ? parsed : 0;

    function adjust(delta: number) {
        let nextValue = currentValue + delta;
        if (typeof min === 'number') nextValue = Math.max(min, nextValue);
        if (typeof max === 'number') nextValue = Math.min(max, nextValue);
        onChangeText(formatStepperValue(nextValue, step));
    }

    return (
        <View style={[styles.root, containerStyle]}>
            <View style={styles.labelRow}>
                <AppText variant="label">{label}</AppText>
                {suffix && <AppText variant="caption">{suffix}</AppText>}
            </View>
            <View style={styles.inputRow}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${label}`}
                    disabled={!editable}
                    onPress={() => adjust(-step)}
                    style={({ pressed }) => [styles.stepperButton, !editable && styles.disabled, pressed && editable && styles.pressed]}
                >
                    <Ionicons name="remove" size={18} color={colors.text} />
                </Pressable>
                <TextField
                    label={label}
                    hideLabel
                    value={value}
                    onChangeText={onChangeText}
                    keyboardType="decimal-pad"
                    containerStyle={styles.field}
                    style={styles.input}
                    accessibilityLabel={label}
                    editable={editable}
                />
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${label}`}
                    disabled={!editable}
                    onPress={() => adjust(step)}
                    style={({ pressed }) => [styles.stepperButton, !editable && styles.disabled, pressed && editable && styles.pressed]}
                >
                    <Ionicons name="add" size={18} color={colors.text} />
                </Pressable>
            </View>
            {helperText && <AppText variant="caption">{helperText}</AppText>}
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        gap: spacing.sm
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm
    },
    field: {
        flex: 1
    },
    input: {
        textAlign: 'center'
    },
    stepperButton: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    pressed: {
        backgroundColor: colors.surfacePressed
    },
    disabled: {
        opacity: 0.5
    }
});
