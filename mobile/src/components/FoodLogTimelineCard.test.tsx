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
    it('omits unlogged meals and leaves the detailed page add-food entry point to its FAB', () => {
        const { queryByLabelText, queryByText, getByLabelText, getByText } = render(
            <FoodLogTimelineCard
                entries={[MORNING_SNACK_ENTRY]}
                onEditEntry={jest.fn()}
                onDeleteEntry={jest.fn()}
            />
        );

        expect(queryByLabelText(/Add food to/)).toBeNull();
        expect(getByLabelText('Collapse Morning Snack')).toBeTruthy();
        expect(getByText('Oatmeal')).toBeTruthy();
        expect(queryByLabelText('Expand Breakfast')).toBeNull();
        expect(queryByText('Breakfast')).toBeNull();
        expect(queryByText('Lunch')).toBeNull();
        expect(queryByText('Dinner')).toBeNull();
    });

    it('shows the real snapshot amount after expanding a meal', () => {
        const { getByLabelText, getByText } = render(
            <FoodLogTimelineCard
                entries={[LEGACY_GRAMS_ENTRY]}
                onEditEntry={jest.fn()}
                onDeleteEntry={jest.fn()}
            />
        );

        expect(getByLabelText('Collapse Dinner')).toBeTruthy();
        expect(getByText('142 g')).toBeTruthy();
    });

    it('offers an independently enabled save-recipe action under an expanded meal', () => {
        const onSaveMealAsRecipe = jest.fn();
        const { getByText } = render(
            <FoodLogTimelineCard
                entries={[MORNING_SNACK_ENTRY]}
                disabled
                onEditEntry={jest.fn()}
                onDeleteEntry={jest.fn()}
                onSaveMealAsRecipe={onSaveMealAsRecipe}
            />
        );

        fireEvent.press(getByText('Save as recipe'));

        expect(onSaveMealAsRecipe).toHaveBeenCalledWith('MORNING_SNACK', [MORNING_SNACK_ENTRY]);
    });

    it('exposes accessible meal and day copy actions only for populated content', () => {
        const onCopyMeal = jest.fn();
        const onCopyDay = jest.fn();
        const { getByRole, queryByLabelText } = render(
            <FoodLogTimelineCard
                entries={[MORNING_SNACK_ENTRY]}
                onEditEntry={jest.fn()}
                onDeleteEntry={jest.fn()}
                onCopyMeal={onCopyMeal}
                onCopyDay={onCopyDay}
            />
        );

        fireEvent.press(getByRole('button', { name: 'Copy Morning Snack' }));
        fireEvent.press(getByRole('button', { name: 'Copy day' }));

        expect(onCopyMeal).toHaveBeenCalledWith('MORNING_SNACK');
        expect(onCopyDay).toHaveBeenCalledTimes(1);
        expect(queryByLabelText('Copy Breakfast')).toBeNull();
    });

    it('disables online-only copy without blocking queued edit and delete actions', () => {
        const { getByRole } = render(
            <FoodLogTimelineCard
                entries={[MORNING_SNACK_ENTRY]}
                copyDisabled
                onEditEntry={jest.fn()}
                onDeleteEntry={jest.fn()}
                onCopyMeal={jest.fn()}
                onCopyDay={jest.fn()}
            />
        );

        expect(getByRole('button', { name: 'Copy Morning Snack' })).toBeDisabled();
        expect(getByRole('button', { name: 'Copy day' })).toBeDisabled();
        expect(getByRole('button', { name: 'Edit Oatmeal' })).toBeEnabled();
        expect(getByRole('button', { name: 'Delete Oatmeal' })).toBeEnabled();
    });
});
