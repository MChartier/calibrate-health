import { fireEvent, render } from '@testing-library/react-native';
import type { FoodLogEntry } from '@calibrate/api-client';
import { TodayFoodPreview } from './TodayFoodPreview';
import { themes } from '../theme';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const ENTRIES: FoodLogEntry[] = [
    { id: 1, meal_period: 'DINNER', name: 'Salmon', calories: 300 },
    { id: 2, meal_period: 'BREAKFAST', name: 'Oatmeal', calories: 200 },
    { id: 3, meal_period: 'DINNER', name: 'Potatoes', calories: 210 },
    { id: 4, meal_period: 'DINNER', name: 'Green beans with a long preparation description', calories: 110 }
];

function layout(target: Parameters<typeof fireEvent>[0], width: number, height: number) {
    fireEvent(target, 'layout', { nativeEvent: { layout: { width, height, x: 0, y: 0 } } });
}

describe('TodayFoodPreview', () => {
    it('has one full-area navigation target, hover feedback, and an actionable empty state', () => {
        const onPress = jest.fn();
        const screen = render(<TodayFoodPreview entries={[]} onPress={onPress} />);
        const preview = screen.getByRole('button', { name: 'Food log. 0 items. View full log' });
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(screen.getByText("Start today's food log")).toBeTruthy();
        expect(preview).toHaveStyle({ minHeight: 124 });
        fireEvent(preview, 'hoverIn');
        expect(preview).toHaveStyle({ backgroundColor: themes.light.colors.surfaceHovered });
        fireEvent.press(preview);
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('measures wrapped rows without exposing duplicate content and omits only complete earlier items', () => {
        const screen = render(<TodayFoodPreview entries={ENTRIES} onPress={jest.fn()} />);
        layout(screen.getByTestId('food-preview-body'), 288, 132);
        const hidden = { includeHiddenElements: true };
        layout(screen.getByTestId('food-preview-measure-omission', hidden), 288, 20);
        layout(screen.getByTestId('food-preview-measure-meal-BREAKFAST', hidden), 288, 24);
        layout(screen.getByTestId('food-preview-measure-meal-DINNER', hidden), 288, 24);
        for (const entry of ENTRIES) {
            layout(screen.getByTestId(`food-preview-measure-entry-${entry.id}`, hidden), 288, entry.id === 4 ? 52 : 28);
        }
        expect(screen.getByText('2 earlier items in log')).toBeTruthy();
        expect(screen.queryByText('Breakfast')).toBeNull();
        expect(screen.queryByText('Salmon')).toBeNull();
        expect(screen.getByText('Potatoes')).toBeTruthy();
        expect(screen.getByText(ENTRIES[3].name).props.numberOfLines).toBeUndefined();
        expect(screen.getByText('620 kcal')).toBeTruthy();
        expect(screen.getAllByRole('button')).toHaveLength(1);
        const visible = screen.getAllByTestId(/^food-preview-entry-/);
        expect(visible.map((entry) => entry.props.testID)).toEqual(['food-preview-entry-3', 'food-preview-entry-4']);
    });

    it('re-fits on a shorter region without changing measurements or clipping the newest row', () => {
        const screen = render(<TodayFoodPreview entries={ENTRIES} onPress={jest.fn()} />);
        layout(screen.getByTestId('food-preview-body'), 288, 132);
        const hidden = { includeHiddenElements: true };
        layout(screen.getByTestId('food-preview-measure-omission', hidden), 288, 20);
        for (const meal of ['BREAKFAST', 'DINNER']) layout(screen.getByTestId(`food-preview-measure-meal-${meal}`, hidden), 288, 24);
        for (const entry of ENTRIES) layout(screen.getByTestId(`food-preview-measure-entry-${entry.id}`, hidden), 288, entry.id === 4 ? 52 : 28);
        layout(screen.getByTestId('food-preview-body'), 288, 90);
        expect(screen.getByText('4 items in log')).toBeTruthy();
        expect(screen.queryByText(ENTRIES[3].name)).toBeNull();
    });

    it('shows all chronological rows with unbounded wrapping in the enlarged-text scroll layout', () => {
        const screen = render(<TodayFoodPreview entries={ENTRIES} onPress={jest.fn()} expanded />);
        expect(screen.getAllByTestId(/^food-preview-entry-/).map((entry) => entry.props.testID)).toEqual([
            'food-preview-entry-2', 'food-preview-entry-1', 'food-preview-entry-3', 'food-preview-entry-4'
        ]);
        expect(screen.queryByTestId('food-preview-measurements')).toBeNull();
        expect(screen.queryByText(/earlier items/)).toBeNull();
        expect(screen.getByText(ENTRIES[3].name).props.numberOfLines).toBeUndefined();
    });
});
