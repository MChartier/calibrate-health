import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getHealthConnectOnboardingState } from '../healthConnect/onboardingState';
import { useHealthConnect } from '../healthConnect/provider';
import { colors, radius, spacing } from '../theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';

export function HealthConnectOnboardingStep() {
    const healthConnect = useHealthConnect();
    const availability = healthConnect.connection?.availability;
    const state = getHealthConnectOnboardingState({
        availability,
        connected: healthConnect.connected,
        error: healthConnect.error,
        isLoading: healthConnect.isLoading,
        selection: healthConnect.selection,
        grantedFeatures: healthConnect.connection?.grantedFeatures ?? [],
        syncError: healthConnect.syncError
    });

    return (
        <View style={styles.root}>
            <View style={styles.rationale}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.primaryDark} />
                <AppText style={styles.rationaleText}>
                    Calibrate reads activity only. It never writes health records or automatically adds exercise calories back to your food budget.
                </AppText>
            </View>

            <View style={[styles.statusPanel, healthConnect.connected && !state.needsPermissionReview && styles.connectedPanel]}>
                <Ionicons
                    name={healthConnect.connected && !state.needsPermissionReview ? 'checkmark-circle' : 'fitness-outline'}
                    size={22}
                    color={healthConnect.connected && !state.needsPermissionReview ? colors.success : colors.primaryDark}
                />
                <AppText
                    accessibilityLiveRegion="polite"
                    accessibilityRole={healthConnect.error || healthConnect.syncError ? 'alert' : undefined}
                    style={[styles.statusText, (healthConnect.error || healthConnect.syncError) && styles.error]}
                >
                    {state.status}
                </AppText>
            </View>

            {state.needsPermissionReview && (
                <AppButton
                    title={healthConnect.isBusy ? 'Reviewing...' : healthConnect.connected ? 'Review selected access' : 'Connect Health Connect'}
                    disabled={healthConnect.isBusy}
                    leftIcon={<Ionicons name="fitness-outline" size={18} color="#ffffff" />}
                    onPress={() => void healthConnect.connect()}
                />
            )}
            {availability === 'provider_update_required' && (
                <AppButton
                    title={healthConnect.isBusy ? 'Opening update...' : 'Update Health Connect'}
                    variant="secondary"
                    disabled={healthConnect.isBusy}
                    leftIcon={<Ionicons name="download-outline" size={18} color={colors.text} />}
                    onPress={() => void healthConnect.updateProvider()}
                />
            )}
            {state.canRetrySync && (
                <AppButton
                    title={healthConnect.isSyncing ? 'Syncing...' : 'Retry activity sync'}
                    variant="secondary"
                    disabled={healthConnect.isBusy || healthConnect.isSyncing}
                    onPress={() => void healthConnect.sync()}
                />
            )}
            <AppText variant="muted">
                This step is optional. Continue now to keep setup moving, or connect later from Settings.
            </AppText>
            <AppButton
                title="How Calibrate uses health data"
                variant="ghost"
                onPress={() => router.push('/health-connect-privacy')}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        gap: spacing.md
    },
    rationale: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.primarySoft
    },
    rationaleText: {
        flex: 1,
        lineHeight: 20
    },
    statusPanel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt
    },
    connectedPanel: {
        borderColor: colors.success,
        borderWidth: StyleSheet.hairlineWidth
    },
    statusText: {
        flex: 1
    },
    error: {
        color: colors.danger
    }
});
