import 'react-native-gesture-handler';
import React from 'react';
import { Slot } from 'expo-router';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { hasFullAccountAccess } from '../src/auth/accountAccess';
import { NativePushRegistrationProvider } from '../src/hooks/useNativePushRegistration';
import { useNotificationTapRouting } from '../src/notifications/useNotificationTapRouting';
import { createQueuedMutationExecutor } from '../src/offline/operations';
import { OfflineOutboxProvider } from '../src/offline/provider';
import { invalidateQueriesAfterOfflineReplay } from '../src/offline/replayInvalidation';
import { useAppTheme } from '../src/theme';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { ClientUpgradeRequiredScreen } from '../src/components/ClientUpgradeRequiredScreen';
import { HealthConnectProvider } from '../src/healthConnect/provider';
import { useWearHandoffRouting } from '../src/wear/useWearHandoffRouting';
import { useWearSyncInvalidation } from '../src/wear/useWearSyncInvalidation';
import { useQueryOnlineManager } from '../src/connectivity/queryOnlineManager.native';

const queryClient = new QueryClient();

const NativeRuntimeHooks: React.FC = () => {
    const { user, serverUrl } = useAuth();
    const hasFullAccess = hasFullAccountAccess(user);
    useNotificationTapRouting(Boolean(user && hasFullAccess));
    useWearHandoffRouting({
        enabled: Boolean(user && hasFullAccess && serverUrl),
        serverOrigin: serverUrl,
        userId: user?.id ?? null
    });
    useWearSyncInvalidation();
    return null;
};

const ClientCompatibilityGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        clientUpgradeRequired,
        serverUrl,
        recheckClientCompatibility,
        clearLocalSession
    } = useAuth();
    if (clientUpgradeRequired) {
        return (
            <ClientUpgradeRequiredScreen
                requirement={clientUpgradeRequired}
                serverUrl={serverUrl}
                onRecheck={recheckClientCompatibility}
                onChooseServer={clearLocalSession}
            />
        );
    }
    return <>{children}</>;
};

const AuthenticatedRuntime: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { api } = useAuth();
    const runtimeQueryClient = useQueryClient();
    const executeMutation = React.useMemo(() => createQueuedMutationExecutor(api), [api]);
    const onReplayCompleted = React.useCallback(
        (result: Parameters<typeof invalidateQueriesAfterOfflineReplay>[1]) =>
            invalidateQueriesAfterOfflineReplay(runtimeQueryClient, result),
        [runtimeQueryClient]
    );
    return (
        <OfflineOutboxProvider executeMutation={executeMutation} onReplayCompleted={onReplayCompleted}>
            <HealthConnectProvider>{children}</HealthConnectProvider>
        </OfflineOutboxProvider>
    );
};

export default function RootLayout() {
    const theme = useAppTheme();
    useQueryOnlineManager();

    return (
        <AppErrorBoundary>
            <SafeAreaProvider>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <ClientCompatibilityGate>
                            <NativePushRegistrationProvider>
                                <AuthenticatedRuntime>
                                    <NativeRuntimeHooks />
                                    <StatusBar style={theme.dark ? 'light' : 'dark'} />
                                    <Slot />
                                </AuthenticatedRuntime>
                            </NativePushRegistrationProvider>
                        </ClientCompatibilityGate>
                    </AuthProvider>
                </QueryClientProvider>
            </SafeAreaProvider>
        </AppErrorBoundary>
    );
}
