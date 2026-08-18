import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText';
import { TextField } from './TextField';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';
import { adjustDecimalInput, normalizeDecimalInput, parseDecimalInput } from '../utils/numericInput';

type NumberStepperFieldProps = {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    step?: number;
    min?: number;
    max?: number;
    suffix?: string;
    helperText?: string;
    placeholder?: string;
    editable?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
};

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
    placeholder,
    editable = true,
    containerStyle
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const parsedValue = parseDecimalInput(value);
    const decreaseDisabled = !editable
        || (Number.isFinite(parsedValue) && typeof min === 'number' && parsedValue - step < min);
    const increaseDisabled = !editable
        || (Number.isFinite(parsedValue) && typeof max === 'number' && parsedValue + step > max);

    function adjust(delta: number) {
        onChangeText(adjustDecimalInput({ value, delta, min, max }));
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
                    accessibilityLabel={`Decrease ${label} by ${step}`}
                    disabled={decreaseDisabled}
                    onPress={() => adjust(-step)}
                    style={({ pressed }) => [
                        styles.stepperButton,
                        decreaseDisabled && styles.disabled,
                        pressed && !decreaseDisabled && styles.pressed
                    ]}
                >
                    <Ionicons name="remove" size={18} color={theme.colors.onSurface} />
                </Pressable>
                <TextField
                    label={label}
                    hideLabel
                    value={value}
                    onChangeText={(nextValue) => onChangeText(normalizeDecimalInput(nextValue))}
                    placeholder={placeholder}
                    keyboardType="decimal-pad"
                    returnKeyType={'done'}
                    selectTextOnFocus
                    containerStyle={styles.field}
                    style={styles.input}
                    accessibilityLabel={label}
                    editable={editable}
                />
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${label} by ${step}`}
                    disabled={increaseDisabled}
                    onPress={() => adjust(step)}
                    style={({ pressed }) => [
                        styles.stepperButton,
                        increaseDisabled && styles.disabled,
                        pressed && !increaseDisabled && styles.pressed
                    ]}
                >
                    <Ionicons name="add" size={18} color={theme.colors.onSurface} />
                </Pressable>
            </View>
            {helperText && <AppText variant="caption">{helperText}</AppText>}
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
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
        backgroundColor: theme.colors.surfaceContainer,
        borderColor: theme.colors.outlineVariant,
        borderWidth: theme.stroke.control
    },
    pressed: {
        backgroundColor: theme.colors.surfacePressed
    },
    disabled: {
        opacity: 0.5
    }
});
