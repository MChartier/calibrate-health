import React from 'react';
import {
    Image,
    Platform,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
    type PressableProps,
    type StyleProp,
    type ViewStyle
} from 'react-native';
import { Redirect, router, Tabs, usePathname, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InAppNotification } from '@calibrate/api-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../src/components/AppText';
import { CalibrateLogo } from '../../src/components/CalibrateLogo';
import { LoadingState } from '../../src/components/LoadingState';
import { NotificationsDrawer } from '../../src/components/NotificationsDrawer';
import { useAuth } from '../../src/auth/AuthContext';
import { LogDateProvider } from '../../src/context/LogDateContext';
import {
    AddFoodRequestProvider,
    type AddFoodRequest,
    type AddFoodRequestInput
} from '../../src/context/AddFoodRequestContext';
import { useLogDateNavigation } from '../../src/hooks/useLogDateNavigation';
import { useOfflineOutbox } from '../../src/offline/provider';
import { OUTBOX_MUTATION_STATES } from '../../src/offline/queuedMutation';
import { getActiveTabRoute, resolveContextualFab, type ContextualFabKind } from '../../src/navigation/contextualFab';
import { getNotificationAction } from '../../src/notifications/workflow';
import { getTodayDate } from '../../src/utils/dates';
import { isProfileSetupComplete } from '../../src/utils/profileCompletion';
import { radius, spacing, useAppTheme, type AppTheme, type AppThemeColors } from '../../src/theme';

const HIDDEN_TAB_OPTIONS = {
    href: null
} as const;

const TAB_BAR_CONTENT_HEIGHT = 56; // Keeps the UIKit icon, label, and built-in item padding from clipping.
const TAB_BAR_VERTICAL_PADDING = spacing.sm; // Separates tab content from both bar edges before safe-area padding.
const TAB_BAR_BASE_HEIGHT = TAB_BAR_CONTENT_HEIGHT + (TAB_BAR_VERTICAL_PADDING * 2);
const HEADER_ROW_MIN_HEIGHT = 56; // Standard compact Android app-bar height before large-text expansion.
const LARGE_TEXT_HEIGHT_INCREMENT = 18; // Adds vertical room as Android font scale grows toward 200%.
const DESKTOP_NAV_BREAKPOINT = 1024;
const DESKTOP_NAV_RAIL_WIDTH = 104;
const DESKTOP_CONTENT_MAX_WIDTH = 1040;

type NavigationPressableProps = PressableProps & {
    focusStyle: StyleProp<ViewStyle>;
    hoverStyle?: StyleProp<ViewStyle>;
};

/** Adds explicit keyboard focus and pointer-hover feedback to shell actions. */
const NavigationPressable: React.FC<NavigationPressableProps> = ({
    focusStyle,
    hoverStyle,
    onBlur,
    onFocus,
    onHoverIn,
    onHoverOut,
    style,
    ...props
}) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <Pressable
            {...props}
            focusable
            onBlur={(event) => {
                setIsFocused(false);
                onBlur?.(event);
            }}
            onFocus={(event) => {
                setIsFocused(true);
                onFocus?.(event);
            }}
            onHoverIn={(event) => {
                setIsHovered(true);
                onHoverIn?.(event);
            }}
            onHoverOut={(event) => {
                setIsHovered(false);
                onHoverOut?.(event);
            }}
            style={(state) => [
                typeof style === 'function' ? style(state) : style,
                isHovered && hoverStyle,
                isFocused && focusStyle
            ]}
        />
    );
};

