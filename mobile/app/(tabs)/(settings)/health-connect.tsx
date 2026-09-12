/**
 * Defines the Health Connect settings Expo Router screen.
 */
import { HealthConnectCard } from '../../../src/components/HealthConnectCard';
import { AppText } from '../../../src/components/AppText';
import { TabScreen } from '../../../src/components/TabScreen';
import { supportsAndroidIntegrations } from '../../../src/platform/nativePlatform';

/** Render Health Connect consent and data-access controls as a navigable settings page. */
export default function HealthConnectSettingsScreen() {
    return (
        <TabScreen testID="health-connect-settings-page">
            {supportsAndroidIntegrations() ? <HealthConnectCard /> : (
                <AppText>Health Connect is available in the Android app.</AppText>
            )}
        </TabScreen>
    );
}
