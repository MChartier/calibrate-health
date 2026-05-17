import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type DimensionValue, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

type SkeletonBlockProps = {
    width?: DimensionValue;
    height: number;
    radius?: number;
    style?: ViewStyle;
};

/**
 * Small pulsing placeholder used to keep native screen structure stable during data fetches.
 */
export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
    width = '100%',
    height,
    radius: blockRadius = radius.md,
    style
}) => {
    const opacity = useRef(new Animated.Value(0.48)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 760,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true
                }),
                Animated.timing(opacity, {
                    toValue: 0.48,
                    duration: 760,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true
                })
            ])
        );
        animation.start();

        return () => animation.stop();
    }, [opacity]);

    return <Animated.View style={[styles.block, { width, height, borderRadius: blockRadius, opacity }, style]} />;
};

const styles = StyleSheet.create({
    block: {
        backgroundColor: colors.surfacePressed
    }
});
