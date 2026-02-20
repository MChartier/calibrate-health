import React, { useMemo } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Drawer,
    List,
    ListItem,
    Stack,
    Typography
} from '@mui/material';
import type { Translate } from '../i18n/i18nContext';
import { useI18n } from '../i18n/useI18n';
import type { InAppNotification } from '../queries/inAppNotifications';
import { IN_APP_NOTIFICATION_TYPES } from '../../../shared/inAppNotifications';

const PANEL_WIDTH_PX = { xs: '100%', sm: 420 } as const; // Keep the panel readable on desktop while remaining full-width on small screens.
const PANEL_PADDING = 2;
const PANEL_ITEM_GAP = 1;

type InAppNotificationsDrawerProps = {
    open: boolean;
    notifications: InAppNotification[];
    unreadCount: number;
    isLoading: boolean;
    isError: boolean;
    isOpeningNotification: boolean;
    dismissingNotificationId: number | null;
    onClose: () => void;
    onRetry: () => void;
    onOpenNotification: (notification: InAppNotification) => void;
    onDismissNotification: (notification: InAppNotification) => void;
};

type NotificationCopy = {
    title: string;
    body: string;
    actionLabel: string;
};

const resolveCustomCopy = (notification: InAppNotification, t: Translate): NotificationCopy | null => {
    const customTitle = notification.title?.trim();
    const customBody = notification.body?.trim();
    if (!customTitle && !customBody) {
        return null;
    }

    return {
        title: customTitle || t('notifications.default.title'),
        body: customBody || t('notifications.default.body'),
        actionLabel: t('notifications.default.action')
    };
};

const getNotificationCopy = (notification: InAppNotification, t: Translate): NotificationCopy => {
    const customCopy = resolveCustomCopy(notification, t);
    if (customCopy) {
        return customCopy;
    }

    switch (notification.type) {
        case IN_APP_NOTIFICATION_TYPES.LOG_WEIGHT_REMINDER:
            return {
                title: t('notifications.logWeight.title'),
                body: t('notifications.logWeight.body'),
                actionLabel: t('notifications.logWeight.action')
            };
        case IN_APP_NOTIFICATION_TYPES.LOG_FOOD_REMINDER:
            return {
                title: t('notifications.logFood.title'),
                body: t('notifications.logFood.body'),
                actionLabel: t('notifications.logFood.action')
            };
        default:
            return {
                title: t('notifications.default.title'),
                body: t('notifications.default.body'),
                actionLabel: t('notifications.default.action')
            };
    }
};

const formatTimestamp = (isoTimestamp: string): string => {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
};

const InAppNotificationsDrawer: React.FC<InAppNotificationsDrawerProps> = ({
    open,
    notifications,
    unreadCount,
    isLoading,
    isError,
    isOpeningNotification,
    dismissingNotificationId,
    onClose,
    onRetry,
    onOpenNotification,
    onDismissNotification
}) => {
    const { t } = useI18n();

    const notificationRows = useMemo(
        () =>
            notifications.map((notification) => ({
                notification,
                copy: getNotificationCopy(notification, t),
                timestamp: formatTimestamp(notification.created_at)
            })),
        [notifications, t]
    );

    let bodyContent: React.ReactNode;
    if (isLoading && notificationRows.length === 0) {
        bodyContent = (
            <Stack sx={{ py: 4, alignItems: 'center' }}>
                <CircularProgress size={24} />
            </Stack>
        );
    } else if (isError && notificationRows.length === 0) {
        bodyContent = (
            <Alert
                severity="error"
                action={
                    <Button color="inherit" size="small" onClick={onRetry}>
                        {t('common.retry')}
                    </Button>
                }
            >
                {t('notifications.loadFailed')}
            </Alert>
        );
    } else if (notificationRows.length === 0) {
        bodyContent = (
            <Typography variant="body2" color="text.secondary">
                {t('notifications.empty')}
            </Typography>
        );
    } else {
        bodyContent = (
            <List disablePadding>
                {notificationRows.map(({ notification, copy, timestamp }) => {
                    const isDismissing = dismissingNotificationId === notification.id;
                    const openDisabled = isOpeningNotification || isDismissing;
                    const dismissDisabled = isDismissing || isOpeningNotification;

                    return (
                        <ListItem
                            key={notification.id}
                            sx={{
                                px: 0,
                                pt: 0,
                                pb: PANEL_ITEM_GAP,
                                alignItems: 'stretch'
                            }}
                        >
                            <Stack
                                spacing={1}
                                sx={{
                                    width: '100%',
                                    border: (theme) => `1px solid ${theme.palette.divider}`,
                                    borderRadius: 1,
                                    p: 1.5,
                                    opacity: 1
                                }}
                            >
                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                    <Typography variant="subtitle2">{copy.title}</Typography>
                                    <Stack direction="row" spacing={0.75} alignItems="center">
                                        <Chip size="small" label={t('notifications.unreadBadge')} />
                                        {timestamp ? (
                                            <Typography variant="caption" color="text.secondary">
                                                {timestamp}
                                            </Typography>
                                        ) : null}
                                    </Stack>
                                </Stack>

                                <Typography variant="body2" color="text.secondary">
                                    {copy.body}
                                </Typography>

                                <Stack direction="row" spacing={1}>
                                    <Button
                                        size="small"
                                        variant="contained"
                                        disabled={openDisabled}
                                        onClick={() => onOpenNotification(notification)}
                                    >
                                        {copy.actionLabel}
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="text"
                                        disabled={dismissDisabled}
                                        onClick={() => onDismissNotification(notification)}
                                    >
                                        {t('notifications.dismissAction')}
                                    </Button>
                                </Stack>
                            </Stack>
                        </ListItem>
                    );
                })}
            </List>
        );
    }

    return (
        <Drawer anchor="right" open={open} onClose={onClose}>
            <Box sx={{ width: PANEL_WIDTH_PX, px: PANEL_PADDING, py: PANEL_PADDING }}>
                <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="h6">{t('notifications.panelTitle')}</Typography>
                        <Chip
                            size="small"
                            color={unreadCount > 0 ? 'primary' : 'default'}
                            label={t('notifications.unreadCountLabel', { count: unreadCount })}
                        />
                    </Stack>
                    <Divider />
                    {bodyContent}
                </Stack>
            </Box>
        </Drawer>
    );
};

export default InAppNotificationsDrawer;
