import React from 'react';
import { Redirect } from 'expo-router';
import { LoadingState } from '../src/components/LoadingState';
import { useAuth } from '../src/auth/AuthContext';

export default function IndexRoute() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState label="Preparing calibrate..." />;
    }

    return <Redirect href={user ? '/(tabs)/today' : '/(auth)/login'} />;
}
