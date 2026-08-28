import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { InAppNotification } from '@calibrate/api-client';
import { AppButton } from '../components/AppButton';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import {
    AsyncStateBoundary,
    useAsyncResourceState,
    useOnlineStatus
} from '../components/AsyncStateBoundary';
import { NotificationCard } from '../components/NotificationCard';
import { SectionHeader } from '../components/SectionHeader';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { TabScreen } from '../components/TabScreen';
import { useAuth } from '../auth/AuthContext';
import { getSafeActionErrorMessage } from '../errors/presentation';
import { useNativePushRegistration } from '../hooks/useNativePushRegistration';
import { canonicalPathForRoute } from '../navigation/routeRegistry';
import { spacing, useAppTheme, type AppTheme } from '../theme';
import {
    NOTIFICATION_HISTORY_PAGE_SIZE,
    dedupeNotificationPages,
    invalidateNotificationQueries,
    notificationHistoryQueryKey,
    reconcileAllNotificationsRead,
    reconcileNotificationDismissed,
    reconcileNotificationRead
} from './query';
import { getNotificationAction, getPushStatusPresentation, NATIVE_PUSH_STATES } from './workflow';
import { useClientQueryFailureDiagnostic } from '../diagnostics/operationDiagnostics';

type DeliveryAction = {
    label: string;
    run: () => Promise<void>;
};

