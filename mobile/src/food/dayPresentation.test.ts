import { shouldShowCalorieComparison } from './dayPresentation';

describe('day calorie presentation', () => {
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
});
