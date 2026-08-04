import { fireEvent, render } from '@testing-library/react-native';
import type { FoodLogEntry } from '@calibrate/api-client';
import { FoodLogTimelineCard } from './FoodLogTimelineCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const MORNING_SNACK_ENTRY: FoodLogEntry = {
    id: 1,
    meal_period: 'MORNING_SNACK',
    name: 'Oatmeal',
    calories: 350
};

const LEGACY_GRAMS_ENTRY: FoodLogEntry = {
    id: 2,
    meal_period: 'DINNER',
    name: 'Greek yogurt',
    calories: 84,
    servings_consumed: 1.42,
    serving_unit_label_snapshot: '100g',
    calories_per_serving_snapshot: 59,
    measure_label_snapshot: 'per 100g',
    grams_per_measure_snapshot: 100,
    measure_quantity_snapshot: 1.42,
    grams_total_snapshot: 142
};

describe('FoodLogTimelineCard', () => {
    it('leaves the detailed page add-food entry point to its FAB', () => {
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

    it('shows the real snapshot amount after expanding a meal', () => {
        const { getByLabelText, getByText } = render(
            <FoodLogTimelineCard
                entries={[LEGACY_GRAMS_ENTRY]}
                onEditEntry={jest.fn()}
                onDeleteEntry={jest.fn()}
            />
        );

        fireEvent.press(getByLabelText('Expand Dinner'));
        expect(getByText('142 g')).toBeTruthy();
    });

    it('offers an independently enabled save-recipe action under an expanded meal', () => {
        const onSaveMealAsRecipe = jest.fn();
        const { getByLabelText, getByText } = render(
            <FoodLogTimelineCard
                entries={[MORNING_SNACK_ENTRY]}
                disabled
                onEditEntry={jest.fn()}
                onDeleteEntry={jest.fn()}
                onSaveMealAsRecipe={onSaveMealAsRecipe}
            />
        );

        fireEvent.press(getByLabelText('Expand Morning Snack'));
        fireEvent.press(getByText('Save as recipe'));

        expect(onSaveMealAsRecipe).toHaveBeenCalledWith('MORNING_SNACK', [MORNING_SNACK_ENTRY]);
    });
});
