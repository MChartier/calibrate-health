import React from 'react';
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

    it('keeps the compact heading separate from continuous physical and accessible log targets', () => {
        const onPress = jest.fn();
        const screen = render(<FoodLogSummaryCard entries={ENTRIES} onPress={onPress} compact />);
        const heading = screen.getByRole('header', { name: 'Food log' });
        const header = screen.getByTestId('compact-food-log-header');
        const physicalTarget = screen.getByTestId('food-log-card-press-layer');
        const logAction = screen.getByLabelText(/Food log.+View full log/);
        const physicalTargetStyle = StyleSheet.flatten(physicalTarget.props.style);
        const logActionStyle = StyleSheet.flatten(logAction.props.style);

        expect(within(logAction).queryByRole('header')).toBeNull();
        expect(heading).toBeTruthy();
        expect(header.props.pointerEvents).toBe('none');
        expect(physicalTarget.props.accessible).toBe(false);
        expect(physicalTarget.props.tabIndex).toBe(-1);
        expect(physicalTargetStyle).toMatchObject({ top: 0, right: 0, bottom: 0, left: 0 });
        expect(logActionStyle.minHeight).toBe(themes.light.interaction.minimumTouchTarget);

        fireEvent.press(physicalTarget);
        fireEvent.press(logAction);
        expect(onPress).toHaveBeenCalledTimes(2);
    });
});
