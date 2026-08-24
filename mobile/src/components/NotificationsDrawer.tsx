import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { InAppNotification } from '@calibrate/api-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPPORTED_MODAL_ORIENTATIONS } from '../layout/adaptiveLayout';
import { AppCard } from './AppCard';
import { AppButton } from './AppButton';
import { AppIconButton } from './AppIconButton';
import { AppText } from './AppText';
import { NotificationCard } from './NotificationCard';
import { SkeletonBlock } from './SkeletonBlock';
import { AsyncStateBoundary } from './AsyncStateBoundary';
import type { AsyncResourceState } from '../asyncState/resolveAsyncState';
import { getSafeActionErrorMessage } from '../errors/presentation';
import { useReducedMotionPreference } from '../hooks/useReducedMotionPreference';
import { useModalFocusManagement } from '../hooks/useModalFocusManagement';
import { ACTIVE_NOTIFICATION_LIMIT } from '../notifications/query';
import { spacing, useAppTheme, type AppTheme } from '../theme';

const DRAWER_WIDTH_FRACTION = 0.9;
const DRAWER_MAX_WIDTH = 440;
const DRAWER_ENTER_DURATION_MS = 240;
const DRAWER_EXIT_DURATION_MS = 180;

export function notificationDrawerWidth(windowWidth: number): number {
    return Math.min(windowWidth * DRAWER_WIDTH_FRACTION, DRAWER_MAX_WIDTH);
}

type NotificationsDrawerProps = {
    visible: boolean;
    notifications: InAppNotification[];
    unreadCount: number | null;
    state: AsyncResourceState;
    isBusy: boolean;
    actionError?: unknown;
    onClose: () => void;
    onOpenNotification: (notification: InAppNotification) => void;
    onDismissNotification: (notification: InAppNotification) => void;
    onViewAll: () => void;
    onRetry?: () => void;
};

