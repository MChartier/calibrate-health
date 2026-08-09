import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    View,
    type PressableProps,
    type StyleProp,
    type ViewStyle
} from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';
import { AppCard } from './AppCard';
import { useFocusVisible } from './useFocusVisible';

export type NavigableCardProps = Omit<PressableProps, 'children' | 'style' | 'testID'> & {
    accessibilityLabel: string;
    children: React.ReactNode;
    secondaryAction?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    secondaryActionStyle?: StyleProp<ViewStyle>;
    secondaryActionPlacement?: 'trailing' | 'footer';
    selected?: boolean;
    busy?: boolean;
    testID?: string;
    primaryActionTestID?: string;
    secondaryActionTestID?: string;
};

/** Full-card navigation target with a separate, non-nested secondary action region. */
export const NavigableCard: React.FC<NavigableCardProps> = ({
    accessibilityLabel,
    children,
    secondaryAction,
    style,
    contentStyle,
    secondaryActionStyle,
    secondaryActionPlacement = 'trailing',
    selected = false,
    busy = false,
    testID,
    primaryActionTestID,
    secondaryActionTestID,
    disabled,
    accessibilityRole,
    accessibilityState,
    onBlur,
    onFocus,
    onHoverIn,
    onHoverOut,
    onPressIn,
    onPressOut,
    ...pressableProps
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const [hovered, setHovered] = React.useState(false);
    const [pressed, setPressed] = React.useState(false);
    const { focusVisible, handleFocus, handleBlur } = useFocusVisible(onFocus, onBlur);
    const inactive = Boolean(disabled || busy);

    return (
        <AppCard
            testID={testID}
            style={[
                styles.surface,
                secondaryActionPlacement === 'footer' && styles.surfaceFooter,
                selected && styles.selected,
                hovered && !inactive && (selected ? styles.hoveredSelected : styles.hovered),
                pressed && !inactive && styles.pressed,
                focusVisible && styles.focusVisible,
                disabled && styles.disabled,
                busy && styles.busy,
                style
            ]}
        >
            <Pressable
                {...pressableProps}
                testID={primaryActionTestID}
                accessibilityLabel={accessibilityLabel}
                accessibilityRole={accessibilityRole ?? 'link'}
                accessibilityState={{
                    ...accessibilityState,
                    busy,
                    disabled: inactive,
                    selected
                }}
                disabled={inactive}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onHoverIn={(event) => {
                    setHovered(true);
                    onHoverIn?.(event);
                }}
                onHoverOut={(event) => {
                    setHovered(false);
                    onHoverOut?.(event);
                }}
                onPressIn={(event) => {
                    setPressed(true);
                    onPressIn?.(event);
                }}
                onPressOut={(event) => {
                    setPressed(false);
                    onPressOut?.(event);
                }}
                style={[
                    styles.primaryAction,
                    secondaryActionPlacement === 'footer' && styles.primaryActionFooter
                ]}
            >
                <View pointerEvents="none" style={[styles.content, contentStyle]}>
                    {children}
                    {busy ? <ActivityIndicator color={theme.colors.onSurfaceVariant} /> : null}
                </View>
            </Pressable>
            {secondaryAction ? (
                <View
                    testID={secondaryActionTestID}
                    style={[
                        styles.secondaryAction,
                        secondaryActionPlacement === 'footer' && styles.secondaryActionFooter,
                        secondaryActionStyle
                    ]}
                >
                    {secondaryAction}
                </View>
            ) : null}
        </AppCard>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        surface: {
            minHeight: theme.interaction.minimumTouchTarget,
            padding: 0,
            gap: 0,
            flexDirection: 'row',
            alignItems: 'stretch',
            borderColor: theme.colors.outline
        },
        surfaceFooter: {
            flexDirection: 'column'
        },
        selected: {
            backgroundColor: theme.colors.selectionContainer,
            borderColor: theme.colors.selection
        },
        hovered: {
            backgroundColor: theme.colors.surfaceHovered,
            borderColor: theme.colors.outline
        },
        hoveredSelected: {
            opacity: theme.interaction.hoveredOpacity
        },
        pressed: {
            backgroundColor: theme.colors.surfacePressed,
            borderColor: theme.colors.outline,
            shadowOpacity: 0,
            elevation: 0,
            opacity: theme.interaction.pressedOpacity,
            transform: [{ translateY: 1 }]
        },
        focusVisible: {
            outlineColor: theme.colors.focusRing,
            outlineStyle: 'solid',
            outlineWidth: theme.interaction.focusRingWidth
        },
        disabled: {
            opacity: theme.interaction.disabledOpacity
        },
        busy: {
            opacity: theme.interaction.busyOpacity
        },
        primaryAction: {
            minWidth: 0,
            minHeight: theme.interaction.minimumTouchTarget,
            flex: 1,
            borderTopLeftRadius: theme.radius.lg,
            borderBottomLeftRadius: theme.radius.lg
        },
        primaryActionFooter: {
            width: '100%',
            borderTopRightRadius: theme.radius.lg,
            borderBottomLeftRadius: 0
        },
        content: {
            minHeight: theme.interaction.minimumTouchTarget,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            justifyContent: 'center'
        },
        secondaryAction: {
            minWidth: theme.interaction.minimumTouchTarget,
            minHeight: theme.interaction.minimumTouchTarget,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.sm,
            borderLeftColor: theme.colors.outlineVariant,
            borderLeftWidth: StyleSheet.hairlineWidth
        },
        secondaryActionFooter: {
            width: '100%',
            alignItems: 'stretch',
            borderColor: theme.colors.outline,
            borderLeftWidth: 0,
            borderTopColor: theme.colors.outlineVariant,
            borderTopWidth: StyleSheet.hairlineWidth
        }
    });
}
