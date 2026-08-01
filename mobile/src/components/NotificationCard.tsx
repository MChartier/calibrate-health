import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { InAppNotification } from '@calibrate/api-client';
import { formatNotificationDate, getNotificationText } from '../notifications/presentation';
import { getNotificationAction } from '../notifications/workflow';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppIconButton } from './AppIconButton';
import { AppText } from './AppText';

type NotificationCardProps = {
    notification: InAppNotification;
    isBusy?: boolean;
    onOpen: (notification: InAppNotification) => void;
    onDismiss: (notification: InAppNotification) => void;
};

/** Shared reminder presentation for the lightweight drawer and deep-linkable route. */
export const NotificationCard: React.FC<NotificationCardProps> = ({
    notification,
    isBusy = false,
    onOpen,
    onDismiss
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const action = getNotificationAction(notification.action_url, notification.local_date);
    const text = getNotificationText(notification);
    const isUnread = !notification.read_at;

    return (
        <AppCard style={[styles.card, isUnread && styles.unreadCard]}>
            <View style={styles.row}>
                <View style={[styles.iconTile, isUnread && styles.iconTileUnread]}>
                    <Ionicons
                        name={isUnread ? 'notifications' : 'notifications-outline'}
                        size={20}
                        color={isUnread ? theme.colors.primary : theme.colors.onSurfaceVariant}
                    />
                </View>
                <View style={styles.body}>
                    <View style={styles.titleRow}>
                        <AppText variant="subtitle" numberOfLines={2} style={styles.title}>
                            {text.title}
                        </AppText>
                        {isUnread ? <View style={styles.unreadDot} /> : null}
                    </View>
                    <AppText variant="caption">{formatNotificationDate(notification.local_date)}</AppText>
                    <AppText variant="muted">{text.body}</AppText>
                </View>
            </View>
            <View style={styles.actions}>
                <AppButton
                    title={action.label}
                    accessibilityHint="Marks this reminder read and opens its Calibrate destination."
                    disabled={isBusy}
                    leftIcon={<Ionicons name="open-outline" size={18} color={theme.colors.onPrimary} />}
                    onPress={() => onOpen(notification)}
                    style={styles.actionButton}
                />
                <AppIconButton
                    icon="close"
                    accessibilityLabel={`Dismiss ${text.title}`}
                    disabled={isBusy}
                    iconColor={theme.colors.onSurfaceVariant}
                    onPress={() => onDismiss(notification)}
                />
            </View>
        </AppCard>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    card: {
        gap: spacing.md
    },
    unreadCard: {
        borderColor: theme.colors.primary
    },
    row: {
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
        backgroundColor: theme.colors.surfaceContainer
    },
    iconTileUnread: {
        backgroundColor: theme.colors.primaryContainer
    },
    body: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    title: {
        flex: 1,
        minWidth: 0
    },
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: radius.pill,
        backgroundColor: theme.colors.primary
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionButton: {
        flex: 1
    }
});
