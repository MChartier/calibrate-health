import React from 'react';
import * as Crypto from 'expo-crypto';
import {
    DevSettings,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View
} from 'react-native';
import {
    reportClientDiagnostic,
    type ClientDiagnosticSignal
} from '../diagnostics/clientDiagnostics';
import { radius, spacing, themes, typography, type AppTheme } from '../theme';

type AppErrorBoundaryProps = {
    children: React.ReactNode;
    /** Override exists for deterministic tests and alternate native reload hosts. */
    restartApp?: () => void;
    /** Override exists for deterministic tests of the provider-independent emergency shell. */
    reportDiagnostic?: (signal: ClientDiagnosticSignal) => Promise<string | null>;
};

type AppErrorBoundaryState = {
    hasError: boolean;
    requestId: string | null;
    resetVersion: number;
};

const FALLBACK_MAX_WIDTH = 420; // Keeps recovery copy readable on tablets and unfolded devices.
const BRAND_MARK_SIZE = 52; // Gives the emergency shell a recognizable mark without loading SVG/native modules.
const ROOT_FAILURE_DIAGNOSTIC: ClientDiagnosticSignal = {
    event: 'client_failure',
    operation: 'root_render',
    route: 'app_shell',
    outcome: 'failure',
    duration_bucket: 'not_applicable'
};

/** Restart through the host that actually owns the current runtime. */
export function restartAppRuntime(
    platform = Platform.OS,
    reloadWeb = () => window.location.reload(),
    reloadNative = () => DevSettings.reload()
): void {
    if (platform === 'web') {
        reloadWeb();
        return;
    }
    reloadNative();
}

const defaultRestartApp = (): void => restartAppRuntime();

/**
 * Last-resort native shell for render and lifecycle failures below the app root.
 *
 * The fallback intentionally uses only React Native core primitives so it remains
 * available when navigation, providers, or feature components are what failed.
 */
export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = {
        hasError: false,
        requestId: null,
        resetVersion: 0
    };

    /** Resolve the derived state from error from the current validated state. */
    static getDerivedStateFromError(_error: unknown): Partial<AppErrorBoundaryState> {
        return { hasError: true, requestId: Crypto.randomUUID() };
    }

    /** Build component did catch from the supplied domain inputs. */
    componentDidCatch(_error: Error, _info: React.ErrorInfo): void {
        void this.reportRootFailure(this.state.resetVersion);
    }

    private reportRootFailure = async (resetVersion: number): Promise<void> => {
        const requestId = this.state.requestId;
        if (!requestId || this.state.resetVersion !== resetVersion) return;
        const reporter = this.props.reportDiagnostic ?? reportClientDiagnostic;
        try {
            await reporter({ ...ROOT_FAILURE_DIAGNOSTIC, request_id: requestId });
        } catch {
            // The local support reference remains useful when diagnostics cannot be delivered.
        }
    };

    private resetAppShell = (): void => {
        this.setState((state) => ({
            hasError: false,
            requestId: null,
            resetVersion: state.resetVersion + 1
        }));
    };

    private restartApp = (): void => {
        (this.props.restartApp ?? defaultRestartApp)();
    };

    /** Render using the supplied validated inputs. */
    render(): React.ReactNode {
        if (this.state.hasError) {
            const theme = themes.light;
            const styles = createStyles(theme);
            return (
                <View
                    testID="app-error-boundary"
                    style={styles.screen}
                    accessible
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                    accessibilityLabel="Calibrate encountered an unexpected error"
                >
                    <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
                    <View style={styles.card}>
                        <View style={styles.brandRow}>
                            <View
                                style={styles.brandMark}
                                accessibilityRole="image"
                                accessibilityLabel="Calibrate"
                            >
                                <Text style={styles.brandMarkText}>C</Text>
                            </View>
                            <Text style={styles.brandName}>calibrate</Text>
                        </View>

                        <Text accessibilityRole="header" aria-level={1} style={styles.title}>Calibrate hit a snag</Text>
                        <Text style={styles.description}>
                            Your saved data is safe. Try loading the app again, or restart Calibrate if the problem continues.
                        </Text>
                        {this.state.requestId ? (
                            <Text
                                testID="app-error-reference"
                                accessibilityLiveRegion="polite"
                                style={styles.reference}
                            >
                                Support reference: {this.state.requestId}. Include this reference when contacting Calibrate support.
                            </Text>
                        ) : null}
                        {__DEV__ ? (
                            <Text style={styles.developmentError} testID="app-error-detail">
                                Technical details are hidden to protect your privacy.
                            </Text>
                        ) : null}

                        <View style={styles.actions}>
                            <Pressable
                                testID="app-error-retry"
                                accessibilityRole="button"
                                accessibilityLabel="Try loading Calibrate again"
                                onPress={this.resetAppShell}
                                style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.pressed]}
                            >
                                <Text style={styles.primaryButtonLabel}>Try again</Text>
                            </Pressable>
                            <Pressable
                                testID="app-error-restart"
                                accessibilityRole="button"
                                accessibilityLabel="Restart Calibrate"
                                onPress={this.restartApp}
                                style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.pressed]}
                            >
                                <Text style={styles.secondaryButtonLabel}>Restart app</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            );
        }

        return <React.Fragment key={this.state.resetVersion}>{this.props.children}</React.Fragment>;
    }
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    screen: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
        padding: spacing.xxl
    },
    card: {
        width: '100%',
        maxWidth: FALLBACK_MAX_WIDTH,
        padding: spacing.xxl,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.outlineVariant,
        backgroundColor: theme.colors.surface,
        ...theme.shadows.card
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        marginBottom: spacing.xxl
    },
    brandMark: {
        width: BRAND_MARK_SIZE,
        height: BRAND_MARK_SIZE,
        borderRadius: BRAND_MARK_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary
    },
    brandMarkText: {
        color: theme.colors.onPrimary,
        fontSize: typography.title,
        fontWeight: '900'
    },
    brandName: {
        color: theme.colors.onSurface,
        fontSize: typography.screenTitle,
        fontWeight: '900'
    },
    title: {
        color: theme.colors.onSurface,
        fontSize: typography.title,
        fontWeight: '900',
        marginBottom: spacing.lg
    },
    description: {
        color: theme.colors.onSurfaceVariant,
        fontSize: typography.body,
        lineHeight: 21
    },
    reference: {
        color: theme.colors.onSurface,
        fontSize: typography.body,
        lineHeight: 21,
        marginTop: spacing.xl
    },
    developmentError: {
        color: theme.colors.onDangerContainer,
        fontSize: typography.caption,
        marginTop: spacing.xl
    },
    actions: {
        gap: spacing.lg,
        marginTop: spacing.xxl
    },
    button: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.lg
    },
    primaryButton: {
        backgroundColor: theme.colors.primary,
        ...theme.shadows.button
    },
    secondaryButton: {
        backgroundColor: theme.colors.surfaceContainer,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.outlineVariant
    },
    primaryButtonLabel: {
        color: theme.colors.onPrimary,
        fontSize: typography.body,
        fontWeight: '800'
    },
    secondaryButtonLabel: {
        color: theme.colors.onSurface,
        fontSize: typography.body,
        fontWeight: '800'
    },
    pressed: {
        opacity: 0.86,
        transform: [{ translateY: 1 }]
    }
});
