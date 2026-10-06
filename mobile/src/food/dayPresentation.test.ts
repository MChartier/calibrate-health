import {
    getFoodDayStatusLabel,
    getFoodDayCalorieTarget,
    shouldEmphasizePausedStatus,
    shouldShowCalorieComparison
} from './dayPresentation';

describe('day calorie presentation', () => {
    it.each([
        ['COMPLETE', 'Fully logged'],
        ['OPEN', 'Not fully logged'],
        ['INCOMPLETE', 'Not fully logged'],
        ['PAUSED', 'Paused'],
        [undefined, 'Not fully logged']
    ] as const)('maps %s to the standardized day status', (status, label) => {
        expect(getFoodDayStatusLabel({ status })).toBe(label);
    });

    it('never presents failed day data as fully logged', () => {
        expect(getFoodDayStatusLabel({ status: 'COMPLETE', failed: true })).toBe('Not fully logged');
        expect(getFoodDayStatusLabel({ status: 'PAUSED', failed: true })).toBe('Paused');
    });
    it('shows the real balance for open days that have food data', () => {
        expect(shouldShowCalorieComparison({
            status: 'OPEN',
            isToday: false,
            hasFoodEntries: true
        })).toBe(true);
    });

    it('keeps blank past open days unresolved', () => {
        expect(shouldShowCalorieComparison({
            status: 'OPEN',
            isToday: false,
            hasFoodEntries: false
        })).toBe(false);
    });

    it.each(['INCOMPLETE', 'PAUSED'] as const)('does not interpret %s days against the target', (status) => {
        expect(shouldShowCalorieComparison({
            status,
            isToday: false,
            hasFoodEntries: true
        })).toBe(false);
    });

    it('emphasizes a settled paused status when it is the only calorie content for today', () => {
        expect(shouldEmphasizePausedStatus({
            status: 'PAUSED',
            isToday: true,
            hasFoodEntries: false,
            isContentLoading: false
        })).toBe(true);
    });

    it.each([
        { isToday: false, hasFoodEntries: false, isContentLoading: false },
        { isToday: true, hasFoodEntries: true, isContentLoading: false },
        { isToday: true, hasFoodEntries: false, isContentLoading: true }
    ])('keeps the regular paused layout when other day content or loading state is present', (state) => {
        expect(shouldEmphasizePausedStatus({
            status: 'PAUSED',
            ...state
        })).toBe(false);
    });
});


test('completed-day balance keeps its saved target after a pace change; unknown history stays unknown', () => {
    const day = { status: 'COMPLETE', calorie_comparison: { target_kcal: 2000 } } as import('@calibrate/api-client').FoodLogDay;
    expect(getFoodDayCalorieTarget({day,isToday:false,currentTarget:2350})).toBe(2000);
    expect(getFoodDayCalorieTarget({day,isToday:true,currentTarget:2350})).toBe(2000);
    expect(getFoodDayCalorieTarget({day:{...day,calorie_comparison:null},isToday:false,currentTarget:2350})).toBeNull();
    expect(getFoodDayCalorieTarget({day:{...day,status:'OPEN'},isToday:true,currentTarget:2350})).toBe(2350);
    expect(getFoodDayCalorieTarget({day:{...day,status:'OPEN'},isToday:false,currentTarget:2350})).toBeNull();
});
