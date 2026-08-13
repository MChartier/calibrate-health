import 'react-native-gesture-handler';
import React from 'react';
import { Slot, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, View } from 'react-native';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { hasFullAccountAccess } from '../src/auth/accountAccess';
import { NativePushRegistrationProvider } from '../src/hooks/useNativePushRegistration';
import { createQueuedMutationExecutor } from '../src/offline/operations';
import { OfflineOutboxProvider } from '../src/offline/provider';
import { invalidateQueriesAfterOfflineReplay } from '../src/offline/replayInvalidation';
import { useAppTheme } from '../src/theme';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { HealthConnectProvider } from '../src/healthConnect/provider';
import { PwaStatusBanner } from '../src/pwa/PwaStatusBanner.web';
import { useBrowserNotificationStream } from '../src/notifications/useBrowserNotificationStream.web';
import { useVisualViewportHeight } from '../src/hooks/useVisualViewportHeight';
import { useQueryOnlineManager } from '../src/connectivity/queryOnlineManager.web';
import { resolveRouteMetadata } from '../src/navigation/routeMetadata';
import { scrubBrowserOneTimeTokenFromUrl } from '../src/auth/oneTimeToken';

const queryClient = new QueryClient();

const BrowserRoutePresentation: React.FC = () => {
    const pathname = usePathname();
    const { user } = useAuth();
    scrubBrowserOneTimeTokenFromUrl(pathname);
    const metadata = resolveRouteMetadata(pathname, { authenticated: Boolean(user) });

    React.useEffect(() => {
        document.title = metadata.title;
        function focusRouteTitle(): boolean {
            const title = document.getElementById('route-focus-title');
            if (!title) return false;
            title.tabIndex = -1;
            title.focus({ preventScroll: true });
            return true;
        }

        if (focusRouteTitle()) return undefined;

        let fallbackTimer: number | null = null;
        const observer = new MutationObserver(() => {
            if (!focusRouteTitle()) return;
            observer.disconnect();
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        fallbackTimer = window.setTimeout(() => {
            observer.disconnect();
            document.querySelector<HTMLElement>('[role="main"]')?.focus({ preventScroll: true });
        }, 5_000);
        return () => {
            observer.disconnect();
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        };
    }, [metadata.title, pathname]);

    return (
        <Head>
            <title>{metadata.title}</title>
            <meta name="description" content={metadata.description} />
            <meta name="robots" content={metadata.robots} />
            {metadata.canonicalPath ? <link rel="canonical" href={metadata.canonicalPath} /> : null}
        </Head>
    );
};

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
    const onReplayCompleted = React.useCallback(
        (result: Parameters<typeof invalidateQueriesAfterOfflineReplay>[1]) =>
            invalidateQueriesAfterOfflineReplay(queryClient, result),
        [queryClient]
    );
    useBrowserNotificationStream({ enabled: Boolean(user && hasFullAccountAccess(user)), serverUrl, queryClient });
    return (
        <OfflineOutboxProvider executeMutation={executeMutation} onReplayCompleted={onReplayCompleted}>
            <HealthConnectProvider>{children}</HealthConnectProvider>
        </OfflineOutboxProvider>
    );
};

/** Network status belongs to the whole web shell; update prompts wait until the user is signed in. */
const BrowserPwaStatus: React.FC = () => {
    const { user } = useAuth();
    return <PwaStatusBanner showUpdateNotices={Boolean(user)} hasCompactNavigation={Boolean(user)} />;
};

export default function RootLayout() {
    const theme = useAppTheme();
    useQueryOnlineManager();
    const visualViewportHeight = useVisualViewportHeight();

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
            <SafeAreaProvider>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <BrowserPwaStatus />
                        <NativePushRegistrationProvider>
                            <BrowserRuntime>
                                <StatusBar style={theme.dark ? 'light' : 'dark'} />
                                <BrowserRoutePresentation />
                                <View
                                    style={[
                                        styles.viewport,
                                        visualViewportHeight !== undefined && styles.visualViewport,
                                        { height: visualViewportHeight }
                                    ]}
                                >
                                    <Slot />
                                </View>
                            </BrowserRuntime>
                        </NativePushRegistrationProvider>
                    </AuthProvider>
                </QueryClientProvider>
            </SafeAreaProvider>
        </AppErrorBoundary>
    );
}

const styles = StyleSheet.create({
    viewport: {
        flex: 1,
        minHeight: 0
    },
    visualViewport: {
        // Preserve the measured viewport height instead of collapsing it to a zero flex basis.
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 'auto',
        width: '100%'
    }
});
