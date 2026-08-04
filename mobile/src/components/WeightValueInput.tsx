import React, { useMemo } from 'react';
import {
    Pressable,
    StyleSheet,
    TextInput,
    View,
    type NativeSyntheticEvent,
    type TextInputSubmitEditingEventData
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { WeightUnit } from '@calibrate/shared';
import { AppText } from './AppText';
import { type AppTheme, useAppTheme } from '../theme';
import { formatWeightUnit } from '../utils/format';
import {
    formatWeightInput,
    getSpokenWeightUnit,
    normalizeWeightInputText,
    parseWeightInput
} from '../weightEntry/input';

type WeightValueInputProps = {
    label?: string;
    helperText?: string | null;
    value: string;
    unit: WeightUnit | undefined;
    step: number;
    min: number;
    editable: boolean;
    inputRef?: React.RefObject<TextInput | null>;
    onChangeText: (value: string) => void;
    onStep?: () => void;
    onSubmitEditing?: (event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => void;
};

const WEIGHT_VALUE_FONT_SIZE = 52; // Makes the single central measurement the visual anchor of the sheet.
const WEIGHT_VALUE_LINE_HEIGHT = 62;
const WEIGHT_VALUE_HEIGHT = 96;
const WEIGHT_VALUE_UNIT_GUTTER = 64; // Keeps centered text clear of the unit suffix on narrow screens.
const WEIGHT_STEPPER_SIZE = 56;
const DEFAULT_HELPER_TEXT = 'Use one decimal place for a precise, consistent trend.';

export const WeightValueInput: React.FC<WeightValueInputProps> = ({
    label = 'Weight',
    helperText = DEFAULT_HELPER_TEXT,
    value,
    unit,
    step,
    min,
    editable,
    inputRef,
    onChangeText,
    onStep,
    onSubmitEditing
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const spokenUnit = getSpokenWeightUnit(unit);
    const measurementLabel = label.toLowerCase();
    const parsedValue = parseWeightInput(value);

    function adjust(delta: number) {
        const baseline = parsedValue ?? 0;
        const nextValue = Math.max(min, baseline + delta);
        onChangeText(formatWeightInput(nextValue));
        onStep?.();
    }

    const accessibleValue = parsedValue === null
        ? `No weight entered, ${spokenUnit}`
        : `${formatWeightInput(parsedValue)} ${spokenUnit}`;

    return (
        <View style={styles.root}>
            <AppText variant="label">{label}</AppText>
            <View testID="weight-value-surface" style={styles.valueSurface}>
                <TextInput
                    ref={inputRef}
                    accessibilityLabel={`${label} in ${spokenUnit}`}
                    accessibilityHint="Enter a weight using one decimal place."
                    autoCorrect={false}
                    editable={editable}
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    onChangeText={(nextValue) => onChangeText(normalizeWeightInputText(nextValue))}
                    onSubmitEditing={onSubmitEditing}
                    placeholder="0.0"
                    placeholderTextColor={theme.colors.outline}
                    returnKeyType="done"
                    selectTextOnFocus
                    selectionColor={theme.colors.primary}
                    style={styles.input}
                    value={value}
                />
                <View pointerEvents="none" style={styles.unitSlot}>
                    <AppText accessible={false} style={styles.unit}>{formatWeightUnit(unit)}</AppText>
                </View>
            </View>
            <View style={styles.stepperRow}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${measurementLabel} by ${step} ${getSpokenWeightUnit(unit, step !== 1)}`}
                    accessibilityValue={{ text: accessibleValue }}
                    disabled={!editable}
                    onPress={() => adjust(-step)}
                    style={({ pressed }) => [
                        styles.stepperButton,
                        !editable && styles.disabled,
                        pressed && editable && styles.pressed
                    ]}
                >
                    <Ionicons name="remove" size={24} color={theme.colors.onSurface} />
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${measurementLabel} by ${step} ${getSpokenWeightUnit(unit, step !== 1)}`}
                    accessibilityValue={{ text: accessibleValue }}
                    disabled={!editable}
                    onPress={() => adjust(step)}
                    style={({ pressed }) => [
                        styles.stepperButton,
                        !editable && styles.disabled,
                        pressed && editable && styles.pressed
                    ]}
                >
                    <Ionicons name="add" size={24} color={theme.colors.onSurface} />
                </Pressable>
            </View>
            {helperText ? <AppText variant="caption">{helperText}</AppText> : null}
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    root: {
        gap: theme.spacing.sm
    },
    valueSurface: {
        height: WEIGHT_VALUE_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.lg,
        borderColor: theme.colors.outline,
        borderWidth: theme.stroke.control,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    input: {
        width: '100%',
        height: '100%',
        color: theme.colors.onSurface,
        fontSize: WEIGHT_VALUE_FONT_SIZE,
        lineHeight: WEIGHT_VALUE_LINE_HEIGHT,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
        letterSpacing: -0.6,
        paddingHorizontal: WEIGHT_VALUE_UNIT_GUTTER,
        paddingVertical: 0,
        textAlign: 'center',
        textAlignVertical: 'center'
    },
    unitSlot: {
        position: 'absolute',
        top: 0,
        right: theme.spacing.lg,
        bottom: 0,
        justifyContent: 'center'
    },
    unit: {
        color: theme.colors.onSurfaceVariant,
        fontSize: theme.typography.subtitle,
        lineHeight: 28,
        fontWeight: '700'
    },
    stepperRow: {
        flexDirection: 'row',
        gap: theme.spacing.sm
    },
    stepperButton: {
        minHeight: WEIGHT_STEPPER_SIZE,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        borderColor: theme.colors.outlineVariant,
        borderWidth: theme.stroke.control,
        backgroundColor: theme.colors.surfaceContainer
    },
    pressed: {
        backgroundColor: theme.colors.surfacePressed,
        transform: [{ translateY: 1 }]
    },
    disabled: {
        opacity: 0.5
    }
});
