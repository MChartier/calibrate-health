import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { MetricEntry } from '@calibrate/api-client';
import { TodayWeightCard } from './TodayWeightCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const TODAY_METRIC: MetricEntry = {
    id: 1,
    date: '2026-07-21T00:00:00.000Z',
    weight: 168.2
};

describe('TodayWeightCard', () => {
    it("shows today's saved weight and offers to edit it", () => {
        const onPress = jest.fn();
        const screen = render(
            <TodayWeightCard metric={TODAY_METRIC} weightUnit="LB" isToday onPress={onPress} />
        );

        expect(screen.getByText("Today's weight")).toBeTruthy();
        expect(screen.getByText('168.2 lb')).toBeTruthy();
        expect(screen.getByText('Logged today')).toBeTruthy();
        expect(screen.getByText('Edit')).toBeTruthy();

        fireEvent.press(screen.getByRole('button'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('offers a focused weigh-in action when today has no measurement', () => {
        const screen = render(
            <TodayWeightCard metric={null} weightUnit="KG" isToday onPress={jest.fn()} />
        );

        expect(screen.getByText('No weigh-in yet')).toBeTruthy();
        expect(screen.getByText("Add today's measurement")).toBeTruthy();
        expect(screen.getByText('Log')).toBeTruthy();
        expect(screen.getByLabelText("Today's weight. No weigh-in yet. Log weight")).toBeTruthy();
    });

    it('uses day-specific copy when browsing a previous date', () => {
        const screen = render(
            <TodayWeightCard metric={TODAY_METRIC} weightUnit="LB" isToday={false} onPress={jest.fn()} />
        );

        expect(screen.getByText('Weight')).toBeTruthy();
        expect(screen.getByText('Logged for this day')).toBeTruthy();
    });
});
