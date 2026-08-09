import { render } from '@testing-library/react-native';
import { processColor } from 'react-native';
import * as ReactNative from 'react-native';
import type { FoodLogDayStatus } from '@calibrate/api-client';
import { themes } from '../theme';
import { CalorieBalanceCard } from './CalorieBalanceCard';

describe('CalorieBalanceCard', () => {
    afterEach(() => jest.restoreAllMocks());

    it('leads with consumed, target, and remaining values while under target', () => {
        const screen = render(
            <CalorieBalanceCard
                totalCalories={1456}
                targetCalories={1820}
                dayStatus="OPEN"
                compact
            />
        );

        expect(screen.getByText('Consumed (kcal)', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByText('Target (kcal)', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByText('Remaining (kcal)', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByTestId('calorie-consumed-value', { includeHiddenElements: true }).props.children).toBe('1,456');
        expect(screen.getByTestId('calorie-target-value', { includeHiddenElements: true }).props.children).toBe('1,820');
        expect(screen.getByTestId('calorie-balance-value', { includeHiddenElements: true }).props.children).toBe('364');
        expect(screen.getByText('80%', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByText('Not fully logged', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByTestId('calorie-gauge-progress', { includeHiddenElements: true }).props.stroke.payload)
            .toEqual(processColor(themes.light.colors.primary));
    });

    it('keeps the gauge primary and the balance neutral at exactly target', () => {
        const screen = render(
            <CalorieBalanceCard
                totalCalories={1820}
                targetCalories={1820}
                dayStatus="COMPLETE"
                compact
            />
        );

        expect(screen.getByText('Remaining (kcal)', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByTestId('calorie-balance-value', { includeHiddenElements: true }).props.children).toBe('0');
        expect(screen.getByText('100%', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByTestId('calorie-gauge-progress', { includeHiddenElements: true }).props.stroke.payload)
            .toEqual(processColor(themes.light.colors.primary));
    });

    it('uses danger treatment only after calories are actually over target', () => {
        const screen = render(
            <CalorieBalanceCard
                totalCalories={2000}
                targetCalories={1820}
                dayStatus="OPEN"
                compact
            />
        );

        expect(screen.getByText('Over (kcal)', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByTestId('calorie-balance-value', { includeHiddenElements: true }).props.children).toBe('180');
        expect(screen.getByText('110%', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByTestId('calorie-gauge-progress', { includeHiddenElements: true }).props.stroke.payload)
            .toEqual(processColor(themes.light.colors.danger));
    });

    it.each([
        ['COMPLETE', false, 'Fully logged'],
        ['OPEN', false, 'Not fully logged'],
        ['INCOMPLETE', false, 'Not fully logged'],
        ['PAUSED', false, 'Paused'],
        ['PAUSED', true, 'Paused'],
        ['COMPLETE', true, 'Not fully logged']
    ] as const)(
        'shows only the standardized status for %s with failed=%s',
        (dayStatus, dayStatusFailed, expectedLabel) => {
            const screen = render(
                <CalorieBalanceCard
                    totalCalories={1456}
                    targetCalories={1820}
                    dayStatus={dayStatus as FoodLogDayStatus}
                    dayStatusFailed={dayStatusFailed}
                    compact
                />
            );

            expect(screen.getByText(expectedLabel, { includeHiddenElements: true })).toBeTruthy();
        }
    );

    it('provides one concise accessibility summary without requiring gauge interpretation', () => {
        const screen = render(
            <CalorieBalanceCard
                totalCalories={1456}
                targetCalories={1820}
                dayStatus="COMPLETE"
                compact
            />
        );

        expect(screen.getByLabelText(
            'Daily balance. 80% of target. 1,456 kcal consumed. 1,820 kcal target. 364 kcal remaining. Fully logged.'
        )).toBeTruthy();
    });

    it('keeps an unavailable plan text-first without rendering a misleading gauge', () => {
        const screen = render(
            <CalorieBalanceCard
                totalCalories={1456}
                targetCalories={null}
                dayStatus="OPEN"
                unavailableLabel="Plan needs review"
                compact
            />
        );

        expect(screen.getByTestId('calorie-consumed-value', { includeHiddenElements: true }).props.children).toBe('1,456');
        expect(screen.getByTestId('calorie-target-value', { includeHiddenElements: true }).props.children).toBe('-');
        expect(screen.getByTestId('calorie-balance-value', { includeHiddenElements: true }).props.children).toBe('-');
        expect(screen.getByText('Plan needs review', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.queryByTestId('calorie-gauge-progress', { includeHiddenElements: true })).toBeNull();
        expect(screen.getByLabelText(
            'Daily balance. 1,456 kcal consumed. Plan needs review. Not fully logged.'
        )).toBeTruthy();
    });

    it('removes vertical flex expansion from stacked metrics at 320px', () => {
        jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
            width: 320,
            height: 568,
            scale: 1,
            fontScale: 1
        });
        const screen = render(
            <CalorieBalanceCard
                totalCalories={1456}
                targetCalories={1820}
                dayStatus="OPEN"
                compact
            />
        );

        expect(screen.getByTestId('calorie-balance-metrics', { includeHiddenElements: true })).toHaveStyle({
            flexGrow: 0,
            flexBasis: 'auto'
        });
        expect(screen.getByTestId(
            'calorie-consumed-value-container',
            { includeHiddenElements: true }
        )).toHaveStyle({
            flexGrow: 0,
            flexShrink: 0,
            flexBasis: 'auto'
        });
    });});
