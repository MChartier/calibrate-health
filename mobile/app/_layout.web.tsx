import 'react-native-gesture-handler';
import React from 'react';
import { Slot } from 'expo-router';
import Head from 'expo-router/head';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { NativePushRegistrationProvider } from '../src/hooks/useNativePushRegistration';
import { createQueuedMutationExecutor } from '../src/offline/operations';
import { OfflineOutboxProvider } from '../src/offline/provider';
import { useAppTheme } from '../src/theme';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { HealthConnectProvider } from '../src/healthConnect/provider';
import { PwaStatusBanner } from '../src/pwa/PwaStatusBanner.web';
import { useBrowserNotificationStream } from '../src/notifications/useBrowserNotificationStream.web';

const queryClient = new QueryClient();

const WebSkipLink: React.FC = () => {
    const theme = useAppTheme();
    const [isFocused, setIsFocused] = React.useState(false);
    const style: React.CSSProperties = {
        position: 'fixed',
        top: 8,
        left: 8,
        zIndex: 10000,
        minHeight: 48,
        padding: '10px 16px',
        border: `2px solid ${theme.colors.onPrimary}`,
        borderRadius: theme.radius.md,
        background: theme.colors.primary,
        color: theme.colors.onPrimary,
        font: '600 16px/24px system-ui, sans-serif',
        cursor: 'pointer',
        transform: isFocused ? 'translateY(0)' : 'translateY(calc(-100% - 16px))',
        transition: 'transform 120ms ease',
        boxShadow: isFocused ? `0 0 0 3px ${theme.colors.primaryContainer}` : 'none'
    };

    function focusMainContent() {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('[role="main"]'));
        const activeMain = candidates.find((candidate) => candidate.getClientRects().length > 0);
        activeMain?.focus({ preventScroll: true });
        activeMain?.scrollIntoView({ block: 'start' });
    }

    return (
        <button
            type="button"
            style={style}
            onBlur={() => setIsFocused(false)}
            onClick={focusMainContent}
            onFocus={() => setIsFocused(true)}
        >
            Skip to main content
        </button>
    );
};

/** Web keeps native-only notification, Health Connect, and Wear runtime hooks out of startup. */
const BrowserRuntime: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { api, serverUrl, user } = useAuth();
    const queryClient = useQueryClient();
    const executeMutation = React.useMemo(() => createQueuedMutationExecutor(api), [api]);
    useBrowserNotificationStream({ enabled: Boolean(user), serverUrl, queryClient });
    return (
        <OfflineOutboxProvider executeMutation={executeMutation}>
            <HealthConnectProvider>{children}</HealthConnectProvider>
        </OfflineOutboxProvider>
    );
};

export default function RootLayout() {
    const theme = useAppTheme();

    React.useEffect(() => {
        const previousRootBackground = document.documentElement.style.backgroundColor;
        const previousBodyBackground = document.body.style.backgroundColor;
        const previousColorScheme = document.documentElement.style.colorScheme;
        const previousBodyMargin = document.body.style.margin;
        const previousBodyOverflow = document.body.style.overflowX;

        document.documentElement.style.backgroundColor = theme.colors.background;
        document.documentElement.style.colorScheme = theme.mode;
        document.body.style.backgroundColor = theme.colors.background;
        document.body.style.margin = '0';
        document.body.style.overflowX = 'hidden';

        return () => {
            document.documentElement.style.backgroundColor = previousRootBackground;
            document.documentElement.style.colorScheme = previousColorScheme;
            document.body.style.backgroundColor = previousBodyBackground;
            document.body.style.margin = previousBodyMargin;
            document.body.style.overflowX = previousBodyOverflow;
        };
    }, [theme]);

    return (
        <AppErrorBoundary>
            <WebSkipLink />
            <PwaStatusBanner />
            <SafeAreaProvider>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <NativePushRegistrationProvider>
                            <BrowserRuntime>
                                <StatusBar style={theme.dark ? 'light' : 'dark'} />
                                <Head>
                                    <title>calibrate</title>
                                </Head>
                                <Slot />
                            </BrowserRuntime>
                        </NativePushRegistrationProvider>
                    </AuthProvider>
                </QueryClientProvider>
            </SafeAreaProvider>
        </AppErrorBoundary>
    );
}
