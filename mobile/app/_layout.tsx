import 'react-native-gesture-handler';
import React from 'react';
import { Slot } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/auth/AuthContext';
import { useNativePushRegistration } from '../src/hooks/useNativePushRegistration';
import { colors } from '../src/theme';

const queryClient = new QueryClient();

const NativeRuntimeHooks: React.FC = () => {
    useNativePushRegistration();
    return null;
};

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <NativeRuntimeHooks />
                    <StatusBar style="dark" backgroundColor={colors.surface} />
                    <Slot />
                </AuthProvider>
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}
