import React, { useRef, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type StyleProp,
    type ViewStyle,
    useWindowDimensions
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText';
import { type AppTheme, spacing, useAppTheme } from '../theme';

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
const OPTION_ROW_HEIGHT = 72;

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
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
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
                android_ripple={{ color: theme.colors.ripple }}
                onLayout={handleButtonLayout}
                onPress={handleToggle}
                style={({ pressed }) => [styles.button, pressed && styles.pressedSurface]}
            >
                <View style={styles.valueText}>
                    <AppText variant="body" style={styles.valueLabel} numberOfLines={2}>
                        {selectedOption.label}
                    </AppText>
                    {selectedOption.description && (
                        <AppText variant="caption" numberOfLines={2}>{selectedOption.description}</AppText>
                    )}
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.onSurfaceVariant} />
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
                        <ScrollView keyboardShouldPersistTaps="handled">
                        {options.map((option, index) => {
                            const isSelected = option.value === value;
                            return (
                                <Pressable
                                    key={option.value}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    android_ripple={{ color: theme.colors.ripple }}
                                    onPress={() => onChange(option.value)}
                                    style={({ pressed }) => [
                                        styles.option,
                                        index === options.length - 1 && styles.optionLast,
                                        isSelected && styles.optionSelected,
                                        pressed && styles.pressedSurface
                                    ]}
                                >
                                    <View style={styles.valueText}>
                                        <AppText style={[styles.optionTitle, isSelected && styles.optionTitleSelected]} numberOfLines={2}>
                                            {option.label}
                                        </AppText>
                                        {option.description && (
                                            <AppText variant="caption" numberOfLines={2}>{option.description}</AppText>
                                        )}
                                    </View>
                                    {isSelected && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
                                </Pressable>
                            );
                        })}
                        </ScrollView>
                    </View>
                </Modal>
            )}
        </View>
    );
}

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    root: {
        position: 'relative'
    },
    button: {
        minHeight: theme.interaction.minimumTouchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        borderRadius: theme.radius.md,
        borderColor: theme.colors.outline,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.surfaceContainerLow,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        overflow: 'hidden'
    },
    valueText: {
        flex: 1,
        minWidth: 0,
        gap: theme.spacing.xs
    },
    valueLabel: {
        fontWeight: '600'
    },
    menu: {
        ...theme.shadows.raised,
        position: 'absolute',
        overflow: 'hidden',
        borderRadius: theme.radius.md,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.surfaceContainerHigh
    },
    option: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        borderBottomColor: theme.colors.outlineVariant,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        overflow: 'hidden'
    },
    optionLast: {
        borderBottomWidth: 0
    },
    optionSelected: {
        backgroundColor: theme.colors.primaryContainer
    },
    optionTitle: {
        fontWeight: '600'
    },
    optionTitleSelected: {
        color: theme.colors.onPrimaryContainer
    },
    pressedSurface: {
        backgroundColor: theme.colors.surfacePressed
    }
    });
}
