import React from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { colors, spacing } from '../src/theme';
import { useAuth } from '../src/auth/AuthContext';

export default function HealthConnectPrivacyScreen() {
    const { serverUrl } = useAuth();
    const privacyPolicyUrl = `${serverUrl.replace(/\/+$/, '')}/privacy`;

    async function openCompletePrivacyPolicy() {
        try {
            await Linking.openURL(privacyPolicyUrl);
        } catch {
            Alert.alert('Unable to open privacy policy', `Open ${privacyPolicyUrl} in your browser.`);
        }
    }

    return (
        <Screen safeTop>
            <AppButton
                title="Back"
                variant="ghost"
                leftIcon={<Ionicons name="arrow-back" size={18} color={colors.text} />}
                onPress={() => router.back()}
                style={styles.backButton}
            />
            <SectionHeader
                eyebrow="Health Connect"
                title="How Calibrate uses health data"
                description="Clear, read-only access that stays under your control."
            />
            <AppCard>
                <AppText variant="subtitle">What Calibrate requests</AppText>
                <AppText>
                    Calibrate can read steps, active calories, total calories, and exercise sessions. Weight is separate and off by default until you explicitly enable it.
                </AppText>
                <AppText variant="subtitle">What Calibrate does not do</AppText>
                <AppText>
                    Calibrate does not write, edit, or delete records in Health Connect. Health activity does not automatically change your calorie target or add calories back to your food budget.
                </AppText>
                <AppText variant="subtitle">Connection preview</AppText>
                <AppText>
                    While connected and unpaused, Calibrate reads selected Health Connect data when the app opens or returns to the foreground and syncs it to your chosen Calibrate server. Remote servers should use HTTPS; a private-network HTTP server may send data without transport encryption. Each source record keeps its originating app so retries and overlapping providers do not silently inflate totals.
                </AppText>
                <AppText variant="subtitle">Your controls</AppText>
                <AppText>
                    You can pause Calibrate, disable individual data types, manage Android permissions, or disconnect at any time. These controls stop future imports. Records already sent to your chosen Calibrate server remain available in activity history and account exports until you delete your account or the server operator removes them. Android retains permissions for individually disabled data types until you remove them in Health Connect or disconnect.
                </AppText>
                <AppText variant="muted">
                    Samsung Health may take time to publish Galaxy Watch activity to Health Connect. Calibrate cannot speed up that handoff.
                </AppText>
                <AppButton
                    title="Open complete privacy policy"
                    variant="secondary"
                    leftIcon={<Ionicons name="open-outline" size={18} color={colors.text} />}
                    accessibilityHint="Opens the complete privacy policy hosted by your selected Calibrate server."
                    onPress={() => void openCompletePrivacyPolicy()}
                />
            </AppCard>
        </Screen>
    );
}

const styles = StyleSheet.create({
    backButton: {
        alignSelf: 'flex-start',
        minHeight: 40,
        paddingHorizontal: spacing.sm
    }
});
