import { fireEvent, render } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import type { MyFoodSummary } from '@calibrate/api-client';
import { MEAL_PERIODS } from '@calibrate/shared';
import { createMyFoodSelection } from '../food/foodLogSelection';
import { FoodSelectionEditor } from './FoodSelectionEditor';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const savedFood: MyFoodSummary = {
    id: 12,
    type: 'FOOD',
    name: 'Greek yogurt',
    serving_size_quantity: 1,
    serving_unit_label: 'container',
    calories_per_serving: 120,
    is_pinned: true
};

describe('FoodSelectionEditor', () => {
    it('dismisses quantity input before returning to search results', () => {
        const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(jest.fn());
        const onCancel = jest.fn();
        const screen = render(
            <FoodSelectionEditor
                selection={createMyFoodSelection(savedFood)}
                date="2026-08-07"
                meal={MEAL_PERIODS.BREAKFAST}
                onCancel={onCancel}
                onSubmit={jest.fn()}
            />
        );

        fireEvent.press(screen.getByRole('button', { name: 'Back to food results' }));

        expect(dismiss).toHaveBeenCalledTimes(1);
        expect(onCancel).toHaveBeenCalledTimes(1);
        dismiss.mockRestore();
    });
});
