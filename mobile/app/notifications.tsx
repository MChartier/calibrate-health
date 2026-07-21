import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { InAppNotification } from '@calibrate/api-client';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { NotificationCard } from '../src/components/NotificationCard';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { SkeletonBlock } from '../src/components/SkeletonBlock';
import { useAuth } from '../src/auth/AuthContext';
import { getNotificationAction } from '../src/notifications/workflow';
import { spacing, useAppTheme, type AppTheme } from '../src/theme';

export default function NotificationsScreen() {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const notificationsQuery = useQuery({
        queryKey: ['mobile-in-app-notifications'],
        queryFn: () => api.getInAppNotifications()
    });

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
    const unreadCount = notificationsQuery.data?.unread_count ?? 0;

    return (
        <Screen safeTop>
            <PageHeader
                title="Notifications"
                description={`${unreadCount} unread`}
                onBack={() => router.back()}
            />

            {notificationsQuery.isLoading && (
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

            {notifications.map((notification) => (
                <NotificationCard
                    key={notification.id}
                    notification={notification}
                    isBusy={markRead.isPending || dismissNotification.isPending}
                    onOpen={(item) => markRead.mutate(item)}
                    onDismiss={(item) => dismissNotification.mutate(item.id)}
                />
            ))}

            {!notificationsQuery.isLoading && notifications.length === 0 && (
                <AppCard>
                    <SectionHeader title="No notifications" description="Reminder notifications will appear here." />
                </AppCard>
            )}

            {(notificationsQuery.error || markRead.error || dismissNotification.error) && (
                <AppCard>
                    <AppText accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
                        {notificationsQuery.error?.message ?? markRead.error?.message ?? dismissNotification.error?.message}
                    </AppText>
                    {notificationsQuery.error && (
                        <AppButton
                            title="Try notifications again"
                            variant="secondary"
                            accessibilityHint="Reloads the notification list from your Calibrate server."
                            onPress={() => void notificationsQuery.refetch()}
                        />
                    )}
                </AppCard>
            )}
        </Screen>
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
