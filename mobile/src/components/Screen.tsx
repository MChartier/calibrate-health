import React from 'react';
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

type ScreenProps = ViewProps & {
    scroll?: boolean;
    safeTop?: boolean;
};

export const Screen: React.FC<ScreenProps> = ({ children, scroll = true, safeTop = false, style }) => {
    const insets = useSafeAreaInsets();
    const contentStyle = [
        styles.content,
        {
            paddingTop: safeTop ? insets.top + spacing.lg : spacing.lg,
            paddingBottom: spacing.xl + (safeTop ? insets.bottom : 0)
        },
        style
    ];

    if (!scroll) {
        return (
            <View
                style={[
                    styles.root,
                    {
                        paddingTop: safeTop ? insets.top + spacing.lg : spacing.lg,
                        paddingBottom: spacing.xl + (safeTop ? insets.bottom : 0)
                    },
                    style
                ]}
            >
                {children}
            </View>
        );
    }

    return (
        <ScrollView
            contentContainerStyle={contentStyle}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            style={styles.scroller}
        >
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
        paddingHorizontal: spacing.lg,
        gap: spacing.lg
    }
});
