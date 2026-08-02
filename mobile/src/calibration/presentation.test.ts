import {
    describeCalibrationEvidence,
    formatCalorieBudgetChange,
    formatWeightPace
} from './presentation';

describe('calibration presentation', () => {
    it('formats the proposed daily budget change without ambiguous signs', () => {
        expect(formatCalorieBudgetChange(-150)).toBe('150 kcal less/day');
        expect(formatCalorieBudgetChange(150)).toBe('150 kcal more/day');
        expect(formatCalorieBudgetChange(0)).toBe('No change');
    });

    it('formats observed pace in the selected weight unit', () => {
        expect(formatWeightPace({ low: -0.5, midpoint: -0.32, high: -0.1 }, 'KG')).toBe('-0.32 kg/week');
        expect(formatWeightPace({ low: -0.5, midpoint: -0.32, high: -0.1 }, 'LB')).toBe('-0.71 lb/week');
    });

    it('summarizes confident and uncertain history', () => {
        expect(describeCalibrationEvidence({
            selectedWindowDays: 21,
            dataQuality: {
                observationDays: 21,
                completeDays: 18,
                confidentDays: 16,
                suspiciousDays: 2,
                incompleteDays: 1,
                missingDays: 2,
                weightPoints: 9,
                weightSpanDays: 20
            }
        } as never)).toBe('16 confident food days | 9 weights across 20 days | 5 uncertain days');
    });
});
