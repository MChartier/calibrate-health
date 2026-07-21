import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { ClientUpgradeRequirement } from '@calibrate/shared';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { CalibrateLogo } from './CalibrateLogo';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';

type ClientUpgradeRequiredScreenProps = {
    requirement: ClientUpgradeRequirement;
    serverUrl: string;
    onRecheck: () => Promise<boolean>;
    onChooseServer: () => Promise<void>;
};

/** Blocks incompatible traffic while preserving the session and queued data for an in-place update. */
export const ClientUpgradeRequiredScreen: React.FC<ClientUpgradeRequiredScreenProps> = ({
    requirement,
    serverUrl,
    onRecheck,
    onChooseServer
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [checking, setChecking] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);

    const recheck = async () => {
        if (checking) return;
        setChecking(true);
        setRetryError(null);
        try {
            const compatible = await onRecheck();
            if (!compatible) setRetryError('This server still requires a newer Calibrate version.');
        } catch {
            setRetryError('Could not reach this Calibrate server. Try again when the connection is available.');
        } finally {
            setChecking(false);
        }
    };

    return (
        <View style={styles.screen} accessibilityRole="alert" accessibilityLabel="Calibrate update required">
            <View style={styles.card}>
                <CalibrateLogo size={48} />
                <AppText variant="screenTitle" accessibilityRole="header" aria-level={1}>Update Calibrate to continue</AppText>
                <AppText>
                    This server requires Android version {requirement.minimum_supported_version} or newer.
                    Your session and pending offline changes are still stored on this device.
                </AppText>
                <View style={styles.details}>
                    <AppText variant="label">Installed version</AppText>
                    <AppText>{requirement.current_version ?? 'Older client without version support'}</AppText>
                    <AppText variant="label">Server</AppText>
                    <AppText>{serverUrl}</AppText>
                </View>
                {retryError ? <AppText style={styles.error} accessibilityRole="alert">{retryError}</AppText> : null}
                <AppButton
                    title={checking ? 'Checking...' : 'Check again'}
                    onPress={() => void recheck()}
                    disabled={checking}
                    leftIcon={checking ? <ActivityIndicator color={theme.colors.onPrimary} /> : undefined}
                />
                <AppButton
                    title="Sign out and choose another server"
                    variant="secondary"
                    onPress={() => void onChooseServer()}
                    disabled={checking}
                />
            </View>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    screen: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
        padding: spacing.xl
    },
    card: {
        gap: spacing.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.outlineVariant,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface,
        padding: spacing.xl
    },
    details: {
        gap: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: theme.colors.surfaceContainer,
        padding: spacing.lg
    },
    error: {
        color: theme.colors.danger
    }
});