export default function TabsLayout() {
    const { api, user, isLoading } = useAuth();
    const queryClient = useQueryClient();
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme.colors, theme.shadows), [theme]);
    const insets = useSafeAreaInsets();
    const { fontScale, width } = useWindowDimensions();
    const pathname = usePathname();
    const usesNavigationRail = Platform.OS === 'web' && width >= DESKTOP_NAV_BREAKPOINT;
    const logDateNavigation = useLogDateNavigation();
    const addFoodRequestSequence = React.useRef(0);
    const [addFoodRequest, setAddFoodRequest] = React.useState<AddFoodRequest | null>(null);
    const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = React.useState(false);
    const { mutations: queuedMutations } = useOfflineOutbox();
    const hasFailedOfflineChanges = queuedMutations.some(
        (mutation) => mutation.state === OUTBOX_MUTATION_STATES.FAILED
    );
    const profileQuery = useQuery({
        queryKey: ['mobile-profile'],
        queryFn: () => api.getUserProfile(),
        enabled: Boolean(user)
    });
    const notificationsQuery = useQuery({
        queryKey: ['mobile-in-app-notifications'],
        queryFn: () => api.getInAppNotifications(),
        enabled: Boolean(user)
    });
    const progressMetricsQuery = useQuery({
        queryKey: ['mobile-metrics'],
        queryFn: () => api.getMetrics(),
        enabled: Boolean(user) && getActiveTabRoute(pathname) === 'progress'
    });
    const dismissNotification = useMutation({
        mutationFn: (notification: InAppNotification) => api.dismissInAppNotification(notification.id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] })
    });
    const openNotification = useMutation({
        mutationFn: async (notification: InAppNotification) => {
            await api.markInAppNotificationRead(notification.id);
            return notification;
        },
        onSuccess: async (notification) => {
            await queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] });
            setIsNotificationDrawerOpen(false);
            router.push(getNotificationAction(notification.action_url, notification.local_date).href as Href);
        }
    });
    const requestAddFood = React.useCallback((input: AddFoodRequestInput = {}) => {
        addFoodRequestSequence.current += 1;
        setAddFoodRequest({ id: addFoodRequestSequence.current, ...input });
    }, []);
    const consumeAddFoodRequest = React.useCallback((id: number) => {
        setAddFoodRequest((current) => current?.id === id ? null : current);
    }, []);
    const addFoodRequestContext = React.useMemo(() => ({
        request: addFoodRequest,
        requestAddFood,
        consumeRequest: consumeAddFoodRequest
    }), [addFoodRequest, consumeAddFoodRequest, requestAddFood]);

    if (isLoading) {
        return <LoadingState />;
    }

    if (!user) {
        return <Redirect href="/(auth)/login" />;
    }

    if (profileQuery.isLoading) {
        return <LoadingState label="Checking setup..." />;
    }

    if (profileQuery.isSuccess && !isProfileSetupComplete(profileQuery.data)) {
        return <Redirect href="/onboarding" />;
    }

    const tabBarHeight = TAB_BAR_BASE_HEIGHT
        + Math.round(Math.max(0, Math.min(fontScale, 2) - 1) * LARGE_TEXT_HEIGHT_INCREMENT)
        + insets.bottom;
    const desktopContentGutter = Math.max(
        spacing.xl,
        (width - DESKTOP_NAV_RAIL_WIDTH - DESKTOP_CONTENT_MAX_WIDTH) / 2 + spacing.xl
    );
    const today = getTodayDate(user.timezone);
    const fabKind = resolveContextualFab({
        pathname,
        today,
        metrics: progressMetricsQuery.data,
        metricsLoaded: progressMetricsQuery.isSuccess
    });

    return (
        <LogDateProvider value={logDateNavigation}>
            <AddFoodRequestProvider value={addFoodRequestContext}>
                <View style={styles.shell}>
                    <Tabs
                        screenOptions={{
                            tabBarPosition: usesNavigationRail ? 'left' : 'bottom',
                            tabBarVariant: usesNavigationRail ? 'material' : 'uikit',
                            tabBarLabelPosition: 'below-icon',
                            tabBarActiveTintColor: theme.colors.primary,
                            tabBarInactiveTintColor: theme.colors.muted,
                            tabBarActiveBackgroundColor: usesNavigationRail ? theme.colors.primaryContainer : undefined,
                            tabBarHideOnKeyboard: true,
                            tabBarStyle: usesNavigationRail
                                ? [styles.navigationRail, { paddingTop: Math.max(insets.top, spacing.lg) }]
                                : {
                                    backgroundColor: theme.colors.surface,
                                    borderTopColor: theme.colors.border,
                                    height: tabBarHeight,
                                    paddingBottom: insets.bottom + TAB_BAR_VERTICAL_PADDING,
                                    paddingTop: TAB_BAR_VERTICAL_PADDING,
                                    paddingHorizontal: spacing.md
                                },
                            tabBarItemStyle: [styles.tabBarItem, usesNavigationRail && styles.navigationRailItem],
                            tabBarLabelStyle: styles.tabBarLabel,
                            header: ({ options }) => (
                                <TabHeader
                                    topInset={insets.top}
                                    fontScale={fontScale}
                                    title={typeof options.headerTitle === 'string' ? options.headerTitle : ''}
                                    unreadCount={notificationsQuery.data?.unread_count ?? 0}
                                    offlineChangeCount={queuedMutations.length}
                                    hasFailedOfflineChanges={hasFailedOfflineChanges}
                                    profileImageUrl={user.profile_image_url}
                                    onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
                                    colors={theme.colors}
                                    styles={styles}
                                    desktop={usesNavigationRail}
                                />
                            )
                        }}
                    >
                        <Tabs.Screen
                            name="today"
                            options={{
                                title: 'Today',
                                headerTitle: 'Today',
                                tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" color={color} size={size} />
                            }}
                        />
                        <Tabs.Screen
                            name="progress"
                            options={{
                                title: 'Progress',
                                headerTitle: 'Progress',
                                tabBarIcon: ({ color, size }) => <Ionicons name="analytics-outline" color={color} size={size} />
                            }}
                        />
                        <Tabs.Screen
                            name="settings"
                            options={{
                                ...HIDDEN_TAB_OPTIONS,
                                title: 'Account',
                                headerTitle: 'Account'
                            }}
                        />
                        <Tabs.Screen name="log" options={{ ...HIDDEN_TAB_OPTIONS, title: 'Add food' }} />
                        <Tabs.Screen name="food-log" options={{ ...HIDDEN_TAB_OPTIONS, headerShown: false, title: 'Food log' }} />
                        <Tabs.Screen name="weight" options={{ ...HIDDEN_TAB_OPTIONS, title: 'Log weight' }} />
                        <Tabs.Screen name="goals" options={HIDDEN_TAB_OPTIONS} />
                    </Tabs>
                    <NotificationsDrawer
                        visible={isNotificationDrawerOpen}
                        notifications={notificationsQuery.data?.notifications ?? []}
                        unreadCount={notificationsQuery.data?.unread_count ?? 0}
                        isLoading={notificationsQuery.isLoading}
                        isBusy={dismissNotification.isPending || openNotification.isPending}
                        errorMessage={notificationsQuery.error?.message
                            ?? dismissNotification.error?.message
                            ?? openNotification.error?.message}
                        onClose={() => setIsNotificationDrawerOpen(false)}
                        onOpenNotification={(notification) => openNotification.mutate(notification)}
                        onDismissNotification={(notification) => dismissNotification.mutate(notification)}
                        onRetry={() => {
                            dismissNotification.reset();
                            openNotification.reset();
                            void notificationsQuery.refetch();
                        }}
                    />
                    {fabKind && (
                        <ContextualFab
                            kind={fabKind}
                            bottom={usesNavigationRail ? spacing.xxl : tabBarHeight + spacing.lg}
                            right={usesNavigationRail ? desktopContentGutter : spacing.xl}
                            compact={fontScale >= 1.6 || width < 360}
                            colors={theme.colors}
                            styles={styles}
                            onPress={() => {
                                if (fabKind === 'add-food') {
                                    requestAddFood({ date: logDateNavigation.selectedDate });
                                    if (getActiveTabRoute(pathname) !== 'food-log') {
                                        router.navigate('/(tabs)/today');
                                    }
                                    return;
                                }
                                router.push({ pathname: '/(tabs)/weight', params: { date: today } });
                            }}
                        />
                    )}
                </View>
            </AddFoodRequestProvider>
        </LogDateProvider>
    );
}

