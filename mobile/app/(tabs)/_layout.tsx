import React from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Redirect, router, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { UserClientPayload } from '@calibrate/api-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../src/components/AppText';
import { CalibrateLogo } from '../../src/components/CalibrateLogo';
import { LoadingState } from '../../src/components/LoadingState';
import { useAuth } from '../../src/auth/AuthContext';
import { LogDateProvider } from '../../src/context/LogDateContext';
import { useLogDateNavigation } from '../../src/hooks/useLogDateNavigation';
import { useOfflineOutbox } from '../../src/offline/provider';
import { OUTBOX_MUTATION_STATES } from '../../src/offline/queuedMutation';
import { isProfileSetupComplete } from '../../src/utils/profileCompletion';
import { colors, radius, spacing } from '../../src/theme';

const HIDDEN_TAB_OPTIONS = {
    href: null
} as const;

const TAB_BAR_BASE_HEIGHT = 58; // Bottom tab height before Android gesture/navigation safe-area padding.
const HEADER_ACCOUNT_GAP = 2; // Keeps the avatar affordance compact while still showing a menu chevron.
const HEADER_ROW_HEIGHT = 48; // Custom app chrome height after the Android status bar safe area.
const HEADER_TITLE_SIDE_OFFSET = 136; // Reserves space for brand and account actions around a centered route title.
const HEADER_WORDMARK_MIN_WIDTH = 350; // Below this, keep the brand mark but hide the wordmark to protect action/title space.

export default function TabsLayout() {
    const { api, user, isLoading } = useAuth();
    const insets = useSafeAreaInsets();
    const logDateNavigation = useLogDateNavigation();
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

    return (
        <LogDateProvider value={logDateNavigation}>
            <Tabs
                screenOptions={{
                    tabBarActiveTintColor: colors.primary,
                    tabBarInactiveTintColor: colors.muted,
                    tabBarStyle: {
                        backgroundColor: colors.surface,
                        borderTopColor: colors.border,
                        height: TAB_BAR_BASE_HEIGHT + insets.bottom,
                        paddingBottom: Math.max(insets.bottom, spacing.sm),
                        paddingTop: spacing.xs,
                        paddingHorizontal: spacing.xl
                    },
                    tabBarLabelStyle: { fontWeight: '800' },
                    header: ({ options }) => (
                        <TabHeader
                            topInset={insets.top}
                            title={typeof options.headerTitle === 'string' ? options.headerTitle : ''}
                            user={user}
                            unreadCount={notificationsQuery.data?.unread_count ?? 0}
                            offlineChangeCount={queuedMutations.length}
                            hasFailedOfflineChanges={hasFailedOfflineChanges}
                        />
                    )
                }}
            >
                <Tabs.Screen
                    name="today"
                    options={{
                        title: 'Log',
                        headerTitle: '',
                        tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" color={color} size={size} />
                    }}
                />
                <Tabs.Screen
                    name="progress"
                    options={{
                        title: 'Goals',
                        headerTitle: '',
                        tabBarIcon: ({ color, size }) => <Ionicons name="analytics-outline" color={color} size={size} />
                    }}
                />
                <Tabs.Screen name="log" options={{ ...HIDDEN_TAB_OPTIONS, title: 'Add food' }} />
                <Tabs.Screen name="weight" options={{ ...HIDDEN_TAB_OPTIONS, title: 'Log weight' }} />
                <Tabs.Screen name="goals" options={HIDDEN_TAB_OPTIONS} />
                <Tabs.Screen name="settings" options={{ ...HIDDEN_TAB_OPTIONS, title: 'Account' }} />
            </Tabs>
        </LogDateProvider>
    );
}

const TabHeader: React.FC<{
    topInset: number;
    title: string;
    user: UserClientPayload | null;
    unreadCount: number;
    offlineChangeCount: number;
    hasFailedOfflineChanges: boolean;
}> = ({ topInset, title, user, unreadCount, offlineChangeCount, hasFailedOfflineChanges }) => (
    <View style={[styles.headerRoot, { paddingTop: topInset }]}>
        <View style={styles.headerRow}>
            <HeaderBrand />
            {title.length > 0 && (
                <View pointerEvents="none" style={styles.headerTitle}>
                    <AppText numberOfLines={1} style={styles.headerTitleText}>{title}</AppText>
                </View>
            )}
            <HeaderActions
                user={user}
                unreadCount={unreadCount}
                offlineChangeCount={offlineChangeCount}
                hasFailedOfflineChanges={hasFailedOfflineChanges}
            />
        </View>
    </View>
);

