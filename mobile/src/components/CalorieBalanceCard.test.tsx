import { render } from '@testing-library/react-native';
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
            '364 kcal remaining. 1,456 eaten out of 1,820 calorie target.'
        )).toBeTruthy();
    });
});