const TabHeader: React.FC<{
    topInset: number;
    fontScale: number;
    title: string;
    unreadCount: number;
    offlineChangeCount: number;
    hasFailedOfflineChanges: boolean;
    profileImageUrl: string | null;
    onOpenNotifications: () => void;
    colors: AppThemeColors;
    styles: TabStyles;
    desktop: boolean;
}> = ({ topInset, fontScale, title, unreadCount, offlineChangeCount, hasFailedOfflineChanges, profileImageUrl, onOpenNotifications, colors, styles, desktop }) => (
    <View role="banner" style={[styles.headerRoot, { paddingTop: topInset }]}>
        <View
            style={[
                styles.headerRow,
                desktop && styles.headerRowDesktop,
                { minHeight: HEADER_ROW_MIN_HEIGHT + Math.round(Math.max(0, Math.min(fontScale, 2) - 1) * LARGE_TEXT_HEIGHT_INCREMENT) }
            ]}
        >
            <View style={styles.headerLeading}>
                <HeaderBrand colors={colors} styles={styles} />
                <AppText accessibilityRole="header" aria-level={1} numberOfLines={2} style={styles.headerTitleText}>{title}</AppText>
            </View>
            <HeaderActions
                unreadCount={unreadCount}
                offlineChangeCount={offlineChangeCount}
                hasFailedOfflineChanges={hasFailedOfflineChanges}
                profileImageUrl={profileImageUrl}
                onOpenNotifications={onOpenNotifications}
                colors={colors}
                styles={styles}
            />
        </View>
    </View>
);

