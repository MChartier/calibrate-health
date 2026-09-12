import React from 'react';
import { Platform, StyleSheet, View, type ViewProps, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    TABLET_LAYOUT_BREAKPOINT,
    resolveSafeHorizontalPadding
} from '../layout/adaptiveLayout';
import { type AppTheme, useAppTheme } from '../theme';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';

type ScreenProps = ViewProps & {
    scroll?: boolean;
    safeTop?: boolean;
};

export const SCREEN_CONTENT_MAX_WIDTH = 1040; // Keeps forms and metrics readable on wide browser and tablet viewports.
export const SCREEN_WIDE_LAYOUT_BREAKPOINT = TABLET_LAYOUT_BREAKPOINT;
// Native ScrollViews need a flex floor; web uses its measured percentage viewport.
const SCROLL_CONTENT_VIEWPORT_FLOOR = Platform.OS === 'web'
    ? { minHeight: '100%' as const }
    : { flexGrow: 1 };

export const Screen: React.FC<ScreenProps> = ({
    children,
    scroll = true,
    safeTop = false,
    style,
    accessibilityRole,
    role,
    tabIndex,
    ...viewProps
}) => {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const resolvedRole: ViewProps['role'] = role ?? (accessibilityRole ? undefined : 'main');
    const horizontalPadding = width >= SCREEN_WIDE_LAYOUT_BREAKPOINT
        ? theme.spacing.xl
        : theme.spacing.lg;
    const safeHorizontalPadding = resolveSafeHorizontalPadding(
        horizontalPadding,
        insets.left,
        insets.right,
        theme.spacing.sm
    );
    const bottomPadding = insets.bottom + theme.spacing.xl;
    const topPadding = safeTop ? insets.top + theme.spacing.lg : theme.spacing.lg;
    const contentStyle = [
        styles.content,
        {
            paddingTop: topPadding,
            paddingBottom: bottomPadding,
            ...safeHorizontalPadding
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
                tabIndex={Platform.OS === 'web' ? (tabIndex ?? -1) : tabIndex}
                style={[
                    styles.root,
                    {
                        paddingTop: topPadding,
                        paddingBottom: bottomPadding,
                        ...safeHorizontalPadding
                    },
                    style
                ]}
            >
                {children}
            </View>
        );
    }

    return (
        <KeyboardAwareScrollView
            {...viewProps}
            accessibilityRole={accessibilityRole}
            role={resolvedRole}
            focusable={Platform.OS === 'web'}
            tabIndex={Platform.OS === 'web' ? (tabIndex ?? -1) : tabIndex}
            contentContainerStyle={contentStyle}
            style={styles.scroller}
        >
            {children}
        </KeyboardAwareScrollView>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        root: {
            flex: 1,
            width: '100%',
            maxWidth: SCREEN_CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            backgroundColor: theme.colors.background,
            gap: theme.spacing.lg
        },
        scroller: {
            flex: 1,
            backgroundColor: theme.colors.background
        },
        content: {
            ...SCROLL_CONTENT_VIEWPORT_FLOOR,
            width: '100%',
            maxWidth: SCREEN_CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            gap: theme.spacing.lg
        }
    });
}
