import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { UserClientPayload } from '@calibrate/api-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../src/components/AppText';
import { LoadingState } from '../../src/components/LoadingState';
import { useAuth } from '../../src/auth/AuthContext';
import { LogDateProvider } from '../../src/context/LogDateContext';
import { useLogDateNavigation } from '../../src/hooks/useLogDateNavigation';
import { isProfileSetupComplete } from '../../src/utils/profileCompletion';
import { colors, radius, spacing } from '../../src/theme';

const HIDDEN_TAB_OPTIONS = {
    href: null
} as const;

const TAB_BAR_BASE_HEIGHT = 64; // Bottom tab height before Android gesture/navigation safe-area padding.

export default function TabsLayout() {
    const { api, user, isLoading } = useAuth();
    const insets = useSafeAreaInsets();
    const logDateNavigation = useLogDateNavigation();
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
                        paddingHorizontal: spacing.xxl
                    },
                    tabBarLabelStyle: { fontWeight: '800' },
                    headerStyle: { backgroundColor: colors.surface },
                    headerShadowVisible: true,
                    headerTintColor: colors.text,
                    headerTitleAlign: 'center',
                    headerLeftContainerStyle: { width: 104 },
                    headerRightContainerStyle: { paddingRight: spacing.xs },
                    headerLeft: () => <HeaderBrand />,
                    headerRight: () => (
                        <HeaderActions user={user} unreadCount={notificationsQuery.data?.unread_count ?? 0} />
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

const HeaderBrand: React.FC = () => (
    <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go to log"
        onPress={() => router.push('/(tabs)/today')}
        style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
    >
        <AppText numberOfLines={1} style={styles.brandText}>calibrate</AppText>
    </Pressable>
);

function getAvatarLabel(email?: string | null): string {
    return email?.trim().charAt(0).toUpperCase() || 'C';
}

const HeaderActions: React.FC<{ user: UserClientPayload | null; unreadCount: number }> = ({ user, unreadCount }) => (
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
            accessibilityLabel="Open settings"
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
            {user?.profile_image_url ? (
                <Image source={{ uri: user.profile_image_url }} style={styles.avatarImage} />
            ) : (
                <View style={styles.avatarFallback}>
                    <AppText style={styles.avatarText}>{getAvatarLabel(user?.email)}</AppText>
                </View>
            )}
        </Pressable>
    </View>
);

const styles = StyleSheet.create({
    brand: {
        width: 96,
        minHeight: 40,
        justifyContent: 'center',
        paddingLeft: spacing.sm,
        paddingRight: spacing.xs,
        borderRadius: radius.md
    },
    brandText: {
        color: colors.text,
        fontSize: 19,
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
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center'
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
        backgroundColor: colors.danger,
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
    avatarImage: {
        width: 30,
        height: 30,
        borderRadius: 15
    },
    avatarFallback: {
        width: 30,
        height: 30,
        borderRadius: 15,
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
