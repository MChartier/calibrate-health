import { fireEvent, render } from '@testing-library/react-native';
import type { GoalEntry } from '@calibrate/api-client';
import { GoalProgressCard } from './GoalProgressCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const GOAL: GoalEntry = {
    id: 1,
    start_weight: 182,
    target_weight: 165,
    target_date: null,
    daily_deficit: 500,
    created_at: '2026-07-01T00:00:00.000Z'
};

describe('GoalProgressCard', () => {
    it('combines the latest snapshot and goal projection in one card', () => {
        const onEditGoal = jest.fn();
        const screen = render(
            <GoalProgressCard
                goal={GOAL}
                latestMetric={{ id: 1, date: '2026-07-20', weight: 172 }}
                user={null}
                onEditGoal={onEditGoal}
            />
        );

        fireEvent.press(screen.getByLabelText('Edit goal'));

        expect(screen.getByText('Progress snapshot')).toBeTruthy();
        expect(screen.getByText('Goal projection')).toBeTruthy();
        expect(screen.getByText('172 kg')).toBeTruthy();
        expect(screen.getByText('59% complete')).toBeTruthy();
        expect(screen.getByText('Losing weight with a 500 kcal/day deficit.')).toBeTruthy();
        expect(onEditGoal).toHaveBeenCalledTimes(1);
    });

    it('describes a gain plan as an unsigned surplus', () => {
        const screen = render(
            <GoalProgressCard
                goal={{ ...GOAL, daily_deficit: -250, target_weight: 190 }}
                latestMetric={{ id: 1, date: '2026-07-20', weight: 184 }}
                user={null}
            />
        );

        expect(screen.getByText('Gaining weight with a 250 kcal/day surplus.')).toBeTruthy();
    });

    it('keeps a reached goal durable after a later fluctuation and offers the next-goal flow', () => {
        const onSetNextGoal = jest.fn();
        const screen = render(
            <GoalProgressCard
                goal={GOAL}
                latestMetric={{ id: 3, date: '2026-07-24', weight: 166 }}
                metrics={[
                    { id: 3, date: '2026-07-24', weight: 166 },
                    { id: 2, date: '2026-07-22', weight: 164.8 },
                    { id: 1, date: '2026-07-10', weight: 174 }
                ]}
                user={null}
                onSetNextGoal={onSetNextGoal}
            />
        );

        expect(screen.getByText('Reached')).toBeTruthy();
        expect(screen.getByText('Goal reached on Jul 22, 2026.')).toBeTruthy();
        expect(screen.getByText(
            'Your 500 kcal/day deficit plan remains active until you set another goal.'
        )).toBeTruthy();
        expect(screen.queryByText('Goal projection')).toBeNull();

        fireEvent.press(screen.getByLabelText('Set next goal'));
        expect(onSetNextGoal).toHaveBeenCalledTimes(1);
    });

    it('presents maintenance as ongoing without completion or projection semantics', () => {
        const maintenanceGoal: GoalEntry = {
            ...GOAL,
            target_weight: 170,
            daily_deficit: 0
        };
        const screen = render(
            <GoalProgressCard
                goal={maintenanceGoal}
                latestMetric={{ id: 2, date: '2026-07-24', weight: 170 }}
                metrics={[{ id: 2, date: '2026-07-24', weight: 170 }]}
                user={null}
            />
        );

        expect(screen.getByText('Ongoing')).toBeTruthy();
        expect(screen.getByText(
            'Maintenance is ongoing, with no completion percentage or projected end date.'
        )).toBeTruthy();
        expect(screen.queryByText(/% complete/)).toBeNull();
        expect(screen.queryByText('Goal projection')).toBeNull();
    });
});