const HeaderBrand: React.FC<{ colors: AppThemeColors; styles: TabStyles }> = ({ colors, styles }) => (
    <NavigationPressable
        accessibilityRole="button"
        accessibilityLabel="Go to Today"
        accessibilityHint="Opens the Today dashboard"
        android_ripple={{ color: colors.surfacePressed, borderless: false }}
        focusStyle={styles.navigationFocus}
        hoverStyle={styles.navigationHover}
        onPress={() => router.push('/(tabs)/today')}
        style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
    >
        <CalibrateLogo size={30} />
    </NavigationPressable>
);

const HeaderActions: React.FC<{
    unreadCount: number;
    offlineChangeCount: number;
    hasFailedOfflineChanges: boolean;
    profileImageUrl: string | null;
    onOpenNotifications: () => void;
    colors: AppThemeColors;
    styles: TabStyles;
}> = ({ unreadCount, offlineChangeCount, hasFailedOfflineChanges, profileImageUrl, onOpenNotifications, colors, styles }) => (
    <View accessibilityRole="toolbar" accessibilityLabel="App actions" style={styles.headerActions}>
        {offlineChangeCount > 0 && (
            <NavigationPressable
                accessibilityRole="button"
                accessibilityLabel={`${offlineChangeCount} offline changes ${hasFailedOfflineChanges ? 'need attention' : 'pending'}`}
                android_ripple={{ color: colors.surfacePressed, borderless: false }}
                focusStyle={styles.navigationFocus}
                hoverStyle={styles.navigationHover}
                onPress={() => router.push('/(tabs)/settings')}
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
                <Ionicons
                    name={hasFailedOfflineChanges ? 'cloud-offline-outline' : 'cloud-upload-outline'}
                    size={22}
                    color={hasFailedOfflineChanges ? colors.danger : colors.warningDark}
                />
            </NavigationPressable>
        )}
        <NavigationPressable
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Open notifications, ${unreadCount} unread` : 'Open notifications'}
            android_ripple={{ color: colors.surfacePressed, borderless: false }}
            focusStyle={styles.navigationFocus}
            hoverStyle={styles.navigationHover}
            onPress={onOpenNotifications}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
            <Ionicons name="notifications-outline" size={21} color={colors.text} />
            {unreadCount > 0 && (
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.badge}>
                    <AppText style={styles.badgeText}>{Math.min(unreadCount, 99)}</AppText>
                </View>
            )}
        </NavigationPressable>
        <NavigationPressable
            accessibilityRole="button"
            accessibilityLabel="Open account"
            accessibilityHint="Opens profile and app settings"
            android_ripple={{ color: colors.surfacePressed, borderless: false }}
            focusStyle={styles.navigationFocus}
            hoverStyle={styles.navigationHover}
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
            {profileImageUrl ? (
                <Image source={{ uri: profileImageUrl }} resizeMode="cover" style={styles.headerAvatarImage} />
            ) : (
                <Ionicons name="person-circle-outline" size={29} color={colors.text} />
            )}
        </NavigationPressable>
    </View>
);

const ContextualFab: React.FC<{
    kind: Exclude<ContextualFabKind, null>;
    bottom: number;
    right: number;
    compact: boolean;
    onPress: () => void;
    colors: AppThemeColors;
    styles: TabStyles;
}> = ({ kind, bottom, right, compact, onPress, colors, styles }) => {
    const isAddFood = kind === 'add-food';
    const label = isAddFood ? 'Add food' : 'Log weight';

    return (
        <NavigationPressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={isAddFood ? 'Opens food search for the selected day' : "Opens today's weight editor"}
            android_ripple={{ color: colors.ripple, borderless: false }}
            focusStyle={styles.fabFocus}
            hoverStyle={styles.fabHover}
            onPress={onPress}
            style={({ pressed }) => [styles.fab, compact && styles.fabCompact, { bottom, right }, pressed && styles.fabPressed]}
        >
            <Ionicons name={isAddFood ? 'add' : 'scale-outline'} size={24} color={colors.onPrimary} />
            {!compact && <AppText style={styles.fabLabel}>{label}</AppText>}
        </NavigationPressable>
    );
};

type TabStyles = ReturnType<typeof createStyles>;

function createStyles(colors: AppThemeColors, shadows: AppTheme['shadows']) {
    return StyleSheet.create({
    shell: {
        flex: 1
    },
    tabBarItem: {
        minHeight: TAB_BAR_CONTENT_HEIGHT
    },
    navigationRail: {
        width: DESKTOP_NAV_RAIL_WIDTH,
        height: '100%',
        backgroundColor: colors.surface,
        borderTopWidth: 0,
        borderRightColor: colors.border,
        borderRightWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: spacing.sm,
        paddingBottom: spacing.lg
    },
    navigationRailItem: {
        minHeight: 72,
        maxHeight: 80,
        marginVertical: spacing.xs,
        borderRadius: radius.lg
    },
    tabBarLabel: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700'
    },
    headerRoot: {
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg
    },
    headerRowDesktop: {
        width: '100%',
        maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
        alignSelf: 'center',
        paddingHorizontal: spacing.xl
    },
    headerLeading: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    headerTitleText: {
        flexShrink: 1,
        color: colors.text,
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '800'
    },
    brand: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs
    },
    headerButton: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center'
    },
    headerAvatarImage: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outline,
        backgroundColor: colors.surfaceContainer,
        overflow: 'hidden'
    },
    pressed: {
        backgroundColor: colors.surfaceAlt
    },
    navigationHover: {
        backgroundColor: colors.surfaceAlt
    },
    navigationFocus: {
        borderColor: colors.primary,
        borderWidth: 2
    },
    badge: {
        position: 'absolute',
        top: 5,
        right: 4,
        minWidth: 18,
        height: 18,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        paddingHorizontal: 4
    },
    badgeText: {
        color: colors.onPrimary,
        fontSize: 10,
        lineHeight: 18,
        fontWeight: '900',
        textAlign: 'center',
        includeFontPadding: false
    },
    fab: {
        ...shadows.button,
        position: 'absolute',
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md
    },
    fabPressed: {
        opacity: 0.9,
        transform: [{ translateY: 1 }]
    },
    fabHover: {
        opacity: 0.94
    },
    fabFocus: {
        borderColor: colors.onPrimary,
        borderWidth: 2
    },
    fabCompact: {
        width: 56,
        height: 56,
        paddingHorizontal: 0,
        paddingVertical: 0
    },
    fabLabel: {
        color: colors.onPrimary,
        fontSize: 15,
        fontWeight: '800'
    }
    });
}