export function NotificationHistory() {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const isOnline = useOnlineStatus();
    const pushRegistration = useNativePushRegistration();
    const isWeb = Platform.OS === 'web';
    const deliveryStatus = getPushStatusPresentation(pushRegistration.state, isWeb ? 'web' : 'android');

    const historyQuery = useInfiniteQuery({
        queryKey: notificationHistoryQueryKey,
        queryFn: ({ pageParam }) => api.getInAppNotifications({
            view: 'history',
            limit: NOTIFICATION_HISTORY_PAGE_SIZE,
            cursor: pageParam
        }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined
    });
    const historyState = useAsyncResourceState(historyQuery, (data) =>
        data.pages.every((page) => page.notifications.length === 0)
    );
    useClientQueryFailureDiagnostic({
        operation: 'notification_history_page',
        isError: historyQuery.isError || historyQuery.isFetchNextPageError,
        error: historyQuery.error,
        errorUpdatedAt: historyQuery.errorUpdatedAt
    });
    const notifications = dedupeNotificationPages(historyQuery.data?.pages);
    const unreadCount = historyQuery.data?.pages[0]?.unread_count ?? 0;

    const dismissNotification = useMutation({
        mutationFn: (notification: InAppNotification) =>
            api.dismissInAppNotification(notification.id).then(() => notification),
        onSuccess: async (notification) => {
            reconcileNotificationDismissed(queryClient, notification.id);
            await invalidateNotificationQueries(queryClient);
        }
    });
    const openNotification = useMutation({
        mutationFn: (notification: InAppNotification) =>
            api.markInAppNotificationRead(notification.id).then(() => notification),
        onSuccess: async (notification) => {
            reconcileNotificationRead(queryClient, notification.id);
            await invalidateNotificationQueries(queryClient);
            router.push(getNotificationAction(notification.action_url, notification.local_date).href as Href);
        }
    });
    const markAllRead = useMutation({
        mutationFn: () => api.markAllInAppNotificationsRead(),
        onSuccess: async () => {
            reconcileAllNotificationsRead(queryClient);
            await invalidateNotificationQueries(queryClient);
        }
    });

    let deliveryAction: DeliveryAction | null = null;
    if (deliveryStatus.action === 'request') {
        deliveryAction = { label: 'Enable push notifications', run: pushRegistration.requestPermission };
    } else if (deliveryStatus.action === 'settings') {
        deliveryAction = isWeb
            ? { label: 'Check notification access', run: pushRegistration.refreshPermission }
            : { label: 'Open Android settings', run: pushRegistration.openSettings };
    } else if (deliveryStatus.action === 'retry') {
        deliveryAction = { label: 'Retry push registration', run: pushRegistration.retryRegistration };
    }
    const showDeliveryStatus = pushRegistration.state !== NATIVE_PUSH_STATES.REGISTERED
        && pushRegistration.state !== NATIVE_PUSH_STATES.SIGNED_OUT;
    const actionError = openNotification.error ?? dismissNotification.error ?? markAllRead.error;
    const isMutating = openNotification.isPending || dismissNotification.isPending || markAllRead.isPending;
    const openPreferences = () => router.push(canonicalPathForRoute('settings-profile') as Href);

    return (
        <TabScreen testID="notification-history">
            <AppCard style={styles.headerCard}>
                <SectionHeader
                    title="Notification history"
                    description="Review reminder activity across this account."
                />
                <AppText variant="caption">
                    {unreadCount === 1 ? '1 unread notification' : `${unreadCount} unread notifications`}
                </AppText>
                <View style={styles.headerActions}>
                    <AppButton
                        testID="notification-mark-all-read"
                        title={markAllRead.isPending ? 'Marking all read...' : 'Mark all read'}
                        variant="secondary"
                        disabled={!isOnline || unreadCount === 0 || markAllRead.isPending}
                        onPress={() => markAllRead.mutate()}
                        style={styles.headerAction}
                    />
                    <AppButton
                        testID="notification-preferences-cta"
                        title="Notification preferences"
                        variant="ghost"
                        onPress={openPreferences}
                        style={styles.headerAction}
                    />
                </View>
            </AppCard>

            {showDeliveryStatus && (
                <AppCard
                    testID="notification-delivery-status"
                    accessibilityRole={deliveryStatus.isError ? 'alert' : undefined}
                    style={deliveryStatus.isError ? styles.errorCard : undefined}
                >
                    <AppText variant="subtitle">Notification delivery</AppText>
                    <AppText variant="muted">{deliveryStatus.message}</AppText>
                    {deliveryAction && (
                        <AppButton
                            testID="notification-delivery-action"
                            title={deliveryAction.label}
                            variant="secondary"
                            onPress={() => void deliveryAction?.run()}
                        />
                    )}
                </AppCard>
            )}

            <AsyncStateBoundary
                state={historyState}
                resourceLabel="notification history"
                loading={<NotificationHistorySkeleton styles={styles} />}
                empty={(
                    <AppCard testID="notification-history-empty">
                        <AppText variant="subtitle">No notification history yet</AppText>
                        <AppText variant="muted">
                            Enabled food and weight reminders will appear here after they are created.
                        </AppText>
                        <AppButton
                            title="Review notification preferences"
                            variant="secondary"
                            onPress={openPreferences}
                        />
                    </AppCard>
                )}
                onRetry={isOnline ? () => historyQuery.refetch() : undefined}
                retrying={historyQuery.isFetching}
            >
                <View testID="notification-history-list" style={styles.list}>
                    {notifications.map((notification) => (
                        <NotificationCard
                            key={notification.id}
                            notification={notification}
                            showHistoryState
                            isBusy={isMutating}
                            onOpen={(item) => openNotification.mutate(item)}
                            onDismiss={(item) => dismissNotification.mutate(item)}
                        />
                    ))}
                    {historyQuery.hasNextPage && (
                        <AppButton
                            testID="notification-history-load-more"
                            title={historyQuery.isFetchingNextPage ? 'Loading more...' : 'Load older notifications'}
                            variant="secondary"
                            disabled={!isOnline || historyQuery.isFetchingNextPage}
                            onPress={() => void historyQuery.fetchNextPage()}
                        />
                    )}
                </View>
            </AsyncStateBoundary>

            {actionError && (
                <AppCard accessibilityRole="alert" style={styles.errorCard}>
                    <AppText style={styles.errorText}>
                        {getSafeActionErrorMessage(actionError, 'Unable to update notification history. Try again.')}
                    </AppText>
                </AppCard>
            )}
        </TabScreen>
    );
}

function NotificationHistorySkeleton({ styles }: { styles: ReturnType<typeof createStyles> }) {
    return (
        <AppCard testID="notification-history-loading">
            {[0, 1, 2].map((row) => (
                <View key={row} style={styles.skeletonRow}>
                    <SkeletonBlock width={42} height={42} radius={21} />
                    <View style={styles.skeletonText}>
                        <SkeletonBlock width="68%" height={22} />
                        <SkeletonBlock width="88%" height={16} />
                    </View>
                </View>
            ))}
        </AppCard>
    );
}

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        headerCard: {
            gap: spacing.md
        },
        headerActions: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.sm
        },
        headerAction: {
            flexGrow: 1
        },
        list: {
            gap: spacing.md,
            width: '100%'
        },
        skeletonRow: {
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md
        },
        skeletonText: {
            flex: 1,
            gap: spacing.sm
        },
        errorCard: {
            borderColor: theme.colors.danger
        },
        errorText: {
            color: theme.colors.danger
        }
    });
}
