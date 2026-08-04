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
    scrollable?: boolean;
    footer?: React.ReactNode;
    dismissDisabled?: boolean;
    contentKey?: React.Key;
    onShow?: () => void;
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

/** React Native Web portals need a pixel height because percentage heights resolve against a zero-height wrapper. */
export function resolveFixedSheetHeight(
    maxHeight: ViewStyle['maxHeight'],
    visualViewportHeight: number | undefined
): ViewStyle['height'] {
    if (visualViewportHeight === undefined || typeof maxHeight !== 'string') return maxHeight;
    const percentageMatch = maxHeight.match(/^(\d+(?:\.\d+)?)%$/);
    if (!percentageMatch) return maxHeight;
    return visualViewportHeight * (Number(percentageMatch[1]) / 100);
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
    showHandle = true,
    scrollable = true,
    footer,
    dismissDisabled = false,
    contentKey,
    onShow
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
    const fixedSheetHeight = resolveFixedSheetHeight(maxHeight, visualViewportHeight);
    const usesFixedSheetHeight = !scrollable || Boolean(footer);

    return (
        <Modal
            visible
            transparent
            animationType="none"
            accessibilityLabel={accessibilityLabel}
            aria-label={accessibilityLabel}
            accessibilityViewIsModal
            presentationStyle="overFullScreen"
            onRequestClose={dismissDisabled ? () => undefined : onRequestClose}
            onShow={onShow}
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
                    disabled={dismissDisabled}
                    style={[StyleSheet.absoluteFill, styles.backdropPressable]}
                    onPress={onRequestClose}
                >
                    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
                </Pressable>
                <Animated.View
                    style={[
                        styles.sheet,
                        usesFixedSheetHeight && styles.fixedHeightSheet,
                        {
                            maxHeight: usesFixedSheetHeight ? fixedSheetHeight : maxHeight,
                            height: usesFixedSheetHeight ? fixedSheetHeight : undefined,
                            transform: [{ translateY }]
                        }
                    ]}
                >
                    {sheetTopControl && (
                        <View testID="bottom-sheet-fixed-controls" style={styles.topControls}>
                            {sheetTopControl}
                        </View>
                    )}
                    {scrollable ? (
                        <KeyboardAwareScrollView
                            key={contentKey}
                            testID="bottom-sheet-scroll"
                            style={styles.scroll}
                            contentContainerStyle={[
                                styles.content,
                                {
                                    paddingTop: sheetTopControl ? theme.spacing.sm : theme.spacing.md,
                                    paddingBottom: footer
                                        ? 0
                                        : Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm)
                                }
                            ]}
                        >
                            {children}
                        </KeyboardAwareScrollView>
                    ) : (
                        <View
                            style={[
                                styles.content,
                                styles.fixedContent,
                                {
                                    paddingTop: sheetTopControl ? theme.spacing.sm : theme.spacing.md,
                                    paddingBottom: footer
                                        ? 0
                                        : Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm)
                                }
                            ]}
                        >
                            {children}
                        </View>
                    )}
                    {footer && (
                        <View
                            style={[
                                styles.footer,
                                { paddingBottom: Math.max(theme.spacing.md, insets.bottom + theme.spacing.sm) }
                            ]}
                        >
                            {footer}
                        </View>
                    )}
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
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 'auto',
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
    backdropPressable: {
        zIndex: 0
    },
    sheet: {
        ...theme.shadows.raised,
        position: 'relative',
        zIndex: 1,
        width: '100%',
        overflow: 'hidden',
        borderTopLeftRadius: theme.radius.sheet,
        borderTopRightRadius: theme.radius.sheet,
        backgroundColor: theme.colors.surfaceContainerLow,
        borderColor: theme.colors.outlineVariant,
        borderTopWidth: StyleSheet.hairlineWidth
    },
    topControls: {
        width: '100%',
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        backgroundColor: theme.colors.surfaceContainerLow
    },
    scroll: {
        flexShrink: 1
    },
    fixedHeightSheet: {
        minHeight: 0
    },
    content: {
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg
    },
    closeRow: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: SHEET_CLOSE_ROW_MAX_WIDTH,
        minHeight: theme.interaction.minimumTouchTarget,
        alignItems: 'flex-end',
        justifyContent: 'center'
    },
    fixedContent: {
        flex: 1,
        minHeight: 0
    },
    footer: {
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        borderTopColor: theme.colors.outlineVariant,
        borderTopWidth: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.surfaceContainerLow
    },
    handle: {
        alignSelf: 'center',
        width: 44,
        height: 4,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.outline
    }
    });
}
