import { useMemo, useRef } from 'react';
import {
    Pressable,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle
} from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';
import { AppText } from './AppText';
import { FormField, type FocusableFormControl } from './FormField';
import { useFocusVisible } from './useFocusVisible';

export type ChoiceGroupOption<T extends string> = {
    value: T;
    label: string;
    description?: string;
    disabled?: boolean;
};

export type ChoiceGroupProps<T extends string> = {
    label: string;
    value?: T;
    options: ReadonlyArray<ChoiceGroupOption<T>>;
    onChange: (value: T) => void;
    helperText?: string;
    errorText?: string;
    required?: boolean;
    disabled?: boolean;
    focusError?: boolean;
    orientation?: 'horizontal' | 'vertical';
    containerStyle?: StyleProp<ViewStyle>;
    testID?: string;
};

type KeyboardLikeEvent = {
    key?: string;
    nativeEvent?: { key?: string };
    preventDefault?: () => void;
};

type FocusableOption = {
    focus?: () => void;
};

function getKey(event: KeyboardLikeEvent) {
    return event.key ?? event.nativeEvent?.key ?? '';
}

function Choice<T extends string>({
    option,
    selected,
    inactive,
    tabIndex,
    onPress,
    onKeyDown,
    setRef
}: {
    option: ChoiceGroupOption<T>;
    selected: boolean;
    inactive: boolean;
    tabIndex: 0 | -1;
    onPress: () => void;
    onKeyDown: (event: KeyboardLikeEvent) => void;
    setRef: (value: FocusableOption | null) => void;
}) {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { focusVisible, handleFocus, handleBlur } = useFocusVisible();

    return (
        <Pressable
            ref={setRef as never}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: inactive }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            disabled={inactive}
            onBlur={handleBlur}
            onFocus={handleFocus}
            onPress={onPress}
            role="radio"
            tabIndex={tabIndex}
            {...({ onKeyDown } as object)}
            style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && !inactive && styles.optionPressed,
                focusVisible && styles.optionFocused,
                inactive && styles.optionDisabled
            ]}
        >
            <View style={[styles.indicator, selected && styles.indicatorSelected]}>
                {selected && <View style={styles.indicatorDot} />}
            </View>
            <View style={styles.copy}>
                <AppText style={[styles.title, selected && styles.titleSelected]}>{option.label}</AppText>
                {option.description && (
                    <AppText variant="caption" style={selected && styles.descriptionSelected}>
                        {option.description}
                    </AppText>
                )}
            </View>
        </Pressable>
    );
}

/** Radio-style exclusive choices with native touch behavior and web roving focus. */
export function ChoiceGroup<T extends string>({
    label,
    value,
    options,
    onChange,
    helperText,
    errorText,
    required = false,
    disabled = false,
    focusError = false,
    orientation = 'vertical',
    containerStyle,
    testID
}: ChoiceGroupProps<T>) {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const optionRefs = useRef<Array<FocusableOption | null>>([]);
    const enabledIndexes = options
        .map((option, index) => (!disabled && !option.disabled ? index : -1))
        .filter((index) => index >= 0);
    const selectedIndex = options.findIndex((option) => option.value === value);
    const focusIndex = enabledIndexes.includes(selectedIndex) ? selectedIndex : enabledIndexes[0] ?? -1;
    const groupRef = useRef<FocusableFormControl | null>(null);
    groupRef.current = {
        focus: () => optionRefs.current[focusIndex]?.focus?.()
    };

    function selectAndFocus(index: number) {
        const option = options[index];
        if (!option || disabled || option.disabled) return;
        onChange(option.value);
        optionRefs.current[index]?.focus?.();
    }

    function handleKeyDown(event: KeyboardLikeEvent, index: number) {
        if (enabledIndexes.length === 0) return;
        const key = getKey(event);
        let nextIndex: number | undefined;
        const enabledPosition = enabledIndexes.indexOf(index);
        if (key === 'Home') nextIndex = enabledIndexes[0];
        if (key === 'End') nextIndex = enabledIndexes[enabledIndexes.length - 1];
        if (key === 'ArrowRight' || key === 'ArrowDown') {
            nextIndex = enabledIndexes[(enabledPosition + 1) % enabledIndexes.length];
        }
        if (key === 'ArrowLeft' || key === 'ArrowUp') {
            nextIndex = enabledIndexes[(enabledPosition - 1 + enabledIndexes.length) % enabledIndexes.length];
        }
        if (nextIndex === undefined) return;
        event.preventDefault?.();
        selectAndFocus(nextIndex);
    }

    return (
        <FormField
            label={label}
            helperText={helperText}
            errorText={errorText}
            required={required}
            disabled={disabled}
            focusError={focusError}
            controlRef={groupRef}
            containerStyle={containerStyle}
            testID={testID}
        >
            {(controlProps) => (
                <View
                    {...controlProps}
                    accessibilityRole="radiogroup"
                    role="radiogroup"
                    style={[styles.group, orientation === 'horizontal' && styles.groupHorizontal]}
                    testID={testID ? `${testID}-control` : undefined}
                >
                    {options.map((option, index) => {
                        const selected = option.value === value;
                        const inactive = disabled || option.disabled === true;
                        return (
                            <Choice
                                key={option.value}
                                option={option}
                                selected={selected}
                                inactive={inactive}
                                tabIndex={index === focusIndex ? 0 : -1}
                                onPress={() => selectAndFocus(index)}
                                onKeyDown={(event) => handleKeyDown(event, index)}
                                setRef={(nextRef) => { optionRefs.current[index] = nextRef; }}
                            />
                        );
                    })}
                </View>
            )}
        </FormField>
    );
}

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        group: {
            gap: theme.spacing.sm
        },
        groupHorizontal: {
            flexDirection: 'row',
            flexWrap: 'wrap'
        },
        option: {
            minHeight: theme.interaction.minimumTouchTarget,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            borderColor: theme.colors.outline,
            borderWidth: theme.stroke.control,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceContainerLow,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm
        },
        optionSelected: {
            borderColor: theme.colors.selection,
            backgroundColor: theme.colors.selectionContainer
        },
        optionPressed: {
            backgroundColor: theme.colors.surfacePressed,
            opacity: theme.interaction.pressedOpacity
        },
        optionFocused: {
            outlineColor: theme.colors.focusRing,
            outlineStyle: 'solid',
            outlineWidth: theme.interaction.focusRingWidth
        },
        optionDisabled: {
            opacity: theme.interaction.disabledOpacity
        },
        indicator: {
            width: 20,
            height: 20,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            borderColor: theme.colors.outline,
            borderWidth: 2,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surface
        },
        indicatorSelected: {
            borderColor: theme.colors.selection
        },
        indicatorDot: {
            width: 10,
            height: 10,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.selection
        },
        copy: {
            flex: 1,
            minWidth: 0,
            gap: theme.spacing.xs
        },
        title: {
            ...theme.typography.styles.body,
            fontWeight: '600'
        },
        titleSelected: {
            color: theme.colors.onSelectionContainer
        },
        descriptionSelected: {
            color: theme.colors.onSelectionContainer
        }
    });
}
