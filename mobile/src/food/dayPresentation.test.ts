import {
    getFoodDayStatusLabel,
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
