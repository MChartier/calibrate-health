/**
 * Defines the weight trend Expo Router screen.
 */
import { StyleSheet } from 'react-native';
import { TabScreen } from '../../../src/components/TabScreen';
import { WeightTrendCard } from '../../../src/components/WeightTrendCard';

/** Render the weight trend screen interface. */
export default function WeightTrendScreen() {
    return (
        <TabScreen>
            <WeightTrendCard
                title={null}
                style={styles.trendCard}
            />
        </TabScreen>
    );
}

const styles = StyleSheet.create({
    trendCard: {
        flexGrow: 1,
        width: '100%'
    }
});
