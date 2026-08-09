import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { InAppNotification } from '@calibrate/api-client';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../../src/components/AsyncStateBoundary';
import { NotificationCard } from '../../src/components/NotificationCard';
import { SectionHeader } from '../../src/components/SectionHeader';
import { SkeletonBlock } from '../../src/components/SkeletonBlock';
import { TabScreen } from '../../src/components/TabScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { getNotificationAction } from '../../src/notifications/workflow';
import { spacing, useAppTheme, type AppTheme } from '../../src/theme';
import { getSafeActionErrorMessage } from '../../src/errors/presentation';

export default function NotificationsScreen() {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const notificationsQuery = useQuery({
        queryKey: ['mobile-in-app-notifications'],
        queryFn: () => api.getInAppNotifications()
    });
    const isOnline = useOnlineStatus();
    const notificationsState = useAsyncResourceState(
        notificationsQuery,
        (data) => data.notifications.length === 0
    );

    const dismissNotification = useMutation({
        mutationFn: (id: number) => api.dismissInAppNotification(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] })
    });

    const markRead = useMutation({
        mutationFn: (notification: InAppNotification) => api.markInAppNotificationRead(notification.id).then(() => notification),
        onSuccess: async (notification) => {
            await queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] });
            router.push(getNotificationAction(notification.action_url, notification.local_date).href as Href);
        }
    });

    const notifications = notificationsQuery.data?.notifications ?? [];

    return (
        <TabScreen>
            <AsyncStateBoundary
                state={notificationsState}
                resourceLabel="notifications"
                loading={(
                    <AppCard>
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
                )}
                empty={(
                    <AppCard>
                        <SectionHeader title="No notifications" description="Reminder notifications will appear here." />
                    </AppCard>
                )}
                onRetry={isOnline ? () => notificationsQuery.refetch() : undefined}
                retrying={notificationsQuery.isFetching}
            >
                <>
                    {notifications.map((notification) => (
                        <NotificationCard
                            key={notification.id}
                            notification={notification}
                            isBusy={markRead.isPending || dismissNotification.isPending}
                            onOpen={(item) => markRead.mutate(item)}
                            onDismiss={(item) => dismissNotification.mutate(item.id)}
                        />
                    ))}
                </>
            </AsyncStateBoundary>

            {(markRead.error || dismissNotification.error) && (
                <AppCard>
                    <AppText accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
                        {markRead.error
                            ? getSafeActionErrorMessage(markRead.error, 'Unable to open this notification.')
                            : getSafeActionErrorMessage(dismissNotification.error, 'Unable to dismiss this notification.')}
                    </AppText>
                </AppCard>
            )}
        </TabScreen>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
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
    error: {
        color: theme.colors.danger
    }
});
