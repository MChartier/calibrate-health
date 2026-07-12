import React from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { LoadingState } from '../../src/components/LoadingState';
import { useAuth } from '../../src/auth/AuthContext';

export default function AuthLayout() {
    const { user, isLoading, accountDeletionCleanupNotice } = useAuth();
    const segments = useSegments();

    if (isLoading) {
        return <LoadingState />;
    }

    if (user) {
        return <Redirect href="/(tabs)/today" />;
    }

    if (accountDeletionCleanupNotice && segments[0] !== 'login') {
        return <Redirect href="/(auth)/login" />;
    }

    return <Stack screenOptions={{ headerShown: false }} />;
}
