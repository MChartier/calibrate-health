import React from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { HEALTH_CONNECT_FEATURES, type HealthConnectFeature } from '../healthConnect/types';
import { useHealthConnect } from '../healthConnect/provider';
import { colors, spacing } from '../theme';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { SectionHeader } from './SectionHeader';

const FEATURE_PRESENTATION: Array<{
    feature: HealthConnectFeature;
    label: string;
    description: string;
}> = [
    { feature: HEALTH_CONNECT_FEATURES.STEPS, label: 'Steps', description: 'Daily step totals.' },
    { feature: HEALTH_CONNECT_FEATURES.ACTIVE_CALORIES, label: 'Active calories', description: 'Energy burned through activity.' },
    { feature: HEALTH_CONNECT_FEATURES.TOTAL_CALORIES, label: 'Total calories', description: 'Observed active and resting burn.' },
    { feature: HEALTH_CONNECT_FEATURES.EXERCISE, label: 'Exercise', description: 'Workout type, title, and duration.' },
    { feature: HEALTH_CONNECT_FEATURES.WEIGHT, label: 'Weight', description: 'Optional scale and body-weight readings.' }
];

function formatLastRefresh(value: string | null): string {
    if (!value) return 'Not checked yet';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unknown';
    return parsed.toLocaleString();
}

