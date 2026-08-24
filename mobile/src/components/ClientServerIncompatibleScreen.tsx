import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
    CLIENT_SERVER_COMPATIBILITY_STATUSES,
    formatMajorVersion,
    formatMinorVersion,
    type ClientServerCompatibilityMismatch
} from '@calibrate/shared/releaseCompatibility';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { CalibrateLogo } from './CalibrateLogo';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';

type ClientServerIncompatibleScreenProps = {
    mismatch: ClientServerCompatibilityMismatch;
    serverUrl: string;
    onRecheck: () => Promise<boolean>;
    onChooseServer: () => Promise<void>;
};

/** Block normal authenticated runtime without discarding the retained session or offline outbox. */
export const ClientServerIncompatibleScreen: React.FC<ClientServerIncompatibleScreenProps> = ({
    mismatch,
    serverUrl,
    onRecheck,
    onChooseServer
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [checking, setChecking] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);
    const serverBehind = mismatch.status === CLIENT_SERVER_COMPATIBILITY_STATUSES.SERVER_BEHIND;
    const clientMajorVersion = formatMajorVersion(mismatch.clientVersion) ?? mismatch.clientVersion;
    const serverMajorVersion = formatMajorVersion(mismatch.serverVersion) ?? mismatch.serverVersion;
    const clientMinorVersion = formatMinorVersion(mismatch.clientVersion) ?? mismatch.clientVersion;

    const recheck = async () => {
        if (checking) return;
        setChecking(true);
        setRetryError(null);
        try {
            const compatible = await onRecheck();
            if (!compatible) setRetryError('The client and server are still incompatible.');
        } catch {
            setRetryError('Could not reach this Calibrate server. Try again when the connection is available.');
        } finally {
            setChecking(false);
        }
    };

    let title = 'Client and server are incompatible';
    let explanation = `The client targets ${mismatch.clientVersion}, while the server reports ${mismatch.serverVersion}.`;
    if (serverBehind) {
        title = 'Server update required';
        if (clientMajorVersion === serverMajorVersion) {
            explanation = `This Calibrate update requires server ${clientMinorVersion} or a newer ${clientMajorVersion} release, but the selected server is ${mismatch.serverVersion}. Ask the server operator to update it before continuing.`;
        } else {
            explanation = `This Calibrate update requires server major version ${clientMajorVersion}, but the selected server is ${mismatch.serverVersion}. Ask the server operator to update it before continuing.`;
        }
    } else if (mismatch.status === CLIENT_SERVER_COMPATIBILITY_STATUSES.CLIENT_BEHIND) {
        title = 'Calibrate update required';
        explanation = `This client targets server major version ${clientMajorVersion}, but the selected server is ${mismatch.serverVersion}. Install a Calibrate update for major version ${serverMajorVersion} before continuing.`;
    }

    return (
        <View style={styles.screen} accessibilityRole="alert" accessibilityLabel="Calibrate server incompatible">
            <View style={styles.card}>
                <CalibrateLogo size={48} />
                <AppText variant="screenTitle" accessibilityRole="header" aria-level={1}>{title}</AppText>
                <AppText>{explanation}</AppText>
                <AppText>
                    Any saved session and pending offline changes remain stored on this device.
                </AppText>
                <View style={styles.details}>
                    <AppText variant="label">Client release</AppText>
                    <AppText>{mismatch.clientVersion}</AppText>
                    <AppText variant="label">Server release</AppText>
                    <AppText>{mismatch.serverVersion}</AppText>
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
