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
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../../src/components/AsyncStateBoundary';
import { CalibrateLogo } from '../../src/components/CalibrateLogo';
import { LoadingState } from '../../src/components/LoadingState';
import { NotificationsDrawer } from '../../src/components/NotificationsDrawer';
import { ResumeTrackingPrompt, useFoodDayStatus } from '../../src/components/FoodTrackingStatus';
import { useAuth } from '../../src/auth/AuthContext';
import { hasFullAccountAccess, restrictedAccountRoute } from '../../src/auth/accountAccess';
import { LogDateProvider } from '../../src/context/LogDateContext';
import {
    AddFoodRequestProvider,
    type AddFoodRequest,
    type AddFoodRequestInput
} from '../../src/context/AddFoodRequestContext';
import { useLogDateNavigation } from '../../src/hooks/useLogDateNavigation';
import { useOfflineOutbox } from '../../src/offline/provider';
import { OUTBOX_MUTATION_STATES } from '../../src/offline/queuedMutation';
import { resolveContextualFab } from '../../src/navigation/contextualFab';
import { GuardedTabButton } from '../../src/navigation/GuardedTabButton';
import { requestGuardedNavigation } from '../../src/navigation/guardedNavigation';
import {
    canonicalPathForRoute,
    getRouteByPath,
    getRouteFallback,
    isRouteActive,
    type RouteId
} from '../../src/navigation/routeRegistry';
import { getRouteBackLabel, hasBrowserHistorySinceMount } from '../../src/navigation/routePresentation';
import { getNotificationAction } from '../../src/notifications/workflow';
import {
    ACTIVE_NOTIFICATION_LIMIT,
    activeNotificationQueryKey,
    invalidateNotificationQueries,
    reconcileNotificationDismissed,
    reconcileNotificationRead
} from '../../src/notifications/query';
import { isProfileSetupComplete } from '../../src/utils/profileCompletion';
import { ASYNC_RESOURCE_STATES, isNeverEmpty } from '../../src/asyncState/resolveAsyncState';
import {
    NAVIGATION_RAIL_BREAKPOINT,
    resolveSafeHorizontalPadding
} from '../../src/layout/adaptiveLayout';
import { radius, spacing, useAppTheme, type AppTheme, type AppThemeColors } from '../../src/theme';

const HIDDEN_TAB_OPTIONS = {
    href: null
} as const;

const TAB_BAR_CONTENT_HEIGHT = 56; // Keeps the UIKit icon, label, and built-in item padding from clipping.
const TAB_BAR_VERTICAL_PADDING = spacing.sm; // Separates tab content from both bar edges before safe-area padding.
const TAB_BAR_BASE_HEIGHT = TAB_BAR_CONTENT_HEIGHT + (TAB_BAR_VERTICAL_PADDING * 2);
const HEADER_ROW_MIN_HEIGHT = 56; // Standard compact native app-bar height before large-text expansion.
const LARGE_TEXT_HEIGHT_INCREMENT = 18; // Adds vertical room as the device font scale grows toward 200%.
const DESKTOP_NAV_RAIL_WIDTH = 176;
const DESKTOP_CONTENT_MAX_WIDTH = 1040;
const QUERY_GATE_MAX_WIDTH = 640; // Keeps terminal shell errors readable on wide screens.

function navigateBackFromRoute(
    routeId: RouteId,
    history: { router: boolean; browser: boolean }
) {
    if (history.router) {
        router.back();
        return;
    }
    if (history.browser && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.back();
        return;
    }

    const fallback = getRouteFallback(routeId);
    router.replace((fallback?.path ?? canonicalPathForRoute('today')) as Href);
}

function getNotificationsAccessibilityLabel(unreadCount: number | null): string {
    if (unreadCount === null) return 'Open notifications, unread count unavailable';
    if (unreadCount > 0) return `Open notifications, ${unreadCount} unread`;
    return 'Open notifications';
}

type NavigationPressableProps = PressableProps & {
    focusStyle: StyleProp<ViewStyle>;
    hoverStyle?: StyleProp<ViewStyle>;
};

