import React from 'react';
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { colors, spacing } from '../theme';

export const Screen: React.FC<ViewProps & { scroll?: boolean }> = ({ children, scroll = true, style }) => {
    if (!scroll) {
        return <View style={[styles.root, style]}>{children}</View>;
    }

    return (
        <ScrollView contentContainerStyle={[styles.content, style]} style={styles.scroller}>
            {children}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.background,
        padding: spacing.lg,
        gap: spacing.lg
    },
    scroller: {
        flex: 1,
        backgroundColor: colors.background
    },
    content: {
        padding: spacing.lg,
        gap: spacing.lg
    }
});
