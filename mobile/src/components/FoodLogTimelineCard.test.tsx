import React from 'react';
import { render } from '@testing-library/react-native';
import type { FoodLogEntry } from '@calibrate/api-client';
import { FoodLogTimelineCard } from './FoodLogTimelineCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const MORNING_SNACK_ENTRY: FoodLogEntry = {
    id: 1,
    meal_period: 'MORNING_SNACK',
    name: 'Oatmeal',
    calories: 350
};

describe('FoodLogTimelineCard', () => {
    it('uses the persistent FAB as the only add-food entry point', () => {
        const { queryByLabelText, getByLabelText } = render(
            <FoodLogTimelineCard
                entries={[MORNING_SNACK_ENTRY]}
                onEditEntry={jest.fn()}
                onDeleteEntry={jest.fn()}
            />
        );

        expect(queryByLabelText(/Add food to/)).toBeNull();
        expect(getByLabelText('Expand Morning Snack')).toBeTruthy();
        expect(queryByLabelText('Expand Breakfast')).toBeNull();
    });
});
