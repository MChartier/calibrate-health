import {
    describeCalibrationEvidence,
    formatCalorieBudgetInterval,
    formatWeightPace
} from './presentation';

describe('calibration presentation', () => {
    it('formats transparent intervals rather than showing false precision', () => {
        expect(formatCalorieBudgetInterval({ low: 2100.2, midpoint: 2210.6, high: 2325.1 }))
            .toBe('2,211 kcal higher (2,100 to 2,325)');
        expect(formatCalorieBudgetInterval({ low: -484.2, midpoint: -349.3, high: -188.1 }))
            .toBe('349 kcal lower (188 to 484)');
        expect(formatCalorieBudgetInterval({ low: -43.2, midpoint: -1.1, high: 42.7 }))
            .toBe('Near baseline (43 lower to 43 higher)');
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
