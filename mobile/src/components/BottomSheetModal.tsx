import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
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
            <View style={styles.root}>
                <Pressable accessibilityRole="button" accessibilityLabel="Close dialog" style={StyleSheet.absoluteFill} onPress={onRequestClose}>
                    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
                </Pressable>
                <Animated.View style={[styles.sheet, { maxHeight, transform: [{ translateY }] }]}>
                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                        {children}
                    </ScrollView>
                </Animated.View>
            </View>
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
    }
});
