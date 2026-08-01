import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type AppTheme, useAppTheme } from '../theme';
import { useReducedMotionPreference } from '../hooks/useReducedMotionPreference';
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight';
import { getKeyboardAvoidingBehavior } from '../utils/keyboard';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';

type BottomSheetModalProps = {
    visible: boolean;
    onRequestClose: () => void;
    children: React.ReactNode;
    maxHeight?: ViewStyle['maxHeight'];
};

const SHEET_TRANSLATE_Y = 32; // Subtle sheet-only movement; the backdrop fades independently.
const WEB_FIXED_POSITION = 'fixed' as ViewStyle['position']; // Keeps portal sheets anchored while the underlying web page is scrolled.

/**
 * Native-feeling bottom sheet with a non-sliding dimmed backdrop.
 */
export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
    visible,
    onRequestClose,
    children,
    maxHeight = '88%'
}) => {
    const insets = useSafeAreaInsets();
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const reduceMotion = useReducedMotionPreference();
    const visualViewportHeight = useVisualViewportHeight();
    const [shouldRender, setShouldRender] = useState(visible);
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const sheetProgress = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            setShouldRender(true);
            backdropOpacity.setValue(0);
            sheetProgress.setValue(1);
            Animated.parallel([
                Animated.timing(backdropOpacity, {
                    toValue: 1,
                    duration: reduceMotion ? 0 : 160,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true
                }),
                Animated.timing(sheetProgress, {
                    toValue: 0,
                    duration: reduceMotion ? 0 : 220,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true
                })
            ]).start();
            return;
        }

        if (!shouldRender) return;

        Animated.parallel([
            Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: reduceMotion ? 0 : 140,
                easing: Easing.in(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(sheetProgress, {
                toValue: 1,
                duration: reduceMotion ? 0 : 160,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true
            })
        ]).start(({ finished }) => {
            if (finished) {
                setShouldRender(false);
            }
        });
    }, [backdropOpacity, reduceMotion, sheetProgress, shouldRender, visible]);

    if (!shouldRender) return null;

    const translateY = sheetProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, SHEET_TRANSLATE_Y]
    });

    return (
        <Modal visible transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={onRequestClose}>
            <KeyboardAvoidingView
                testID="bottom-sheet-root"
                behavior={getKeyboardAvoidingBehavior(Platform.OS)}
                style={[
                    styles.root,
                    visualViewportHeight !== undefined && styles.webViewportRoot,
                    visualViewportHeight !== undefined && { height: visualViewportHeight }
                ]}
            >
                <Pressable accessibilityRole="button" accessibilityLabel="Close dialog" style={StyleSheet.absoluteFill} onPress={onRequestClose}>
                    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
                </Pressable>
                <Animated.View
                    accessibilityViewIsModal
                    style={[
                        styles.sheet,
                        {
                            maxHeight,
                            transform: [{ translateY }]
                        }
                    ]}
                >
                    <KeyboardAwareScrollView
                        contentContainerStyle={[styles.content, { paddingBottom: Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm) }]}
                    >
                        <View style={styles.handle} />
                        {children}
                    </KeyboardAwareScrollView>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    root: {
        flex: 1,
        justifyContent: 'flex-end'
    },
    webViewportRoot: {
        flex: 0,
        width: '100%',
        position: WEB_FIXED_POSITION,
        top: 0,
        left: 0,
        right: 0
    },
    backdrop: {
        flex: 1,
        backgroundColor: theme.colors.scrim
    },
    sheet: {
        ...theme.shadows.raised,
        width: '100%',
        overflow: 'hidden',
        borderTopLeftRadius: theme.radius.sheet,
        borderTopRightRadius: theme.radius.sheet,
        backgroundColor: theme.colors.surfaceContainerLow,
        borderColor: theme.colors.outlineVariant,
        borderTopWidth: StyleSheet.hairlineWidth
    },
    content: {
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md
    },
    handle: {
        alignSelf: 'center',
        width: 44,
        height: 4,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.outline,
        marginBottom: theme.spacing.xs
    }
    });
}
