import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { InAppNotification } from '@calibrate/api-client';
import { IN_APP_NOTIFICATION_TYPES } from '@calibrate/shared/inAppNotifications';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { SkeletonBlock } from '../src/components/SkeletonBlock';
import { useAuth } from '../src/auth/AuthContext';
import { colors, radius, spacing } from '../src/theme';

type NotificationRoute = '/(tabs)/log' | '/(tabs)/weight' | '/(tabs)/today' | '/(tabs)/progress';

function getNotificationAction(notification: InAppNotification): { label: string; route: NotificationRoute } {
    if (notification.action_url.includes('weight')) {
        return { label: 'Log weight', route: '/(tabs)/weight' };
    }
    if (notification.action_url.includes('goal')) {
        return { label: 'Open goals', route: '/(tabs)/progress' };
    }
    if (notification.action_url.includes('log') || notification.action_url.includes('food')) {
        return { label: 'Log food', route: '/(tabs)/log' };
    }
    return { label: 'Open log', route: '/(tabs)/today' };
}

function getNotificationText(notification: InAppNotification): { title: string; body: string } {
    const title = notification.title?.trim();
    const body = notification.body?.trim();
    if (title && body) return { title, body };

    switch (notification.type) {
        case IN_APP_NOTIFICATION_TYPES.LOG_WEIGHT_REMINDER:
            return {
                title: title || 'Log weight',
                body: body || 'Add today\'s weigh-in to keep your trend current.'
            };
        case IN_APP_NOTIFICATION_TYPES.LOG_FOOD_REMINDER:
            return {
                title: title || 'Finish food log',
                body: body || 'Log today\'s food or mark the day complete.'
            };
        default:
            return {
                title: title || 'calibrate',
                body: body || 'Open Calibrate to review this reminder.'
            };
    }
}

function formatNotificationDate(value: string): string {
    const [yearString, monthString, dayString] = value.split('-');
    const date = new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export default function NotificationsScreen() {
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
            router.push(getNotificationAction(notification).route);
        }
    });

    const notifications = notificationsQuery.data?.notifications ?? [];
    const unreadCount = notificationsQuery.data?.unread_count ?? 0;

    return (
        <Screen safeTop>
            <View style={styles.header}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                >
                    <Ionicons name="chevron-back" size={22} color={colors.text} />
                </Pressable>
                <View style={styles.headerText}>
                    <AppText variant="screenTitle">Notifications</AppText>
                    <AppText variant="caption">{unreadCount} unread</AppText>
                </View>
            </View>

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

            {notifications.map((notification) => {
                const action = getNotificationAction(notification);
                const text = getNotificationText(notification);
                const isUnread = !notification.read_at;

                return (
                    <AppCard key={notification.id} style={[styles.notificationCard, isUnread && styles.unreadCard]}>
                        <View style={styles.notificationRow}>
                            <View style={[styles.iconTile, isUnread && styles.iconTileUnread]}>
                                <Ionicons
                                    name={isUnread ? 'notifications' : 'notifications-outline'}
                                    size={20}
                                    color={isUnread ? colors.primaryDark : colors.muted}
                                />
                            </View>
                            <View style={styles.notificationBody}>
                                <View style={styles.titleRow}>
                                    <AppText variant="subtitle" numberOfLines={2} style={styles.notificationTitle}>
                                        {text.title}
                                    </AppText>
                                    {isUnread && <View style={styles.unreadDot} />}
                                </View>
                                <AppText variant="caption">{formatNotificationDate(notification.local_date)}</AppText>
                                <AppText variant="muted">{text.body}</AppText>
                            </View>
                        </View>
                        <View style={styles.actions}>
                            <AppButton
                                title={action.label}
                                leftIcon={<Ionicons name="open-outline" size={18} color="#ffffff" />}
                                onPress={() => markRead.mutate(notification)}
                                style={styles.actionButton}
                            />
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Dismiss ${text.title}`}
                                onPress={() => dismissNotification.mutate(notification.id)}
                                style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
                            >
                                <Ionicons name="close" size={18} color={colors.muted} />
                            </Pressable>
                        </View>
                    </AppCard>
                );
            })}

            {!notificationsQuery.isLoading && notifications.length === 0 && (
                <AppCard>
                    <SectionHeader title="No notifications" description="Reminder notifications will appear here." />
                </AppCard>
            )}

            {notificationsQuery.error && <AppText style={styles.error}>{notificationsQuery.error.message}</AppText>}
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    headerButton: {
        width: 44,
        height: 44,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface
    },
    headerText: {
        flex: 1,
        minWidth: 0
    },
    notificationCard: {
        gap: spacing.md
    },
    unreadCard: {
        borderColor: colors.primary
    },
    notificationRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md
    },
    iconTile: {
        width: 42,
        height: 42,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt
    },
    iconTileUnread: {
        backgroundColor: colors.primarySoft
    },
    notificationBody: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    notificationTitle: {
        flex: 1,
        minWidth: 0
    },
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.primary
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionButton: {
        flex: 1
    },
    dismissButton: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
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
    pressed: {
        opacity: 0.82
    },
    error: {
        color: colors.danger
    }
});
