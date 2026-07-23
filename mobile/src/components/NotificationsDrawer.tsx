import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { InAppNotification } from '@calibrate/api-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppIconButton } from './AppIconButton';
import { AppText } from './AppText';
import { NotificationCard } from './NotificationCard';
import { SkeletonBlock } from './SkeletonBlock';
import { useReducedMotionPreference } from '../hooks/useReducedMotionPreference';
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
    unreadCount: number;
    isLoading: boolean;
    isBusy: boolean;
    errorMessage?: string | null;
    onClose: () => void;
    onOpenNotification: (notification: InAppNotification) => void;
    onDismissNotification: (notification: InAppNotification) => void;
    onRetry: () => void;
};

/** Keeps notification review in the app shell until the user chooses a destination. */
export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
    visible,
    notifications,
    unreadCount,
    isLoading,
    isBusy,
    errorMessage,
    onClose,
    onOpenNotification,
    onDismissNotification,
    onRetry
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const reduceMotion = useReducedMotionPreference();
    const [shouldRender, setShouldRender] = useState(visible);
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const drawerProgress = useRef(new Animated.Value(1)).current;

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
        outputRange: [0, notificationDrawerWidth(windowWidth)]
    });

    return (
        <Modal
            visible
            transparent
            animationType="none"
            presentationStyle="overFullScreen"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View style={styles.root}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close notifications drawer"
                    onPress={onClose}
                    style={StyleSheet.absoluteFill}
                >
                    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
                </Pressable>
                <Animated.View
                    testID="notifications-drawer-panel"
                    accessibilityViewIsModal
                    style={[
                        styles.panel,
                        {
                            paddingTop: Math.max(insets.top, spacing.md),
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
                            <AppText variant="caption">{unreadCount} unread</AppText>
                        </View>
                        <AppIconButton
                            icon="close"
                            accessibilityLabel="Close notifications"
                            variant="ghost"
                            onPress={onClose}
                        />
                    </View>

                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                        {isLoading && notifications.length === 0 && (
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
                        )}

                        {notifications.map((notification) => (
                            <NotificationCard
                                key={notification.id}
                                notification={notification}
                                isBusy={isBusy}
                                onOpen={onOpenNotification}
                                onDismiss={onDismissNotification}
                            />
                        ))}

                        {!isLoading && notifications.length === 0 && (
                            <AppCard>
                                <AppText variant="subtitle">All caught up</AppText>
                                <AppText variant="muted">Reminder notifications will appear here.</AppText>
                            </AppCard>
                        )}

                        {errorMessage && (
                            <AppCard>
                                <AppText accessibilityRole="alert" style={styles.error}>{errorMessage}</AppText>
                                <AppButton title="Try again" variant="secondary" onPress={onRetry} />
                            </AppCard>
                        )}
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
};

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
        width: '90%',
        maxWidth: 440,
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
