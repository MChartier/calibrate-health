import { describeCalibrationEvidence, formatCalorieInterval, formatWeightPace } from './presentation';

describe('calibration presentation', () => {
    it('formats transparent intervals rather than showing false precision', () => {
        expect(formatCalorieInterval({ low: 2100.2, midpoint: 2210.6, high: 2325.1 }))
            .toBe('2,211 kcal (2,100-2,325)');
        expect(formatWeightPace({ low: -0.5, midpoint: -0.32, high: -0.1 })).toBe('-0.32 kg/week');
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
        } as never)).toBe('16 confident food days | 9 weights across 20 days | 3 uncertain days');
    });
});
