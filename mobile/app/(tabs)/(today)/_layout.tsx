import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateNavigation } from '../../../src/components/DateNavigation';
import {
    SCREEN_CONTENT_MAX_WIDTH,
    SCREEN_WIDE_LAYOUT_BREAKPOINT
} from '../../../src/components/Screen';
import { useSharedLogDateNavigation } from '../../../src/context/LogDateContext';
import { getRouteByPath } from '../../../src/navigation/routeRegistry';
import { resolveSafeHorizontalPadding } from '../../../src/layout/adaptiveLayout';
import { spacing, useAppTheme, type AppTheme } from '../../../src/theme';

export default function TodayStackLayout() {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const pathname = usePathname();
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const dateNavigation = useSharedLogDateNavigation();
    const activeRoute = getRouteByPath(pathname);
    const showsDateNavigation = activeRoute?.routeId === 'today'
        || activeRoute?.routeId === 'food-log';
    const usesWideContentPadding = width >= SCREEN_WIDE_LAYOUT_BREAKPOINT;

    const dateNavigationHorizontalPadding = resolveSafeHorizontalPadding(
        usesWideContentPadding ? spacing.xl : spacing.lg,
        insets.left,
        insets.right,
        spacing.sm
    );
    return (
        <View style={styles.root}>
            {showsDateNavigation && (
                <View style={styles.dateNavigationShell}>
                    <View
                        style={[
                            styles.dateNavigationContent,
                            usesWideContentPadding && styles.dateNavigationContentWide,
                            dateNavigationHorizontalPadding
                        ]}
                    >
                        <DateNavigation navigation={dateNavigation} compact />
                    </View>
                </View>
            )}
            <View style={styles.stack}>
                <Stack screenOptions={{ headerShown: false }} />
            </View>
        </View>
    );
}

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        root: {
            flex: 1
        },
        dateNavigationShell: {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: StyleSheet.hairlineWidth
        },
        dateNavigationContent: {
            width: '100%',
            paddingVertical: spacing.md
        },
        dateNavigationContentWide: {
            maxWidth: SCREEN_CONTENT_MAX_WIDTH,
            alignSelf: 'center',
        },
        stack: {
            flex: 1
        }
    });
}
