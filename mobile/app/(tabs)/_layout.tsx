import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState } from '../../src/components/LoadingState';
import { useAuth } from '../../src/auth/AuthContext';
import { colors } from '../../src/theme';

export default function TabsLayout() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState />;
    }

    if (!user) {
        return <Redirect href="/(auth)/login" />;
    }

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: colors.primary,
                headerStyle: { backgroundColor: colors.surface },
                headerTitleStyle: { fontWeight: '800' }
            }}
        >
            <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" color={color} size={size} /> }} />
            <Tabs.Screen name="log" options={{ title: 'Food', tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" color={color} size={size} /> }} />
            <Tabs.Screen name="weight" options={{ title: 'Weight', tabBarIcon: ({ color, size }) => <Ionicons name="scale-outline" color={color} size={size} /> }} />
            <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: ({ color, size }) => <Ionicons name="trending-down-outline" color={color} size={size} /> }} />
            <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }} />
        </Tabs>
    );
}
