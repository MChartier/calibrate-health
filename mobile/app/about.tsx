import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { CalibrateLogo } from '../src/components/CalibrateLogo';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { radius, spacing, useAppTheme } from '../src/theme';
import { useAppUpdateController } from '../src/updates/useAppUpdateController';

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

function getUpdateActionIcon(
    isUpdatePending: boolean,
    isUpdateAvailable: boolean
): React.ComponentProps<typeof Ionicons>['name'] {
    if (isUpdatePending) return 'refresh';
    if (isUpdateAvailable) return 'download-outline';
    return 'cloud-done-outline';
}

export default function AboutScreen() {
    const router = useRouter();
    const theme = useAppTheme();
    const updates = useAppUpdateController();
    const { versionInfo } = updates;
    const nativeRelease = versionInfo.nativeBuild === 'Not applicable'
        ? versionInfo.nativeVersion
        : `${versionInfo.nativeVersion} (build ${versionInfo.nativeBuild})`;
    const progressPercent = typeof updates.downloadProgress === 'number'
        ? Math.round(updates.downloadProgress * 100)
        : null;
    const status = progressPercent !== null && updates.manualPhase === 'downloading'
        ? `${updates.status} ${progressPercent}%`
        : updates.status;
    const actionIcon = getUpdateActionIcon(updates.isUpdatePending, updates.isUpdateAvailable);

    function goBack() {
        if (router.canGoBack()) router.back();
        else router.replace('/settings');
    }

    return (
        <Screen safeTop>
            <PageHeader
                title="About Calibrate"
                description="Installed build and software update details."
                onBack={goBack}
                backLabel="Back to Settings"
            />

            <AppCard style={styles.brandCard}>
                <View style={[styles.logoSurface, { backgroundColor: theme.colors.primaryContainer }]}>
                    <CalibrateLogo size={52} />
                </View>
                <View style={styles.brandCopy}>
                    <AppText variant="title">calibrate</AppText>
                    <AppText variant="caption">Self-hosted food, weight, and goal tracking.</AppText>
                </View>
            </AppCard>

            <AppCard>
                <View style={styles.cardHeading}>
                    <View style={[styles.headingIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Ionicons name="information-circle-outline" size={22} color={theme.colors.primaryDark} />
                    </View>
                    <View style={styles.headingCopy}>
                        <AppText variant="subtitle">Version details</AppText>
                        <AppText variant="caption">Useful when checking build and OTA compatibility.</AppText>
                    </View>
                </View>
                <View style={[styles.infoRows, { backgroundColor: theme.colors.surfaceContainer }]}>
                    <InfoRow label="Native build tag" value={versionInfo.nativeReleaseTag} />
                    <InfoRow label="Native release" value={nativeRelease} />
                    <InfoRow label="OTA runtime" value={versionInfo.runtimeVersion} />
                    <InfoRow label="Update channel" value={versionInfo.channel} />
                    <InfoRow label="Current OTA" value={versionInfo.updateLabel} />
                    <InfoRow label="Published" value={formatUpdateDate(versionInfo.updateCreatedAt)} showDivider={false} />
                </View>
                {versionInfo.updateId ? (
                    <View style={styles.updateIdBlock}>
                        <AppText variant="caption">Full update ID</AppText>
                        <AppText selectable style={styles.updateId}>{versionInfo.updateId}</AppText>
                    </View>
                ) : null}
            </AppCard>

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

            <AppCard>
                <View style={styles.cardHeading}>
                    <View style={[styles.headingIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Ionicons name="cloud-download-outline" size={22} color={theme.colors.primaryDark} />
                    </View>
                    <View style={styles.headingCopy}>
                        <AppText variant="subtitle">App updates</AppText>
                        <AppText variant="caption">Check the channel built into this phone app.</AppText>
                    </View>
                </View>
                <View
                    accessibilityLiveRegion="polite"
                    style={[styles.status, { backgroundColor: theme.colors.surfaceContainer }]}
                >
                    {updates.isBusy ? <ActivityIndicator color={theme.colors.primary} /> : (
                        <Ionicons
                            name={updates.manualPhase === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                            size={22}
                            color={updates.manualPhase === 'error' ? theme.colors.danger : theme.colors.primary}
                        />
                    )}
                    <AppText style={styles.statusCopy}>{status}</AppText>
                </View>
                <AppButton
                    title={updates.actionTitle}
                    variant={updates.isUpdateAvailable || updates.isUpdatePending ? 'primary' : 'secondary'}
                    disabled={!updates.isSupported || updates.isBusy}
                    leftIcon={<Ionicons name={actionIcon} size={20} color={
                        updates.isUpdateAvailable || updates.isUpdatePending
                            ? theme.colors.onPrimary
                            : theme.colors.onSurface
                    } />}
                    onPress={() => void updates.action()}
                />
                <AppText variant="caption">
                    OTA updates can change the phone app's JavaScript and assets. Native Android or Watch changes still
                    require a newly signed build.
                </AppText>
                {Platform.OS !== 'web' ? (
                    <AppText variant="caption">
                        Installing an update restarts Calibrate immediately. Saved account and offline data remain on the device.
                    </AppText>
                ) : null}
            </AppCard>
        </Screen>
    );
}

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
            <AppText style={styles.infoValue}>{value}</AppText>
        </View>
    );
};

const styles = StyleSheet.create({
    brandCard: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    logoSurface: {
        width: 72,
        height: 72,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center'
    },
    brandCopy: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    cardHeading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    headingIcon: {
        width: 42,
        height: 42,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center'
    },
    headingCopy: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    infoRows: {
        borderRadius: radius.md,
        paddingHorizontal: spacing.md
    },
    infoRow: {
        minHeight: 52,
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
        minHeight: 64,
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
