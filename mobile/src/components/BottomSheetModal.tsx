import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type AppTheme, useAppTheme } from '../theme';
import { useReducedMotionPreference } from '../hooks/useReducedMotionPreference';

type BottomSheetModalProps = {
    visible: boolean;
    onRequestClose: () => void;
    children: React.ReactNode;
    maxHeight?: ViewStyle['maxHeight'];
};

const SHEET_TRANSLATE_Y = 32; // Subtle sheet-only movement; the backdrop fades independently.

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
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.root}
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
                    <ScrollView
                        contentContainerStyle={[styles.content, { paddingBottom: Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm) }]}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={styles.handle} />
                        {children}
                    </ScrollView>
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
