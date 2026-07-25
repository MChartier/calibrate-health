import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { FoodLogEntry } from '@calibrate/api-client';
import { FoodLogSummaryCard } from './FoodLogSummaryCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const ENTRIES: FoodLogEntry[] = [
    { id: 1, meal_period: 'BREAKFAST', name: 'Oatmeal', calories: 300 },
    { id: 2, meal_period: 'DINNER', name: 'Salmon', calories: 500 },
    { id: 3, meal_period: 'BREAKFAST', name: 'Coffee', calories: 50 },
    { id: 4, meal_period: 'BREAKFAST', name: 'Berries', calories: 75 }
];

describe('FoodLogSummaryCard', () => {
    it('summarizes the meal containing the most recently logged entry', () => {
        const screen = render(<FoodLogSummaryCard entries={ENTRIES} onPress={jest.fn()} />);

        expect(screen.getByText('Breakfast')).toBeTruthy();
        expect(screen.getByText('425 kcal')).toBeTruthy();
        expect(screen.getByText('Oatmeal, Coffee +1 more')).toBeTruthy();
        expect(screen.queryByText('Dinner')).toBeNull();
    });

    it('keeps an empty day compact and offers the card-level add-food action', () => {
        const onAddFood = jest.fn();
        const screen = render(
            <FoodLogSummaryCard entries={[]} onPress={jest.fn()} onAddFood={onAddFood} />
        );

        expect(screen.getByText('Nothing logged yet')).toBeTruthy();
        expect(screen.getByText('Add a food to start this day.')).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Add food'));
        expect(onAddFood).toHaveBeenCalledTimes(1);
    });

    it('opens the full log when pressed', () => {
        const onPress = jest.fn();
        const screen = render(<FoodLogSummaryCard entries={ENTRIES} onPress={onPress} />);

        fireEvent.press(screen.getByLabelText('View full food log'));

        expect(onPress).toHaveBeenCalledTimes(1);
    });
});