/** Keeps notification review in the app shell until the user chooses a destination. */
export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
    visible,
    notifications,
    unreadCount,
    state,
    isBusy,
    actionError,
    onClose,
    onOpenNotification,
    onDismissNotification,
    onViewAll,
    onRetry
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const reduceMotion = useReducedMotionPreference();
    const availableWidth = Math.max(0, windowWidth - insets.left - insets.right);
    const drawerWidth = notificationDrawerWidth(availableWidth);
    const [shouldRender, setShouldRender] = useState(visible);
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const drawerProgress = useRef(new Animated.Value(1)).current;
    const panelRef = useRef<View>(null);

    useModalFocusManagement({
        visible: shouldRender && visible,
        containerRef: panelRef,
        onEscape: onClose
    });

    useEffect(() => {
        if (visible) setShouldRender(true);
    }, [visible]);

    useEffect(() => {
        if (!shouldRender) return;

        if (visible) {
            backdropOpacity.setValue(0);
            drawerProgress.setValue(1);
        }

        let duration = 0;
        if (!reduceMotion) {
            duration = visible ? DRAWER_ENTER_DURATION_MS : DRAWER_EXIT_DURATION_MS;
        }

        const animation = Animated.parallel([
            Animated.timing(backdropOpacity, {
                toValue: visible ? 1 : 0,
                duration,
                easing: visible ? Easing.out(Easing.ease) : Easing.in(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(drawerProgress, {
                toValue: visible ? 0 : 1,
                duration,
                easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
                useNativeDriver: true
            })
        ]);
        animation.start(({ finished }) => {
            if (finished && !visible) setShouldRender(false);
        });
        return () => animation.stop();
    }, [backdropOpacity, drawerProgress, reduceMotion, shouldRender, visible]);

    if (!shouldRender) return null;

    const translateX = drawerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, drawerWidth + insets.right]
    });

    return (
        <Modal
            visible
            transparent
            animationType="none"
            presentationStyle="overFullScreen"
            statusBarTranslucent
            onRequestClose={onClose}
            supportedOrientations={SUPPORTED_MODAL_ORIENTATIONS}
        >
            <View style={styles.root}>
                <Pressable
                    testID="notifications-drawer-backdrop"
                    accessible={false}
                    focusable={false}
                    importantForAccessibility="no-hide-descendants"
                    aria-hidden
                    onPress={onClose}
                    style={StyleSheet.absoluteFill}
                >
                    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
                </Pressable>
                <Animated.View
                    ref={panelRef}
                    testID="notifications-drawer-panel"
                    accessibilityLabel="Notifications"
                    accessibilityViewIsModal
                    aria-label="Notifications"
                    aria-modal
                    role="dialog"
                    style={[
                        styles.panel,
                        {
                            paddingTop: Math.max(insets.top, spacing.md),
                            width: drawerWidth,
                            marginRight: insets.right,
                            paddingBottom: Math.max(insets.bottom, spacing.md),
                            transform: [{ translateX }]
                        }
                    ]}
                >
                    <View style={styles.header}>
                        <View style={styles.headerText}>
                            <AppText accessibilityRole="header" aria-level={2} variant="screenTitle">
                                Notifications
                            </AppText>
                            <AppText variant="caption">
                                {unreadCount === null ? 'Unread count unavailable' : `${unreadCount} unread`}
                            </AppText>
                        </View>
                        <AppIconButton
                            icon="close"
                            accessibilityLabel="Close notifications"
                            variant="ghost"
                            onPress={onClose}
                        />
                    </View>

                    <ScrollView
                        testID="notifications-drawer-list"
                        contentContainerStyle={styles.content}
                        keyboardShouldPersistTaps="handled"
                    >
                        <AsyncStateBoundary
                            state={state}
                            resourceLabel="notifications"
                            loading={<NotificationsSkeleton styles={styles} />}
                            empty={(
                                <AppCard>
                                    <AppText variant="subtitle">All caught up</AppText>
                                    <AppText variant="muted">Reminder notifications will appear here.</AppText>
                                </AppCard>
                            )}
                            onRetry={onRetry}
                        >
                            {notifications.slice(0, ACTIVE_NOTIFICATION_LIMIT).map((notification) => (
                                <NotificationCard
                                    key={notification.id}
                                    notification={notification}
                                    isBusy={isBusy}
                                    onOpen={onOpenNotification}
                                    onDismiss={onDismissNotification}
                                />
                            ))}
                        </AsyncStateBoundary>

                        {actionError != null && (
                            <AppCard accessibilityRole="alert">
                                <AppText style={styles.error}>
                                    {getSafeActionErrorMessage(
                                        actionError,
                                        'Unable to update that notification. Try again.'
                                    )}
                                </AppText>
                            </AppCard>
                        )}

                        <AppButton
                            testID="view-all-notifications"
                            title="View all notifications"
                            variant="secondary"
                            onPress={onViewAll}
                        />
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
};

const NotificationsSkeleton: React.FC<{ styles: ReturnType<typeof createStyles> }> = ({ styles }) => (
    <AppCard>
        {[0, 1, 2].map((row) => (
            <View key={row} style={styles.skeletonRow}>
                <SkeletonBlock width={40} height={40} radius={20} />
                <View style={styles.skeletonText}>
                    <SkeletonBlock width="64%" height={18} />
                    <SkeletonBlock width="90%" height={14} />
                </View>
            </View>
        ))}
    </AppCard>
);

const createStyles = (theme: AppTheme) => StyleSheet.create({
    root: {
        flex: 1,
        alignItems: 'flex-end'
    },
    backdrop: {
        flex: 1,
        backgroundColor: theme.colors.scrim
    },
    panel: {
        ...theme.shadows.raised,
        height: '100%',
        backgroundColor: theme.colors.surfaceContainerLow,
        borderLeftColor: theme.colors.outlineVariant,
        borderLeftWidth: StyleSheet.hairlineWidth
    },
    header: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        borderBottomColor: theme.colors.outlineVariant,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    headerText: {
        flex: 1,
        minWidth: 0
    },
    content: {
        gap: spacing.md,
        padding: spacing.lg
    },
    skeletonRow: {
        minHeight: 54,
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