const HeaderBrand: React.FC = () => {
    const { width } = useWindowDimensions();
    const showWordmark = width >= HEADER_WORDMARK_MIN_WIDTH;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to log"
            onPress={() => router.push('/(tabs)/today')}
            style={({ pressed }) => [
                styles.brand,
                !showWordmark && styles.brandIconOnly,
                pressed && styles.pressed
            ]}
        >
            <CalibrateLogo size={32} />
            {showWordmark && (
                <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.brandText}>
                    calibrate
                </AppText>
            )}
        </Pressable>
    );
};

function getAvatarLabel(email?: string | null): string {
    return email?.trim().charAt(0).toUpperCase() || 'C';
}

const HeaderActions: React.FC<{
    user: UserClientPayload | null;
    unreadCount: number;
    offlineChangeCount: number;
    hasFailedOfflineChanges: boolean;
}> = ({ user, unreadCount, offlineChangeCount, hasFailedOfflineChanges }) => (
    <View style={styles.headerActions}>
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
            <Ionicons name="notifications-outline" size={21} color={colors.text} />
            {unreadCount > 0 && (
                <View style={styles.badge}>
                    <AppText style={styles.badgeText}>{Math.min(unreadCount, 99)}</AppText>
                </View>
            )}
        </Pressable>
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={
                offlineChangeCount > 0
                    ? `Open settings, ${offlineChangeCount} offline changes ${hasFailedOfflineChanges ? 'need attention' : 'pending'}`
                    : 'Open settings'
            }
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => [styles.accountButton, pressed && styles.pressed]}
        >
            {user?.profile_image_url ? (
                <Image source={{ uri: user.profile_image_url }} style={styles.avatarImage} />
            ) : (
                <View style={styles.avatarFallback}>
                    <AppText style={styles.avatarText}>{getAvatarLabel(user?.email)}</AppText>
                </View>
            )}
            {offlineChangeCount > 0 && (
                <View
                    accessibilityElementsHidden
                    style={[styles.syncBadge, hasFailedOfflineChanges && styles.syncBadgeFailed]}
                />
            )}
            <Ionicons name="chevron-down" size={13} color={colors.muted} />
        </Pressable>
    </View>
);

const styles = StyleSheet.create({
    headerRoot: {
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    headerRow: {
        height: HEADER_ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md
    },
    headerTitle: {
        position: 'absolute',
        left: HEADER_TITLE_SIDE_OFFSET,
        right: HEADER_TITLE_SIDE_OFFSET,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center'
    },
    headerTitleText: {
        color: colors.text,
        fontSize: 20,
        fontWeight: '900'
    },
    brand: {
        minWidth: 126,
        maxWidth: 160,
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingLeft: spacing.xs,
        paddingRight: spacing.xs,
        borderRadius: radius.md
    },
    brandIconOnly: {
        minWidth: 42,
        maxWidth: 42
    },
    brandText: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 0
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingRight: spacing.sm
    },
    headerButton: {
        width: 36,
        height: 36,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center'
    },
    accountButton: {
        width: 50,
        height: 36,
        borderRadius: radius.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: HEADER_ACCOUNT_GAP
    },
    pressed: {
        backgroundColor: colors.surfaceAlt
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
        color: '#ffffff',
        fontSize: 10,
        lineHeight: 18,
        fontWeight: '900',
        textAlign: 'center',
        includeFontPadding: false
    },
    syncBadge: {
        position: 'absolute',
        top: 2,
        left: 2,
        width: 9,
        height: 9,
        borderRadius: radius.pill,
        backgroundColor: colors.warning,
        borderColor: colors.surface,
        borderWidth: 1
    },
    syncBadgeFailed: {
        backgroundColor: colors.danger
    },
    avatarImage: {
        width: 28,
        height: 28,
        borderRadius: 14
    },
    avatarFallback: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    avatarText: {
        color: colors.primaryDark,
        fontSize: 13,
        fontWeight: '900'
    }
});
