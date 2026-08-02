import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type AppTheme, useAppTheme } from '../theme';
import { useReducedMotionPreference } from '../hooks/useReducedMotionPreference';
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight';
import { getKeyboardAvoidingBehavior } from '../utils/keyboard';
import { AppIconButton } from './AppIconButton';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';

type BottomSheetModalProps = {
    visible: boolean;
    onRequestClose: () => void;
    children: React.ReactNode;
    maxHeight?: ViewStyle['maxHeight'];
    accessibilityLabel?: string;
    showCloseButton?: boolean;
    showHandle?: boolean;
};

const SHEET_TRANSLATE_Y = 32; // Subtle sheet-only movement; the backdrop fades independently.
const WEB_FIXED_POSITION = 'fixed' as ViewStyle['position']; // Keeps portal sheets anchored while the underlying web page is scrolled.
const SHEET_CLOSE_ROW_MAX_WIDTH = 800; // Aligns an optional close action with wide detail-sheet content.
let activeWebBottomSheets = 0;
let webAppRoot: HTMLElement | null = null;
let webAppRootAriaHidden: string | null = null;
let webAppRootWasInert = false;

function hideWebAppFromModalAccessibility(): (() => void) | undefined {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const appRoot = document.getElementById('root');
    if (!appRoot) return;
    if (activeWebBottomSheets === 0) {
        webAppRoot = appRoot;
        webAppRootAriaHidden = appRoot.getAttribute('aria-hidden');
        webAppRootWasInert = appRoot.inert;
        appRoot.setAttribute('aria-hidden', 'true');
        appRoot.inert = true;
    }
    activeWebBottomSheets += 1;
    return () => {
        activeWebBottomSheets = Math.max(0, activeWebBottomSheets - 1);
        if (activeWebBottomSheets > 0 || !webAppRoot) return;
        if (webAppRootAriaHidden === null) webAppRoot.removeAttribute('aria-hidden');
        else webAppRoot.setAttribute('aria-hidden', webAppRootAriaHidden);
        webAppRoot.inert = webAppRootWasInert;
        webAppRoot = null;
        webAppRootAriaHidden = null;
        webAppRootWasInert = false;
    };
}

/**
 * Native-feeling bottom sheet with a non-sliding dimmed backdrop.
 */
export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
    visible,
    onRequestClose,
    children,
    maxHeight = '88%',
    accessibilityLabel = 'Details',
    showCloseButton = false,
    showHandle = true
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
        if (!visible) return;
        return hideWebAppFromModalAccessibility();
    }, [visible]);

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
    let sheetTopControl: React.ReactNode = null;
    if (showCloseButton) {
        sheetTopControl = (
            <View style={styles.closeRow}>
                <AppIconButton
                    icon="close"
                    accessibilityLabel={`Close ${accessibilityLabel.toLowerCase()}`}
                    variant="ghost"
                    onPress={onRequestClose}
                />
            </View>
        );
    } else if (showHandle) {
        sheetTopControl = <View accessible={false} aria-hidden style={styles.handle} />;
    }

    return (
        <Modal
            visible
            transparent
            animationType="none"
            presentationStyle="overFullScreen"
            accessibilityLabel={accessibilityLabel}
            aria-label={accessibilityLabel}
            onRequestClose={onRequestClose}
        >
            <KeyboardAvoidingView
                testID="bottom-sheet-root"
                behavior={getKeyboardAvoidingBehavior(Platform.OS)}
                style={[
                    styles.root,
                    visualViewportHeight !== undefined && styles.webViewportRoot,
                    visualViewportHeight !== undefined && { height: visualViewportHeight }
                ]}
            >
                <Pressable
                    testID="bottom-sheet-backdrop"
                    accessible={false}
                    focusable={false}
                    importantForAccessibility="no-hide-descendants"
                    aria-hidden
                    style={StyleSheet.absoluteFill}
                    onPress={onRequestClose}
                >
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
                        {sheetTopControl}
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
    closeRow: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: SHEET_CLOSE_ROW_MAX_WIDTH,
        minHeight: theme.interaction.minimumTouchTarget,
        alignItems: 'flex-end',
        justifyContent: 'center'
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
