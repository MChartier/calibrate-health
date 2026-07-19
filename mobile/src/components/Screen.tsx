import React from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewProps, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type AppTheme, useAppTheme } from '../theme';

type ScreenProps = ViewProps & {
    scroll?: boolean;
    safeTop?: boolean;
    reserveBottomTabs?: boolean;
};

const BOTTOM_TAB_RESERVED_SPACE = 88; // Expanded FAB height plus two layout gaps above the tab bar.
const DESKTOP_CONTENT_MAX_WIDTH = 1040; // Keeps forms and metrics readable on wide browser windows.
const WIDE_LAYOUT_BREAKPOINT = 840;

export const Screen: React.FC<ScreenProps> = ({
    children,
    scroll = true,
    safeTop = false,
    reserveBottomTabs = false,
    style,
    accessibilityRole,
    role,
    ...viewProps
}) => {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const resolvedRole: ViewProps['role'] = role ?? (accessibilityRole ? undefined : 'main');
    const horizontalPadding = Platform.OS === 'web' && width >= WIDE_LAYOUT_BREAKPOINT
        ? theme.spacing.xl
        : theme.spacing.lg;
    const bottomPadding = theme.spacing.xl + insets.bottom + (reserveBottomTabs ? BOTTOM_TAB_RESERVED_SPACE : 0);
    const contentStyle = [
        styles.content,
        {
            paddingTop: safeTop ? insets.top + theme.spacing.lg : theme.spacing.lg,
            paddingBottom: bottomPadding,
            paddingHorizontal: horizontalPadding
        },
        style
    ];

    if (!scroll) {
        return (
            <View
                {...viewProps}
                accessibilityRole={accessibilityRole}
                role={resolvedRole}
                focusable={Platform.OS === 'web'}
                tabIndex={Platform.OS === 'web' ? -1 : undefined}
                style={[
                    styles.root,
                    {
                        paddingTop: safeTop ? insets.top + theme.spacing.lg : theme.spacing.lg,
                        paddingBottom: bottomPadding,
                        paddingHorizontal: horizontalPadding
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
            {...viewProps}
            accessibilityRole={accessibilityRole}
            role={resolvedRole}
            focusable={Platform.OS === 'web'}
            tabIndex={Platform.OS === 'web' ? -1 : undefined}
            contentContainerStyle={contentStyle}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            style={styles.scroller}
        >
            {children}
        </ScrollView>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    root: {
        flex: 1,
        width: '100%',
        maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
        alignSelf: 'center',
        backgroundColor: theme.colors.background,
        gap: theme.spacing.lg
    },
    scroller: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    content: {
        width: '100%',
        maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
        alignSelf: 'center',
        gap: theme.spacing.lg
    }
    });
}
