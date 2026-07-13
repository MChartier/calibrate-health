import React, { useRef, useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type StyleProp,
    type ViewStyle,
    useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { colors, radius, shadows, spacing } from '../theme';

export type OverlaySelectOption<T extends string> = {
    value: T;
    label: string;
    description?: string;
};

type OverlaySelectProps<T extends string> = {
    accessibilityLabel: string;
    value: T;
    options: Array<OverlaySelectOption<T>>;
    isOpen: boolean;
    onToggle: () => void;
    onChange: (value: T) => void;
    style?: StyleProp<ViewStyle>;
};

type AnchorFrame = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const MENU_EDGE_MARGIN = spacing.lg;
const MENU_GAP = spacing.xs;
const OPTION_ROW_HEIGHT = 56;

/**
 * Select control whose menu floats over the current surface instead of
 * expanding inline and pushing modal content around.
 */
export function OverlaySelect<T extends string>({
    accessibilityLabel,
    value,
    options,
    isOpen,
    onToggle,
    onChange,
    style
}: OverlaySelectProps<T>) {
    const anchorRef = useRef<View>(null);
    const [buttonHeight, setButtonHeight] = useState(0);
    const [anchorFrame, setAnchorFrame] = useState<AnchorFrame | null>(null);
    const window = useWindowDimensions();
    const selectedOption = options.find((option) => option.value === value) ?? options[0];

    function handleButtonLayout(event: LayoutChangeEvent) {
        setButtonHeight(event.nativeEvent.layout.height);
    }

    function openMenu() {
        anchorRef.current?.measureInWindow((x, y, width, height) => {
            setAnchorFrame({ x, y, width, height });
            onToggle();
        });
    }

    function handleToggle() {
        if (isOpen) {
            onToggle();
            return;
        }
        openMenu();
    }

    const estimatedMenuHeight = options.length * OPTION_ROW_HEIGHT;
    const fallbackAnchor = anchorFrame ?? {
        x: MENU_EDGE_MARGIN,
        y: MENU_EDGE_MARGIN,
        width: window.width - MENU_EDGE_MARGIN * 2,
        height: buttonHeight
    };
    const spaceBelow = window.height - (fallbackAnchor.y + fallbackAnchor.height) - MENU_EDGE_MARGIN;
    const spaceAbove = fallbackAnchor.y - MENU_EDGE_MARGIN;
    const openAbove = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
    const menuMaxHeight = Math.max(OPTION_ROW_HEIGHT * 2, Math.min(estimatedMenuHeight, openAbove ? spaceAbove : spaceBelow));
    const menuTop = openAbove
        ? Math.max(MENU_EDGE_MARGIN, fallbackAnchor.y - MENU_GAP - menuMaxHeight)
        : Math.min(window.height - MENU_EDGE_MARGIN - menuMaxHeight, fallbackAnchor.y + fallbackAnchor.height + MENU_GAP);
    const menuWidth = Math.min(fallbackAnchor.width, window.width - MENU_EDGE_MARGIN * 2);
    const menuLeft = Math.min(
        Math.max(MENU_EDGE_MARGIN, fallbackAnchor.x),
        window.width - MENU_EDGE_MARGIN - menuWidth
    );

    return (
        <View ref={anchorRef} collapsable={false} style={[styles.root, style]}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityState={{ expanded: isOpen }}
                onLayout={handleButtonLayout}
                onPress={handleToggle}
                style={({ pressed }) => [styles.button, pressed && styles.pressedSurface]}
            >
                <View style={styles.valueText}>
                    <AppText variant="body" style={styles.valueLabel} numberOfLines={1}>
                        {selectedOption.label}
                    </AppText>
                    {selectedOption.description && (
                        <AppText variant="caption" numberOfLines={2}>{selectedOption.description}</AppText>
                    )}
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>

            {isOpen && (
                <Modal transparent animationType="fade" visible onRequestClose={onToggle}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close options" style={StyleSheet.absoluteFill} onPress={onToggle} />
                    <View
                        style={[
                            styles.menu,
                            {
                                top: menuTop,
                                left: menuLeft,
                                width: menuWidth,
                                maxHeight: menuMaxHeight
                            }
                        ]}
                    >
                        {options.map((option, index) => {
                            const isSelected = option.value === value;
                            return (
                                <Pressable
                                    key={option.value}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    onPress={() => onChange(option.value)}
                                    style={({ pressed }) => [
                                        styles.option,
                                        index === options.length - 1 && styles.optionLast,
                                        isSelected && styles.optionSelected,
                                        pressed && styles.pressedSurface
                                    ]}
                                >
                                    <View style={styles.valueText}>
                                        <AppText style={[styles.optionTitle, isSelected && styles.optionTitleSelected]} numberOfLines={1}>
                                            {option.label}
                                        </AppText>
                                        {option.description && (
                                            <AppText variant="caption" numberOfLines={2}>{option.description}</AppText>
                                        )}
                                    </View>
                                    {isSelected && <Ionicons name="checkmark" size={17} color={colors.primaryDark} />}
                                </Pressable>
                            );
                        })}
                    </View>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        position: 'relative'
    },
    button: {
        minHeight: 46,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderRadius: radius.md,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    valueText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    valueLabel: {
        fontWeight: '900'
    },
    menu: {
        ...shadows.card,
        position: 'absolute',
        overflow: 'hidden',
        borderRadius: radius.md,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: colors.surface
    },
    option: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    optionLast: {
        borderBottomWidth: 0
    },
    optionSelected: {
        backgroundColor: colors.primarySoft
    },
    optionTitle: {
        fontWeight: '900'
    },
    optionTitleSelected: {
        color: colors.primaryDark
    },
    pressedSurface: {
        backgroundColor: colors.surfacePressed
    }
});
