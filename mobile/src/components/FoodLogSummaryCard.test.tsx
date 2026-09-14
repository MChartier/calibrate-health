import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { FoodLogEntry } from '@calibrate/api-client';
import { FoodLogSummaryCard } from './FoodLogSummaryCard';
import { themes } from '../theme';

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
        const onPress = jest.fn();
        const screen = render(
            <FoodLogSummaryCard entries={[]} onPress={onPress} onAddFood={onAddFood} />
        );

        expect(screen.getByText('Nothing logged yet')).toBeTruthy();
        expect(screen.getByText('Add a food to start this day.')).toBeTruthy();

        const primaryTarget = screen.getByTestId('food-log-card-press-layer');
        const secondaryRegion = screen.getByTestId('food-log-card-secondary-region');
        expect(within(primaryTarget).queryByRole('button', { name: 'Add food' })).toBeNull();
        expect(within(secondaryRegion).getByRole('button', { name: 'Add food' })).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Add food'));
        expect(onAddFood).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
    });

    it('opens the full log when pressed', () => {
        const onPress = jest.fn();
        const screen = render(<FoodLogSummaryCard entries={ENTRIES} onPress={onPress} />);

        fireEvent.press(screen.getByLabelText(/Food log.+View full log/));
        expect(screen.queryByRole('button', { name: 'View food log' })).toBeNull();
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('keeps the label and preview inside one full-row navigation target', () => {
        const onPress = jest.fn();
        const screen = render(<FoodLogSummaryCard entries={ENTRIES} onPress={onPress} />);
        const target = screen.getByTestId('food-log-card-press-layer');
        const targetStyle = StyleSheet.flatten(target.props.style);

        expect(within(target).queryByRole('header')).toBeNull();
        expect(within(target).getByText('Food log')).toBeTruthy();
        expect(screen.getByLabelText(/Food log.+View full log/)).toBe(target);
        expect(targetStyle).toMatchObject({
            minHeight: themes.light.interaction.minimumTouchTarget,
            flex: 1
        });

        fireEvent(target, 'hoverIn');
        expect(target).toHaveStyle({ backgroundColor: themes.light.colors.surfaceHovered });
        fireEvent(target, 'hoverOut');
        fireEvent.press(target);
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('allows compact meal details to wrap instead of clipping scaled text', () => {
        const screen = render(<FoodLogSummaryCard entries={ENTRIES} onPress={jest.fn()} />);

        expect(screen.getByText('Breakfast').props.numberOfLines).toBeUndefined();
        expect(screen.getByText('425 kcal').props.numberOfLines).toBeUndefined();
        expect(screen.getByText('Oatmeal, Coffee +1 more').props.numberOfLines).toBeUndefined();
    });
});
