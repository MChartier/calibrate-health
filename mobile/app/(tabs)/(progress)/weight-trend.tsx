import { StyleSheet } from 'react-native';
import { TabScreen } from '../../../src/components/TabScreen';
import { WeightTrendCard } from '../../../src/components/WeightTrendCard';

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
