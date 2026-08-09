import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { CALIBRATE_PRODUCT_LINKS } from '@calibrate/shared/product';
import { AppButton } from '../../../src/components/AppButton';
import { AppCard } from '../../../src/components/AppCard';
import { AppText } from '../../../src/components/AppText';
import { CalibrateLogo } from '../../../src/components/CalibrateLogo';
import { TabScreen } from '../../../src/components/TabScreen';
import { useAuth } from '../../../src/auth/AuthContext';
import { HOSTED_SERVER_URL, normalizeServerUrl } from '../../../src/config/server';
import { radius, spacing, useAppTheme } from '../../../src/theme';
import { useAppUpdateController } from '../../../src/updates/useAppUpdateController';

const PRODUCT_LINKS = [
    { label: 'Calibrate website', href: CALIBRATE_PRODUCT_LINKS.product },
    { label: 'Privacy policy', href: CALIBRATE_PRODUCT_LINKS.privacy },
    { label: 'Terms of service', href: CALIBRATE_PRODUCT_LINKS.terms },
    { label: 'Support', href: CALIBRATE_PRODUCT_LINKS.support },
    { label: 'Feedback', href: CALIBRATE_PRODUCT_LINKS.feedback },
    { label: 'Open-source licenses', href: CALIBRATE_PRODUCT_LINKS.licenses },
    { label: 'Release notes', href: CALIBRATE_PRODUCT_LINKS.releases }
] as const;

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
    const theme = useAppTheme();
    const { serverUrl } = useAuth();
    const updates = useAppUpdateController();
    const [showAdvanced, setShowAdvanced] = useState(false);
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
    const serviceLabel = normalizeServerUrl(serverUrl) === HOSTED_SERVER_URL
        ? 'Calibrate hosted service'
        : 'Self-hosted service';
    const platformLabel = Platform.OS === 'web' ? 'Web/PWA' : 'Android';

    return (
        <TabScreen>
            <AppCard style={styles.brandCard}>
                <View style={[styles.logoSurface, { backgroundColor: theme.colors.primaryContainer }]}>
                    <CalibrateLogo size={52} />
                </View>
                <View style={styles.brandCopy}>
                    <AppText variant="title">About Calibrate</AppText>
                    <AppText variant="caption">Food, weight, and goal tracking built around clear daily progress.</AppText>
                </View>
            </AppCard>

            <AppCard>
                <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Understand your progress</AppText>
                <AppText>
                    Calibrate helps you log food and weight, compare calories with a personalized target, and follow
                    your trend over time.
                </AppText>
                <AppText variant="caption">
                    Available in English on the web as an installable PWA and on Android, with a Wear OS companion.
                </AppText>
            </AppCard>

            <AppCard>
                <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Your data, your choices</AppText>
                <AppText>
                    The service you sign in to stores the account data Calibrate needs to work. You can export a
                    portable copy or permanently delete your account from Settings.
                </AppText>
                <View style={styles.productLinks}>
                    {PRODUCT_LINKS.map((link) => (
                        <Link key={link.label} href={link.href as Href} asChild>
                            <Pressable
                                accessibilityRole="link"
                                style={({ pressed }) => [
                                    styles.productLink,
                                    { borderColor: theme.colors.outline },
                                    pressed && { backgroundColor: theme.colors.surfacePressed }
                                ]}
                            >
                                <AppText style={[styles.productLinkText, { color: theme.colors.primary }]}>
                                    {link.label}
                                </AppText>
                            </Pressable>
                        </Link>
                    ))}
                </View>
            </AppCard>

            <AppCard>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showAdvanced ? 'Hide advanced details' : 'Show advanced details'}
                    accessibilityState={{ expanded: showAdvanced }}
                    aria-expanded={showAdvanced}
                    onPress={() => setShowAdvanced((current) => !current)}
                    style={({ pressed }) => [styles.advancedDisclosure, pressed && { opacity: theme.interaction.pressedOpacity }]}
                >
                    <View style={styles.headingCopy}>
                        <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Advanced details</AppText>
                        <AppText variant="caption">Optional technical information</AppText>
                    </View>
                    <Ionicons
                        name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={theme.colors.primary}
                    />
                </Pressable>

                {showAdvanced && (
                    <View style={styles.advancedContent}>
                        <View style={styles.operatorNotice}>
                            <AppText accessibilityRole="header" aria-level={3} variant="label">Self-hosting</AppText>
                            <AppText variant="caption">
                                Calibrate can connect to compatible self-hosted services. That service's operator is
                                responsible for privacy, security, availability, backups, and support.
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

                        <AppText accessibilityRole="header" aria-level={3} variant="label">Diagnostics</AppText>
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

                        <AppText accessibilityRole="header" aria-level={3} variant="label">Software updates</AppText>
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
                            <AppText style={styles.statusCopy}>{status}</AppText>
                        </View>
                        {updates.isSupported && (
                            <AppButton
                                title={updates.actionTitle}
                                variant={updates.isUpdateAvailable || updates.isUpdatePending ? 'primary' : 'secondary'}
                                disabled={updates.isBusy}
                                leftIcon={<Ionicons name={actionIcon} size={20} color={
                                    updates.isUpdateAvailable || updates.isUpdatePending
                                        ? theme.colors.onPrimary
                                        : theme.colors.onSurface
                                } />}
                                onPress={() => void updates.action()}
                            />
                        )}
                        {Platform.OS === 'web' ? (
                            <AppText variant="caption">
                                Web and PWA updates are delivered through the browser and installed-site lifecycle.
                            </AppText>
                        ) : (
                            <AppText variant="caption">
                                OTA updates can change the Android app's JavaScript and assets. Native Android or Watch
                                changes require a newly signed build.
                            </AppText>
                        )}
                    </View>
                )}
            </AppCard>
        </TabScreen>
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
            <AppText selectable style={styles.infoValue}>{value}</AppText>
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
    productLinks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    productLink: {
        minHeight: 48,
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    productLinkText: {
        fontWeight: '800'
    },
    advancedDisclosure: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    headingCopy: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    advancedContent: {
        gap: spacing.lg
    },
    operatorNotice: {
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
