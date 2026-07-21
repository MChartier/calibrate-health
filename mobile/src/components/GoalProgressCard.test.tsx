import React from 'react';
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
    it('keeps the goal action available after the progress content', () => {
        const onEditGoal = jest.fn();
        const screen = render(
            <GoalProgressCard
                title="Goal projection"
                goal={GOAL}
                latestMetric={{ id: 1, date: '2026-07-20', weight: 172 }}
                user={null}
                onEditGoal={onEditGoal}
            />
        );

        fireEvent.press(screen.getByLabelText('Set a new goal'));

        expect(screen.getByText('Goal projection')).toBeTruthy();
        expect(screen.getByText('Current 172 kg')).toBeTruthy();
        expect(onEditGoal).toHaveBeenCalledTimes(1);
    });
});