/** Adds explicit keyboard focus and pointer-hover feedback to shell actions. */
const NavigationPressable: React.FC<NavigationPressableProps> = ({
    disabled,
    focusStyle,
    focusable = true,
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
            disabled={disabled}
            focusable={focusable && !disabled}
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
                !disabled && isHovered && hoverStyle,
                !disabled && isFocused && focusStyle
            ]}
        />
    );
};

export default function TabsLayout() {
    const { api, user, isLoading } = useAuth();
    const hasFullAccess = hasFullAccountAccess(user);
    const queryClient = useQueryClient();
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme.colors, theme.shadows), [theme]);
    const isOnline = useOnlineStatus();
    const insets = useSafeAreaInsets();
    const { fontScale, width } = useWindowDimensions();
    const pathname = usePathname();
    const initialBrowserHistoryLength = React.useRef(
        Platform.OS === 'web' && typeof window !== 'undefined' ? window.history.length : 0
    );
    const routerCanGoBack = router.canGoBack();
    const browserCanGoBack = Platform.OS === 'web'
        && typeof window !== 'undefined'
        && hasBrowserHistorySinceMount(initialBrowserHistoryLength.current, window.history.length);
    const canNavigateBack = routerCanGoBack || browserCanGoBack;
    const activeRoute = getRouteByPath(pathname);
    const usesNavigationRail = width >= NAVIGATION_RAIL_BREAKPOINT;
    const logDateNavigation = useLogDateNavigation();
    const selectedFoodDayQuery = useFoodDayStatus(logDateNavigation.selectedDate, Boolean(user && hasFullAccess));
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
        enabled: Boolean(user && hasFullAccess)
    });
    const notificationsQuery = useQuery({
        queryKey: activeNotificationQueryKey,
        queryFn: () => api.getInAppNotifications({
            view: 'active',
            limit: ACTIVE_NOTIFICATION_LIMIT
        }),
        enabled: Boolean(user && hasFullAccess)
    });
    const profileState = useAsyncResourceState(profileQuery, isNeverEmpty);
    const notificationsState = useAsyncResourceState(
        notificationsQuery,
        ({ notifications }) => notifications.length === 0
    );
    const dismissNotification = useMutation({
        mutationFn: async (notification: InAppNotification) => {
            await api.dismissInAppNotification(notification.id);
            return notification;
        },
        onSuccess: async (notification) => {
            reconcileNotificationDismissed(queryClient, notification.id);
            await invalidateNotificationQueries(queryClient);
        }
    });
    const openNotification = useMutation({
        mutationFn: async (notification: InAppNotification) => {
            await api.markInAppNotificationRead(notification.id);
            return notification;
        },
        onSuccess: async (notification) => {
            reconcileNotificationRead(queryClient, notification.id);
            await invalidateNotificationQueries(queryClient);
            requestGuardedNavigation(() => {
                setIsNotificationDrawerOpen(false);
                router.push(getNotificationAction(notification.action_url, notification.local_date).href as Href);
            });
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

    const accountAccessRoute = restrictedAccountRoute(user);
    if (accountAccessRoute) {
        return <Redirect href={accountAccessRoute} />;
    }

    if (profileState.kind === ASYNC_RESOURCE_STATES.LOADING) {
        return <LoadingState label="Checking setup..." />;
    }

    if (profileState.kind === ASYNC_RESOURCE_STATES.ERROR) {
        return (
            <View style={styles.queryGate}>
                <View style={styles.queryGateContent}>
                    <AsyncStateBoundary
                        state={profileState}
                        resourceLabel="your profile"
                        loading={<LoadingState label="Checking setup..." />}
                        empty={null}
                        onRetry={isOnline ? () => profileQuery.refetch() : undefined}
                    >
                        {null}
                    </AsyncStateBoundary>
                </View>
            </View>
        );
    }

    if (profileQuery.data && !isProfileSetupComplete(profileQuery.data)) {
        return <Redirect href="/onboarding" />;
    }

    const notificationsAvailable = notificationsState.kind !== ASYNC_RESOURCE_STATES.LOADING
        && notificationsState.kind !== ASYNC_RESOURCE_STATES.ERROR;
    const notifications = notificationsAvailable ? notificationsQuery.data?.notifications ?? [] : [];
    const unreadCount = notificationsAvailable ? notificationsQuery.data?.unread_count ?? null : null;

    const tabBarHeight = TAB_BAR_BASE_HEIGHT
        + Math.round(Math.max(0, Math.min(fontScale, 2) - 1) * LARGE_TEXT_HEIGHT_INCREMENT)
        + insets.bottom;
    const desktopContentGutter = Math.max(
        spacing.xl,
        (width - DESKTOP_NAV_RAIL_WIDTH - DESKTOP_CONTENT_MAX_WIDTH) / 2 + spacing.xl
    );
    const bottomTabHorizontalPadding = resolveSafeHorizontalPadding(
        spacing.md,
        insets.left,
        insets.right,
        spacing.sm
    );
    const navigationRailHorizontalPadding = resolveSafeHorizontalPadding(
        spacing.sm,
        insets.left,
        0,
        spacing.sm
    );
    const shellNoticeHorizontalPadding = resolveSafeHorizontalPadding(
        spacing.lg,
        insets.left,
        insets.right,
        spacing.sm
    );
    const fabKind = resolveContextualFab({
        pathname,
        foodDayStatus: selectedFoodDayQuery.data?.status,
        foodDayStatusLoaded: selectedFoodDayQuery.isSuccess
    });

    return (
        <LogDateProvider value={logDateNavigation}>
            <AddFoodRequestProvider value={addFoodRequestContext}>
                <View style={styles.shell}>
                    {(profileState.kind === ASYNC_RESOURCE_STATES.STALE
                        || profileState.kind === ASYNC_RESOURCE_STATES.DEGRADED) && (
                        <View style={[styles.shellNotice, shellNoticeHorizontalPadding]}>
                            <AsyncStateBoundary
                                state={profileState}
                                resourceLabel="your profile"
                                loading={null}
                                empty={null}
                                onRetry={isOnline ? () => profileQuery.refetch() : undefined}
                            >
                                {null}
                            </AsyncStateBoundary>
                        </View>
                    )}
                    <Tabs
                        backBehavior="history"
                        screenOptions={{
                            tabBarPosition: usesNavigationRail ? 'left' : 'bottom',
                            tabBarVariant: usesNavigationRail ? 'material' : 'uikit',
                            tabBarLabelPosition: 'below-icon',
                            tabBarActiveTintColor: usesNavigationRail
                                ? theme.colors.onPrimaryContainer
                                : theme.colors.primary,
                            tabBarInactiveTintColor: theme.colors.muted,
                            tabBarActiveBackgroundColor: usesNavigationRail ? theme.colors.primaryContainer : undefined,
                            tabBarHideOnKeyboard: true,
                            tabBarStyle: usesNavigationRail
                                ? [styles.navigationRail, {
                                    paddingTop: Math.max(insets.top, spacing.lg),
                                    paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm),
                                    ...navigationRailHorizontalPadding
                                }]
                                : {
                                    backgroundColor: theme.colors.surface,
                                    borderTopColor: theme.colors.border,
                                    height: tabBarHeight,
                                    paddingBottom: insets.bottom + TAB_BAR_VERTICAL_PADDING,
                                    paddingTop: TAB_BAR_VERTICAL_PADDING,
                                    ...bottomTabHorizontalPadding
                                },
                            tabBarItemStyle: [styles.tabBarItem, usesNavigationRail && styles.navigationRailItem],
                            tabBarLabelStyle: styles.tabBarLabel,
                            header: ({ options }) => {
                                const routeTitle = activeRoute?.definition.title
                                    ?? (typeof options.headerTitle === 'string' ? options.headerTitle : 'Calibrate');
                                const backLabel = getRouteBackLabel(pathname, canNavigateBack);
                                return (
                                    <TabHeader
                                        topInset={insets.top}
                                        leftInset={usesNavigationRail ? 0 : insets.left}
                                        rightInset={insets.right}
                                        fontScale={fontScale}
                                        title={routeTitle}
                                        backAction={backLabel && activeRoute ? {
                                            label: backLabel,
                                            onPress: () => requestGuardedNavigation(() => navigateBackFromRoute(activeRoute.routeId, {
                                                router: routerCanGoBack,
                                                browser: browserCanGoBack
                                            }))
                                        } : undefined}
                                        unreadCount={unreadCount}
                                        offlineChangeCount={queuedMutations.length}
                                        hasFailedOfflineChanges={hasFailedOfflineChanges}
                                        profileImageUrl={user.profile_image_url}
                                        onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
                                        colors={theme.colors}
                                        styles={styles}
                                        desktop={usesNavigationRail}
                                        isTodayRoute={isRouteActive(pathname, 'today')}
                                    />
                                );
                            }
                        }}
                    >
                        <Tabs.Screen
                            name="(today)"
                            options={{
                                tabBarButton: (props) => (
                                    <GuardedTabButton {...props} href={canonicalPathForRoute('today') as Href} />
                                ),
                                title: 'Today',
                                headerTitle: 'Today',
                                tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" color={color} size={size} />
                            }}
                        />
                        <Tabs.Screen
                            name="(progress)"
                            options={{
                                tabBarButton: (props) => (
                                    <GuardedTabButton {...props} href={canonicalPathForRoute('progress') as Href} />
                                ),
                                title: 'Progress',
                                headerTitle: 'Progress',
                                tabBarIcon: ({ color, size }) => <Ionicons name="analytics-outline" color={color} size={size} />
                            }}
                        />
                        <Tabs.Screen
                            name="(settings)"
                            options={{
                                ...HIDDEN_TAB_OPTIONS,
                                title: 'Settings',
                                headerTitle: 'Settings'
                            }}
                        />
                    </Tabs>
                    <NotificationsDrawer
                        visible={isNotificationDrawerOpen}
                        notifications={notifications}
                        unreadCount={unreadCount}
                        state={notificationsState}
                        isBusy={dismissNotification.isPending || openNotification.isPending}
                        actionError={dismissNotification.error ?? openNotification.error}
                        onClose={() => setIsNotificationDrawerOpen(false)}
                        onOpenNotification={(notification) => openNotification.mutate(notification)}
                        onDismissNotification={(notification) => dismissNotification.mutate(notification)}
                        onViewAll={() => requestGuardedNavigation(() => {
                            setIsNotificationDrawerOpen(false);
                            router.push(canonicalPathForRoute('notifications') as Href);
                        })}
                        onRetry={isOnline ? () => notificationsQuery.refetch() : undefined}
                    />
                    <ResumeTrackingPrompt />
                    {fabKind && (
                        <ContextualFab
                            bottom={usesNavigationRail ? spacing.xxl : tabBarHeight + spacing.lg}
                            right={usesNavigationRail
                                ? Math.max(desktopContentGutter, insets.right + spacing.md)
                                : Math.max(spacing.xl, insets.right + spacing.md)}
                            compact={fontScale >= 1.6 || width < 360}
                            colors={theme.colors}
                            styles={styles}
                            onPress={() => {
                                if (selectedFoodDayQuery.data?.status !== 'OPEN') return;
                                requestAddFood({ date: logDateNavigation.selectedDate });
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
    leftInset: number;
    rightInset: number;
    title: string;
    backAction?: { label: string; onPress: () => void };
    unreadCount: number | null;
    offlineChangeCount: number;
    hasFailedOfflineChanges: boolean;
    profileImageUrl: string | null;
    onOpenNotifications: () => void;
    colors: AppThemeColors;
    styles: TabStyles;
    desktop: boolean;
    isTodayRoute: boolean;
}> = ({ topInset, leftInset, rightInset, fontScale, title, backAction, unreadCount, offlineChangeCount, hasFailedOfflineChanges, profileImageUrl, onOpenNotifications, colors, styles, desktop, isTodayRoute }) => (
    <View role="banner" style={[styles.headerRoot, { paddingTop: topInset }]}>
        <View
            style={[
                styles.headerRow,
                desktop && styles.headerRowDesktop,
                {
                    minHeight: HEADER_ROW_MIN_HEIGHT + Math.round(Math.max(0, Math.min(fontScale, 2) - 1) * LARGE_TEXT_HEIGHT_INCREMENT),
                    paddingLeft: Math.max(desktop ? spacing.xl : spacing.lg, leftInset + spacing.sm),
                    paddingRight: Math.max(desktop ? spacing.xl : spacing.lg, rightInset + spacing.sm)
                }
            ]}
        >
            <View style={styles.headerLeading}>
                {backAction ? (
                    <NavigationPressable
                        accessibilityRole="button"
                        accessibilityLabel={backAction.label}
                        focusStyle={styles.navigationFocus}
                        hoverStyle={styles.navigationHover}
                        onPress={backAction.onPress}
                        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                    >
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </NavigationPressable>
                ) : (
                    <HeaderBrand styles={styles} isTodayRoute={isTodayRoute} />
                )}
                <AppText
                    accessibilityRole="header"
                    aria-level={1}
                    nativeID="route-focus-title"
                    numberOfLines={2}
                    style={styles.headerTitleText}
                >
                    {title}
                </AppText>
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

const HeaderBrand: React.FC<{ styles: TabStyles; isTodayRoute: boolean }> = ({ styles, isTodayRoute }) => (
    <NavigationPressable
        accessibilityRole={isTodayRoute ? undefined : 'button'}
        accessibilityLabel={isTodayRoute ? undefined : 'Go to Today'}
        accessibilityHint={isTodayRoute ? undefined : 'Opens the Today dashboard'}
        accessible={!isTodayRoute}
        disabled={isTodayRoute}
        focusStyle={styles.navigationFocus}
        hoverStyle={styles.navigationHover}
        onPress={() => requestGuardedNavigation(() => router.push(canonicalPathForRoute('today') as Href))}
        style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
    >
        <CalibrateLogo size={30} />
    </NavigationPressable>
);

const HeaderActions: React.FC<{
    unreadCount: number | null;
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
                focusStyle={styles.navigationFocus}
                hoverStyle={styles.navigationHover}
                onPress={() => requestGuardedNavigation(() => router.push(canonicalPathForRoute('settings-data') as Href))}
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
            testID="notifications-button"
            accessibilityRole="button"
            accessibilityLabel={getNotificationsAccessibilityLabel(unreadCount)}
            focusStyle={styles.navigationFocus}
            hoverStyle={styles.navigationHover}
            onPress={onOpenNotifications}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
            <Ionicons name="notifications-outline" size={21} color={colors.text} />
            {unreadCount !== null && unreadCount > 0 && (
                <View
                    testID="notifications-badge"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.badge}
                >
                    <AppText style={styles.badgeText}>{Math.min(unreadCount, 99)}</AppText>
                </View>
            )}
        </NavigationPressable>
        <NavigationPressable
            accessibilityRole="button"
            accessibilityLabel="Account & settings"
            accessibilityHint="Opens account details and app settings"
            focusStyle={styles.navigationFocus}
            hoverStyle={styles.navigationHover}
            onPress={() => requestGuardedNavigation(() => router.push(canonicalPathForRoute('settings') as Href))}
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
    bottom: number;
    right: number;
    compact: boolean;
    onPress: () => void;
    colors: AppThemeColors;
    styles: TabStyles;
}> = ({ bottom, right, compact, onPress, colors, styles }) => (
        <NavigationPressable
            accessibilityRole="button"
            accessibilityLabel="Add food"
            accessibilityHint="Opens food search for the selected day"
            focusStyle={styles.fabFocus}
            hoverStyle={styles.fabHover}
            onPress={onPress}
            style={({ pressed }) => [styles.fab, compact && styles.fabCompact, { bottom, right }, pressed && styles.fabPressed]}
        >
            <Ionicons name="add" size={24} color={colors.onPrimary} />
            {!compact && <AppText style={styles.fabLabel}>Add food</AppText>}
        </NavigationPressable>
);

type TabStyles = ReturnType<typeof createStyles>;

function createStyles(colors: AppThemeColors, shadows: AppTheme['shadows']) {
    return StyleSheet.create({
    shell: {
        flex: 1
    },
    queryGate: {
        alignItems: 'center',
        backgroundColor: colors.background,
        flex: 1,
        justifyContent: 'center',
        padding: spacing.lg
    },
    queryGateContent: {
        maxWidth: QUERY_GATE_MAX_WIDTH,
        width: '100%'
    },
    shellNotice: {
        alignSelf: 'center',
        maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        width: '100%'
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
        backgroundColor: colors.surfacePressed
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
