import React from 'react';
import {
    DevSettings,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { radius, spacing, typography, useAppTheme, type AppTheme } from '../theme';

type AppErrorBoundaryProps = {
    children: React.ReactNode;
    /** Override exists for deterministic tests and alternate native reload hosts. */
    restartApp?: () => void;
};

type AppErrorBoundaryState = {
    error: Error | null;
    resetVersion: number;
};

const FALLBACK_MAX_WIDTH = 420; // Keeps recovery copy readable on tablets and unfolded devices.
const BRAND_MARK_SIZE = 52; // Gives the emergency shell a recognizable mark without loading SVG/native modules.

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
type ThemedAppErrorBoundaryProps = AppErrorBoundaryProps & { theme: AppTheme };

class ThemedAppErrorBoundary extends React.Component<ThemedAppErrorBoundaryProps, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = {
        error: null,
        resetVersion: 0
    };

    static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
        return {
            error: error instanceof Error ? error : new Error('An unexpected error occurred.')
        };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        if (__DEV__) {
            console.error('[calibrate] Unhandled app render error', error, info.componentStack);
        }
    }

    private resetAppShell = (): void => {
        this.setState((state) => ({
            error: null,
            resetVersion: state.resetVersion + 1
        }));
    };

    private restartApp = (): void => {
        (this.props.restartApp ?? defaultRestartApp)();
    };

    render(): React.ReactNode {
        if (this.state.error) {
            const { theme } = this.props;
            const styles = createStyles(theme);
            return (
                <View
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
                        {__DEV__ ? (
                            <Text selectable style={styles.developmentError} testID="app-error-detail">
                                {this.state.error.message}
                            </Text>
                        ) : null}

                        <View style={styles.actions}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Try loading Calibrate again"
                                onPress={this.resetAppShell}
                                style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.pressed]}
                            >
                                <Text style={styles.primaryButtonLabel}>Try again</Text>
                            </Pressable>
                            <Pressable
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

export const AppErrorBoundary: React.FC<AppErrorBoundaryProps> = (props) => {
    const theme = useAppTheme();
    return <ThemedAppErrorBoundary {...props} theme={theme} />;
};

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