/** Read-only Health Connect consent and device-access controls. */
export function HealthConnectCard() {
    const healthConnect = useHealthConnect();
    const availability = healthConnect.connection?.availability;
    const granted = new Set(healthConnect.connection?.grantedFeatures ?? []);
    const enabledFeatures = FEATURE_PRESENTATION.filter(({ feature }) => healthConnect.selection[feature]);
    const missingFeatures = enabledFeatures.filter(({ feature }) => !granted.has(feature));
    const isAvailable = availability === 'available';

    let statusMessage = 'Checking whether Health Connect is available...';
    if (!healthConnect.isLoading) {
        switch (availability) {
            case 'available':
                if (!healthConnect.connected) statusMessage = 'Ready to connect.';
                else if (healthConnect.paused) statusMessage = 'Connected, but activity sync is paused.';
                else if (missingFeatures.length > 0) statusMessage = `${missingFeatures.length} selected data type${missingFeatures.length === 1 ? '' : 's'} still need access.`;
                else statusMessage = 'Connected with access to all selected data types.';
                break;
            case 'provider_update_required':
                statusMessage = 'Health Connect must be updated before Calibrate can connect.';
                break;
            case 'not_android':
                statusMessage = 'Health Connect is available only on supported Android devices.';
                break;
            default:
                statusMessage = 'Health Connect is not available on this device.';
        }
    }

    function confirmDisconnect() {
        Alert.alert(
            'Disconnect Health Connect?',
            'Calibrate will revoke Health Connect permissions and stop future imports. Activity and weight already sent to your Calibrate server remain until account deletion or server cleanup.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Disconnect', style: 'destructive', onPress: () => void healthConnect.disconnect() }
            ]
        );
    }

    return (
        <AppCard>
            <SectionHeader
                title="Health Connect"
                description="Read activity from Samsung Health and other connected apps on this phone."
            />
            <View style={styles.rationale}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.primaryDark} />
                <AppText style={styles.rationaleText}>
                    Read only: Calibrate never writes health records, and imported activity will not automatically change your calorie target.
                </AppText>
            </View>
            <AppText
                accessibilityLiveRegion="polite"
                accessibilityRole={healthConnect.error ? 'alert' : undefined}
                style={healthConnect.error ? styles.error : undefined}
            >
                {healthConnect.error ?? statusMessage}
            </AppText>
            {healthConnect.connected && (
                <View style={styles.syncStatus}>
                    <AppText
                        accessibilityLiveRegion="polite"
                        accessibilityRole={healthConnect.syncError ? 'alert' : undefined}
                        style={healthConnect.syncError ? styles.error : undefined}
                    >
                        {healthConnect.syncError
                            ?? (healthConnect.isSyncing
                                ? 'Syncing selected Health Connect data...'
                                : `Last activity sync: ${formatLastRefresh(healthConnect.lastSuccessfulSyncAt)}`)}
                    </AppText>
                    <AppButton
                        title={healthConnect.isSyncing ? 'Syncing...' : 'Sync activity now'}
                        variant="ghost"
                        disabled={healthConnect.isBusy || healthConnect.isSyncing || healthConnect.paused || missingFeatures.length > 0}
                        onPress={() => void healthConnect.sync()}
                        style={styles.compactButton}
                    />
                </View>
            )}

            {availability === 'provider_update_required' && (
                <AppButton
                    title="Update Health Connect"
                    variant="secondary"
                    leftIcon={<Ionicons name="download-outline" size={18} color={colors.text} />}
                    onPress={() => void healthConnect.updateProvider()}
                />
            )}

            {isAvailable && (
                <>
                    <AppText variant="label">Data Calibrate may read</AppText>
                    <View style={styles.featureList}>
                        {FEATURE_PRESENTATION.map(({ feature, label, description }) => {
                            const enabled = healthConnect.selection[feature];
                            const grantedAccess = granted.has(feature);
                            const isWeight = feature === HEALTH_CONNECT_FEATURES.WEIGHT;
                            return (
                                <View key={feature} style={styles.featureRow}>
                                    <View style={styles.featureText}>
                                        <View style={styles.featureTitleRow}>
                                            <AppText style={styles.featureTitle}>{label}</AppText>
                                            {healthConnect.connected && enabled && (
                                                <AppText variant="caption" style={grantedAccess ? styles.granted : styles.needsAccess}>
                                                    {grantedAccess ? 'Allowed' : 'Needs access'}
                                                </AppText>
                                            )}
                                        </View>
                                        <AppText variant="caption">
                                            {description}{isWeight ? ' Off by default and never overwrites a manual weigh-in.' : ''}
                                        </AppText>
                                    </View>
                                    <Switch
                                        accessibilityLabel={`Read ${label.toLowerCase()} from Health Connect`}
                                        accessibilityHint={isWeight ? 'Weight import requires separate, explicit permission.' : undefined}
                                        value={enabled}
                                        disabled={healthConnect.isBusy}
                                        onValueChange={(next) => void healthConnect.setFeatureEnabled(feature, next)}
                                        trackColor={{ false: colors.controlTrack, true: colors.primarySoft }}
                                        thumbColor={enabled ? colors.primary : colors.surface}
                                    />
                                </View>
                            );
                        })}
                    </View>
                    <AppText variant="muted">
                        Turning off a data type, pausing, or disconnecting stops future imports. Data already synced to your Calibrate server remains in history and exports until account deletion or server cleanup.
                    </AppText>

                    {!healthConnect.connected ? (
                        <AppButton
                            title={healthConnect.isBusy ? 'Connecting...' : 'Connect Health Connect'}
                            disabled={healthConnect.isBusy || enabledFeatures.length === 0}
                            leftIcon={<Ionicons name="fitness-outline" size={18} color="#ffffff" />}
                            onPress={() => void healthConnect.connect()}
                        />
                    ) : (
                        <>
                            {missingFeatures.length > 0 && (
                                <AppButton
                                    title={healthConnect.isBusy ? 'Requesting...' : 'Review selected access'}
                                    disabled={healthConnect.isBusy}
                                    onPress={() => void healthConnect.connect()}
                                />
                            )}
                            <View style={styles.actionRow}>
                                <AppButton
                                    title={healthConnect.paused ? 'Resume sync' : 'Pause sync'}
                                    variant="secondary"
                                    disabled={healthConnect.isBusy}
                                    onPress={() => void healthConnect.setPaused(!healthConnect.paused)}
                                    style={styles.actionButton}
                                />
                                <AppButton
                                    title="Manage access"
                                    variant="secondary"
                                    disabled={healthConnect.isBusy}
                                    onPress={() => void healthConnect.manageAccess()}
                                    style={styles.actionButton}
                                />
                            </View>
                            <AppButton
                                title="Disconnect"
                                variant="ghost"
                                disabled={healthConnect.isBusy}
                                onPress={confirmDisconnect}
                            />
                        </>
                    )}
                </>
            )}

            <View style={styles.footer}>
                <AppText variant="caption">Last permission check: {formatLastRefresh(healthConnect.lastRefreshedAt)}</AppText>
                {isAvailable && (
                    <AppButton
                        title={healthConnect.isBusy ? 'Checking...' : 'Check again'}
                        variant="ghost"
                        disabled={healthConnect.isBusy}
                        onPress={() => void healthConnect.refresh()}
                        style={styles.compactButton}
                    />
                )}
            </View>
            {healthConnect.restartMessage && (
                <AppText accessibilityLiveRegion="polite" style={styles.notice}>{healthConnect.restartMessage}</AppText>
            )}
            <AppButton
                title="How Calibrate uses health data"
                variant="ghost"
                onPress={() => router.push('/health-connect-privacy')}
            />
        </AppCard>
    );
}

const styles = StyleSheet.create({
    rationale: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.md,
        backgroundColor: colors.primarySoft
    },
    rationaleText: {
        flex: 1
    },
    featureList: {
        gap: spacing.sm
    },
    syncStatus: {
        gap: spacing.sm
    },
    featureRow: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    featureText: {
        flex: 1,
        gap: spacing.xs
    },
    featureTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm
    },
    featureTitle: {
        fontWeight: '800'
    },
    granted: {
        color: colors.success
    },
    needsAccess: {
        color: colors.warningDark
    },
    actionRow: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionButton: {
        flex: 1
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    compactButton: {
        minHeight: 36,
        paddingVertical: spacing.sm
    },
    error: {
        color: colors.danger
    },
    notice: {
        color: colors.warningDark
    }
});
