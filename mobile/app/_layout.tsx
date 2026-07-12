import 'react-native-gesture-handler';
import React from 'react';
import { Slot } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { NativePushRegistrationProvider } from '../src/hooks/useNativePushRegistration';
import { useNotificationTapRouting } from '../src/notifications/useNotificationTapRouting';
import { createQueuedMutationExecutor } from '../src/offline/operations';
import { OfflineOutboxProvider } from '../src/offline/provider';
import { colors } from '../src/theme';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { HealthConnectProvider } from '../src/healthConnect/provider';
import { useWearHandoffRouting } from '../src/wear/useWearHandoffRouting';

const queryClient = new QueryClient();

const NativeRuntimeHooks: React.FC = () => {
    const { user, serverUrl } = useAuth();
    useNotificationTapRouting(Boolean(user));
    useWearHandoffRouting({
        enabled: Boolean(user && serverUrl),
        serverOrigin: serverUrl,
        userId: user?.id ?? null
    });
    return null;
};

const AuthenticatedRuntime: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { api } = useAuth();
    const executeMutation = React.useMemo(() => createQueuedMutationExecutor(api), [api]);
    return (
        <OfflineOutboxProvider executeMutation={executeMutation}>
            <HealthConnectProvider>{children}</HealthConnectProvider>
        </OfflineOutboxProvider>
    );
};

export default function RootLayout() {
    return (
        <AppErrorBoundary>
            <SafeAreaProvider>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <NativePushRegistrationProvider>
                            <AuthenticatedRuntime>
                                <NativeRuntimeHooks />
                                <StatusBar style="dark" backgroundColor={colors.surface} />
                                <Slot />
                            </AuthenticatedRuntime>
                        </NativePushRegistrationProvider>
                    </AuthProvider>
                </QueryClientProvider>
            </SafeAreaProvider>
        </AppErrorBoundary>
    );
}
