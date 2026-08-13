import { render } from '@testing-library/react-native';
import { processColor } from 'react-native';
import { themes } from '../theme';
import { CalorieBalanceCard } from './CalorieBalanceCard';

describe('CalorieBalanceCard', () => {
    it('keeps the card focused on percentage eaten and calories remaining', () => {
        const screen = render(
            <CalorieBalanceCard totalCalories={1456} targetCalories={1820} compact />
        );

        expect(screen.getByText('80%', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByText('eaten', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByText('364')).toBeTruthy();
        expect(screen.getByText('kcal remaining')).toBeTruthy();
        expect(screen.queryByText('Eaten')).toBeNull();
        expect(screen.queryByText('Target')).toBeNull();
    });

    it('retains the detailed calorie bookkeeping in the accessibility summary', () => {
        const screen = render(
            <CalorieBalanceCard totalCalories={1456} targetCalories={1820} compact />
        );

        expect(screen.getByLabelText(
            'Daily balance. 364 kcal remaining. 1,456 eaten out of 1,820 calorie target.'
        )).toBeTruthy();
    });

    it('keeps neutral progress styling through target and uses danger only when over', () => {
        const atTarget = render(
            <CalorieBalanceCard totalCalories={1820} targetCalories={1820} compact />
        );

        expect(atTarget.getByTestId('calorie-balance-value', { includeHiddenElements: true }).props.children).toBe('0');
        expect(atTarget.getByTestId('calorie-gauge-progress', { includeHiddenElements: true }).props.stroke.payload)
            .toEqual(processColor(themes.light.colors.primary));

        atTarget.unmount();
        const overTarget = render(
            <CalorieBalanceCard totalCalories={2000} targetCalories={1820} compact />
        );
        expect(overTarget.getByTestId('calorie-balance-value', { includeHiddenElements: true }).props.children).toBe('180');
        expect(overTarget.getByText('kcal over target')).toBeTruthy();
        expect(overTarget.getByTestId('calorie-gauge-progress', { includeHiddenElements: true }).props.stroke.payload)
            .toEqual(processColor(themes.light.colors.danger));
    });

    it('keeps an unavailable target out of the gauge without losing logged calories', () => {
        const screen = render(
            <CalorieBalanceCard
                totalCalories={1456}
                targetCalories={null}
                unavailableLabel="Plan needs review"
                compact
            />
        );

        expect(screen.getByText('Plan needs review')).toBeTruthy();
        expect(screen.getByText('1,456 kcal logged')).toBeTruthy();
        expect(screen.queryByTestId('calorie-gauge-progress', { includeHiddenElements: true })).toBeNull();
    });
});
