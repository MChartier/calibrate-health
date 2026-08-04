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
import { AppText } from '../components/AppText';
import { type AppTheme, useAppTheme } from '../theme';
import { formatWeightUnit } from '../utils/format';
import { formatWeightInput, getSpokenWeightUnit, normalizeWeightInputText, parseWeightInput } from './input';

type WeightValueInputProps = {
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
const WEIGHT_VALUE_MIN_HEIGHT = 96;
const WEIGHT_STEPPER_SIZE = 56;

export const WeightValueInput: React.FC<WeightValueInputProps> = ({
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
            <AppText variant="label">Weight</AppText>
            <View style={styles.valueSurface}>
                <TextInput
                    ref={inputRef}
                    accessibilityLabel={`Weight in ${spokenUnit}`}
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
                <AppText accessible={false} style={styles.unit}>{formatWeightUnit(unit)}</AppText>
            </View>
            <View style={styles.stepperRow}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease weight by ${step} ${getSpokenWeightUnit(unit, step !== 1)}`}
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
                    accessibilityLabel={`Increase weight by ${step} ${getSpokenWeightUnit(unit, step !== 1)}`}
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
            <AppText variant="caption">Use one decimal place for a precise, consistent trend.</AppText>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    root: {
        gap: theme.spacing.sm
    },
    valueSurface: {
        minHeight: WEIGHT_VALUE_MIN_HEIGHT,
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        borderColor: theme.colors.outline,
        borderWidth: theme.stroke.control,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm
    },
    input: {
        minWidth: 0,
        flexShrink: 1,
        color: theme.colors.onSurface,
        fontSize: WEIGHT_VALUE_FONT_SIZE,
        lineHeight: WEIGHT_VALUE_LINE_HEIGHT,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
        letterSpacing: -0.6,
        padding: 0,
        textAlign: 'right'
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
