import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing } from '../theme';

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
                    duration: 160,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true
                }),
                Animated.timing(sheetProgress, {
                    toValue: 0,
                    duration: 220,
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
                duration: 140,
                easing: Easing.in(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(sheetProgress, {
                toValue: 1,
                duration: 160,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true
            })
        ]).start(({ finished }) => {
            if (finished) {
                setShouldRender(false);
            }
        });
    }, [backdropOpacity, sheetProgress, shouldRender, visible]);

    if (!shouldRender) return null;

    const translateY = sheetProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, SHEET_TRANSLATE_Y]
    });

    return (
        <Modal visible transparent animationType="none" onRequestClose={onRequestClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.root}
            >
                <Pressable accessibilityRole="button" accessibilityLabel="Close dialog" style={StyleSheet.absoluteFill} onPress={onRequestClose}>
                    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
                </Pressable>
                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            maxHeight,
                            marginBottom: spacing.lg + insets.bottom,
                            transform: [{ translateY }]
                        }
                    ]}
                >
                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                        <View style={styles.handle} />
                        {children}
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        justifyContent: 'flex-end'
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(31, 41, 55, 0.36)'
    },
    sheet: {
        ...shadows.card,
        margin: spacing.lg,
        overflow: 'hidden',
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    content: {
        gap: spacing.md,
        padding: spacing.lg
    },
    handle: {
        alignSelf: 'center',
        width: 44,
        height: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.border,
        marginBottom: spacing.xs
    }
});
