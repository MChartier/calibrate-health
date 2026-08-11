/**
 * Defines the Advanced settings Expo Router screen.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppButton } from '../../../src/components/AppButton';
import { AppCard } from '../../../src/components/AppCard';
import { AppText } from '../../../src/components/AppText';
import { ServerUrlControl } from '../../../src/components/ServerUrlControl';
import { TabScreen } from '../../../src/components/TabScreen';
import { useAuth } from '../../../src/auth/AuthContext';
import { HOSTED_SERVER_URL, normalizeServerUrl } from '../../../src/config/server';
import { radius, spacing, useAppTheme } from '../../../src/theme';
import { useAppUpdateController } from '../../../src/updates/useAppUpdateController';

const DIAGNOSTIC_ROW_MIN_HEIGHT = 52; // Keeps support values readable without inflating every row into a full control.
const UPDATE_STATUS_MIN_HEIGHT = 64; // Reserves stable space while update status swaps between text and progress.

/** Format update date for stable display or serialization. */
function formatUpdateDate(value: Date | null): string {
    if (!value || Number.isNaN(value.getTime())) return 'Unknown';
    return value.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

/** Resolve the update action icon from the current validated state. */
function getUpdateActionIcon(
    isUpdatePending: boolean,
    isUpdateAvailable: boolean
): React.ComponentProps<typeof Ionicons>['name'] {
    if (isUpdatePending) return 'refresh';
    if (isUpdateAvailable) return 'download-outline';
    return 'cloud-done-outline';
}

/** Render connection, diagnostics, and software-update settings in one route. */
export default function AdvancedSettingsScreen() {
    const theme = useAppTheme();
    const { serverUrl, serverConnection, setServerUrl, testServerUrl } = useAuth();
    const updates = useAppUpdateController();
    const [serverInput, setServerInput] = useState(serverUrl);
    const [isSavingServer, setIsSavingServer] = useState(false);
    const { versionInfo } = updates;
    const nativeRelease = versionInfo.nativeBuild === 'Not applicable'
        ? versionInfo.nativeVersion
        : `${versionInfo.nativeVersion} (build ${versionInfo.nativeBuild})`;
    const progressPercent = typeof updates.downloadProgress === 'number'
        ? Math.round(updates.downloadProgress * 100)
        : null;
    const updateStatus = progressPercent !== null && updates.manualPhase === 'downloading'
        ? `${updates.status} ${progressPercent}%`
        : updates.status;
    const updateActionIcon = getUpdateActionIcon(updates.isUpdatePending, updates.isUpdateAvailable);
    const serviceLabel = normalizeServerUrl(serverUrl) === HOSTED_SERVER_URL
        ? 'Calibrate hosted service'
        : 'Self-hosted service';
    const platformLabel = Platform.OS === 'web' ? 'Web/PWA' : 'Android';

    /** Confirm and persist the tested server selection. */
    async function handleSaveServer() {
        setIsSavingServer(true);
        try {
            await setServerUrl(serverInput);
        } finally {
            setIsSavingServer(false);
        }
    }

    return (
        <TabScreen testID="advanced-settings-page">
            <AppCard>
                <View style={styles.sectionHeading}>
                    <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Connection</AppText>
                    <AppText variant="caption">Optional connection settings for self-hosted services.</AppText>
                </View>
                <ServerUrlControl
                    presentation="editor"
                    value={serverInput}
                    onChangeText={setServerInput}
                    connection={serverConnection}
                    onTestConnection={testServerUrl}
                />
                <AppText variant="caption">
                    Calibrate tests a new service before signing out of the current one.
                </AppText>
                <AppButton
                    title={isSavingServer ? 'Saving connection...' : 'Save connection'}
                    disabled={isSavingServer}
                    leftIcon={<Ionicons name="server-outline" size={18} color={theme.colors.onPrimary} />}
                    onPress={() => void handleSaveServer()}
                />
            </AppCard>

            <AppCard>
                <View style={styles.sectionHeading}>
                    <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Diagnostics</AppText>
                    <AppText variant="caption">Technical details for support and release verification.</AppText>
                </View>
                <View style={styles.operatorNotice}>
                    <AppText variant="label">Self-hosting</AppText>
                    <AppText variant="caption">
                        A self-hosted service's operator is responsible for privacy, security, availability, backups,
                        and support.
                    </AppText>
                </View>
                {versionInfo.isEmergencyLaunch ? (
                    <View style={[
                        styles.notice,
                        { backgroundColor: theme.colors.warningContainer, borderColor: theme.colors.warning }
                    ]}>
                        <Ionicons name="warning-outline" size={22} color={theme.colors.onWarningContainer} />
                        <View style={styles.noticeCopy}>
                            <AppText variant="label" style={{ color: theme.colors.onWarningContainer }}>
                                Recovery launch
                            </AppText>
                            <AppText style={{ color: theme.colors.onWarningContainer }}>
                                Calibrate returned to a safe embedded update because the latest OTA could not launch.
                            </AppText>
                            {versionInfo.emergencyLaunchReason ? (
                                <AppText variant="caption" selectable>{versionInfo.emergencyLaunchReason}</AppText>
                            ) : null}
                        </View>
                    </View>
                ) : null}
                <View style={[styles.infoRows, { backgroundColor: theme.colors.surfaceContainer }]}>
                    <InfoRow label="Service" value={serviceLabel} />
                    <InfoRow label="Service address" value={serverUrl} />
                    <InfoRow label="Platform" value={platformLabel} />
                    <InfoRow label="Native build tag" value={versionInfo.nativeReleaseTag} />
                    <InfoRow label="Native release" value={nativeRelease} />
                    <InfoRow label="OTA runtime" value={versionInfo.runtimeVersion} />
                    <InfoRow label="Update channel" value={versionInfo.channel} />
                    <InfoRow label="Current OTA" value={versionInfo.updateLabel} />
                    <InfoRow
                        label="Published"
                        value={formatUpdateDate(versionInfo.updateCreatedAt)}
                        showDivider={false}
                    />
                </View>
                {versionInfo.updateId ? (
                    <View style={styles.updateIdBlock}>
                        <AppText variant="caption">Full update ID</AppText>
                        <AppText selectable style={styles.updateId}>{versionInfo.updateId}</AppText>
                    </View>
                ) : null}
            </AppCard>

            <AppCard>
                <View style={styles.sectionHeading}>
                    <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Software updates</AppText>
                    <AppText variant="caption">Check for and apply compatible Calibrate updates.</AppText>
                </View>
                <View
                    accessibilityLiveRegion="polite"
                    style={[styles.status, { backgroundColor: theme.colors.surfaceContainer }]}
                >
                    {updates.isBusy ? <ActivityIndicator color={theme.colors.primary} /> : (
                        <Ionicons
                            name={updates.manualPhase === 'error'
                                ? 'alert-circle-outline'
                                : 'checkmark-circle-outline'}
                            size={22}
                            color={updates.manualPhase === 'error' ? theme.colors.danger : theme.colors.primary}
                        />
                    )}
                    <AppText style={styles.statusCopy}>{updateStatus}</AppText>
                </View>
                {updates.isSupported ? (
                    <AppButton
                        title={updates.actionTitle}
                        variant={updates.isUpdateAvailable || updates.isUpdatePending ? 'primary' : 'secondary'}
                        disabled={updates.isBusy}
                        leftIcon={<Ionicons name={updateActionIcon} size={20} color={
                            updates.isUpdateAvailable || updates.isUpdatePending
                                ? theme.colors.onPrimary
                                : theme.colors.onSurface
                        } />}
                        onPress={() => void updates.action()}
                    />
                ) : null}
                <AppText variant="caption">
                    {Platform.OS === 'web'
                        ? 'Web and PWA updates are delivered through the browser and installed-site lifecycle.'
                        : 'OTA updates can change Android JavaScript and assets. Native Android or Watch changes require a newly signed build.'}
                </AppText>
            </AppCard>
        </TabScreen>
    );
}

/** Render one diagnostic label and value pair. */
const InfoRow: React.FC<{ label: string; value: string; showDivider?: boolean }> = ({
    label,
    value,
    showDivider = true
}) => {
    const theme = useAppTheme();
    return (
        <View style={[
            styles.infoRow,
            showDivider && { borderBottomColor: theme.colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth }
        ]}>
            <AppText variant="caption">{label}</AppText>
            <AppText selectable style={styles.infoValue}>{value}</AppText>
        </View>
    );
};

const styles = StyleSheet.create({
    sectionHeading: {
        gap: spacing.xs
    },
    operatorNotice: {
        gap: spacing.xs
    },
    infoRows: {
        borderRadius: radius.md,
        paddingHorizontal: spacing.md
    },
    infoRow: {
        minHeight: DIAGNOSTIC_ROW_MIN_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.lg,
        paddingVertical: spacing.sm
    },
    infoValue: {
        flex: 1,
        textAlign: 'right',
        fontWeight: '700'
    },
    updateIdBlock: {
        gap: spacing.xs
    },
    updateId: {
        fontFamily: Platform.select({ android: 'monospace', default: undefined }),
        fontSize: 13
    },
    notice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.lg,
        padding: spacing.lg
    },
    noticeCopy: {
        flex: 1,
        gap: spacing.xs
    },
    status: {
        minHeight: UPDATE_STATUS_MIN_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    statusCopy: {
        flex: 1
    }
});
