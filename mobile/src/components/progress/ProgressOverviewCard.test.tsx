import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ProgressOverviewCard } from './ProgressOverviewCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const BASE_PROPS = {
    latestMetric: { id: 1, date: '2026-07-20', weight: 168.2 },
    user: null,
    onLogWeight: jest.fn()
};

describe('ProgressOverviewCard', () => {
    beforeEach(() => {
        BASE_PROPS.onLogWeight.mockClear();
    });

    it('offers to log weight when today has no entry', () => {
        const screen = render(<ProgressOverviewCard {...BASE_PROPS} hasWeightToday={false} />);

        fireEvent.press(screen.getByLabelText('Log weight'));

        expect(screen.getByText('Log')).toBeTruthy();
        expect(BASE_PROPS.onLogWeight).toHaveBeenCalledTimes(1);
    });

    it("offers to edit today's existing entry", () => {
        const screen = render(<ProgressOverviewCard {...BASE_PROPS} hasWeightToday />);

        fireEvent.press(screen.getByLabelText("Edit today's weight"));

        expect(screen.getByText('Edit')).toBeTruthy();
        expect(BASE_PROPS.onLogWeight).toHaveBeenCalledTimes(1);
    });

    it('stays focused on the latest weigh-in instead of repeating goal progress', () => {
        const screen = render(<ProgressOverviewCard {...BASE_PROPS} hasWeightToday={false} />);

        expect(screen.getByText('Current weight')).toBeTruthy();
        expect(screen.getByText('168.2 kg')).toBeTruthy();
        expect(screen.queryByText('Goal progress')).toBeNull();
    });
});
