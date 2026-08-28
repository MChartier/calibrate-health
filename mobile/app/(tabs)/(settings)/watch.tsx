/**
 * Defines the Wear OS pairing settings Expo Router screen.
 */
import { TabScreen } from '../../../src/components/TabScreen';
import { WearPairingCard } from '../../../src/components/WearPairingCard';

/** Render phone-to-watch pairing controls as a navigable settings page. */
export default function WatchSettingsScreen() {
    return (
        <TabScreen testID="watch-settings-page">
            <WearPairingCard />
        </TabScreen>
    );
}
