import { PlanCheckCard } from '../../../src/components/PlanCheckCard';
import { TabScreen } from '../../../src/components/TabScreen';

export default function PlanCheckScreen() {
    return (
        <TabScreen contentWidth="overview">
            <PlanCheckCard />
        </TabScreen>
    );
}
