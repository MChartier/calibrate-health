import 'react-native-gesture-handler';
import React from 'react';
import { Slot } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { useNativePushRegistration } from '../src/hooks/useNativePushRegistration';
import { createQueuedMutationExecutor } from '../src/offline/operations';
import { OfflineOutboxProvider } from '../src/offline/provider';
import { colors } from '../src/theme';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';

const queryClient = new QueryClient();

const NativeRuntimeHooks: React.FC = () => {
    useNativePushRegistration();
    return null;
};

const AuthenticatedRuntime: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { api } = useAuth();
    const executeMutation = React.useMemo(() => createQueuedMutationExecutor(api), [api]);
    return <OfflineOutboxProvider executeMutation={executeMutation}>{children}</OfflineOutboxProvider>;
};

export default function RootLayout() {
    return (
        <AppErrorBoundary>
            <SafeAreaProvider>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <AuthenticatedRuntime>
                            <NativeRuntimeHooks />
                            <StatusBar style="dark" backgroundColor={colors.surface} />
                            <Slot />
                        </AuthenticatedRuntime>
                    </AuthProvider>
                </QueryClientProvider>
            </SafeAreaProvider>
        </AppErrorBoundary>
    );
}
