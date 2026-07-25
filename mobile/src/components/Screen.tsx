import React from 'react';
import { Platform, StyleSheet, View, type ViewProps, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type AppTheme, useAppTheme } from '../theme';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';

type ScreenProps = ViewProps & {
    scroll?: boolean;
    safeTop?: boolean;
};

const DESKTOP_CONTENT_MAX_WIDTH = 1040; // Keeps forms and metrics readable on wide browser windows.
const WIDE_LAYOUT_BREAKPOINT = 840;

export const Screen: React.FC<ScreenProps> = ({
    children,
    scroll = true,
    safeTop = false,
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
    const bottomPadding = insets.bottom + theme.spacing.xl;
    const topPadding = safeTop ? insets.top + theme.spacing.lg : theme.spacing.lg;
    const contentStyle = [
        styles.content,
        {
            paddingTop: topPadding,
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
                        paddingTop: topPadding,
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
        <KeyboardAwareScrollView
            {...viewProps}
            accessibilityRole={accessibilityRole}
            role={resolvedRole}
            focusable={Platform.OS === 'web'}
            tabIndex={Platform.OS === 'web' ? -1 : undefined}
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
            minHeight: '100%',
            width: '100%',
            maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            gap: theme.spacing.lg
        }
    });
}
