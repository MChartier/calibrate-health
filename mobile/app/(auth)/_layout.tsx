import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '../../src/components/LoadingState';
import { useAuth } from '../../src/auth/AuthContext';

export default function AuthLayout() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState />;
    }

    if (user) {
        return <Redirect href="/(tabs)/today" />;
    }

    return <Stack screenOptions={{ headerShown: false }} />;
}
