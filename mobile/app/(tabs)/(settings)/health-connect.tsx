/**
 * Defines the Health Connect settings Expo Router screen.
 */
import { HealthConnectCard } from '../../../src/components/HealthConnectCard';
import { TabScreen } from '../../../src/components/TabScreen';

/** Render Health Connect consent and data-access controls as a navigable settings page. */
export default function HealthConnectSettingsScreen() {
    return (
        <TabScreen testID="health-connect-settings-page">
            <HealthConnectCard />
        </TabScreen>
    );
}
