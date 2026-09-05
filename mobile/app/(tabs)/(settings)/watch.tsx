/**
 * Defines the Wear OS pairing settings Expo Router screen.
 */
import { TabScreen } from '../../../src/components/TabScreen';
import { AppText } from '../../../src/components/AppText';
import { WearPairingCard } from '../../../src/components/WearPairingCard';
import { supportsAndroidIntegrations } from '../../../src/platform/nativePlatform';

/** Render phone-to-watch pairing controls as a navigable settings page. */
export default function WatchSettingsScreen() {
    return (
        <TabScreen testID="watch-settings-page">
            {supportsAndroidIntegrations() ? <WearPairingCard /> : (
                <AppText>Galaxy Watch pairing is available in the Android app.</AppText>
            )}
        </TabScreen>
    );
}
