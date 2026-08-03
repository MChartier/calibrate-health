import {
    describeCalorieBudgetChange,
    describeCalorieBudgetEstimate,
    describeCalibrationEvidence,
    describeCalibrationEvidenceForReview,
    describeWeightPaceDirection,
    formatWeightPaceMagnitude
} from './presentation';

describe('calibration presentation', () => {
    it('formats the proposed daily budget change without ambiguous signs', () => {
        expect(describeCalorieBudgetChange(-150, 2132)).toBe('150 kcal less than your current 2,132 kcal budget.');
        expect(describeCalorieBudgetChange(150, 1900)).toBe('150 kcal more than your current 1,900 kcal budget.');
    });

    it('formats observed pace in the selected weight unit', () => {
        expect(formatWeightPaceMagnitude(-0.32, 'KG')).toBe('0.32 kg/week');
        expect(formatWeightPaceMagnitude(-0.32, 'LB')).toBe('0.71 lb/week');
        expect(describeWeightPaceDirection(-0.32)).toBe('loss');
        expect(describeWeightPaceDirection(0.32)).toBe('gain');
        expect(describeWeightPaceDirection(0)).toBe('stable');
    });

    it('explains why the bounded first step is smaller than the model estimate', () => {
        expect(describeCalorieBudgetEstimate(
            { low: -471, midpoint: -329, high: -199 },
            0,
            -150
        )).toEqual({
            signal: 'Based on this history, a budget about 329 kcal lower than your current budget could bring your pace closer to plan if the recent pattern continues.',
            range: 'The estimate could reasonably be 199-471 kcal lower.',
            firstStepLabel: 'Recommended first step',
            firstStep: 'Food logs and short-term scale trends are imperfect, so Calibrate limits this first change to 150 kcal per day to avoid overcorrecting. Your next pace check will use the new trend before suggesting another change.'
        });
        expect(describeCalorieBudgetEstimate(
            { low: -20, midpoint: 0, high: 20 },
            -150,
            150
        )?.signal).toContain('about 150 kcal higher');
    });

    it('explains when the BMR-based limit makes the proposed decrease smaller', () => {
        expect(describeCalorieBudgetEstimate(
            { low: -347, midpoint: -302, high: -255 },
            0,
            -100,
            1900
        )).toEqual({
            signal: 'Based on this history, a budget about 302 kcal lower than your current budget could bring your pace closer to plan if the recent pattern continues.',
            range: 'The estimate could reasonably be 255-347 kcal lower.',
            firstStepLabel: 'Safety limit',
            firstStep: "Calibrate's BMR-based limit caps this suggestion at 1,900 kcal, so the proposed change is 100 kcal less per day. Calibrate will not suggest a lower budget."
        });
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
        } as never)).toBe('16 well-tracked food days | 9 weigh-ins across 20 days | 5 days with uncertain food logs');
        expect(describeCalibrationEvidenceForReview({
            selectedWindowDays: 21,
            dataQuality: {
                observationDays: 21,
                completeDays: 21,
                confidentDays: 21,
                suspiciousDays: 0,
                incompleteDays: 0,
                missingDays: 0,
                weightPoints: 21,
                weightSpanDays: 21
            }
        } as never)).toBe('This review uses 21 well-tracked food days and 21 weigh-ins across 21 days.');
        expect(describeCalibrationEvidence({
            selectedWindowDays: 14,
            dataQuality: {
                observationDays: 14,
                completeDays: 14,
                confidentDays: 14,
                suspiciousDays: 0,
                incompleteDays: 0,
                missingDays: 0,
                weightPoints: 1,
                weightSpanDays: 1
            }
        } as never)).toBe('14 well-tracked food days | 1 weigh-in across 1 day | 0 days with uncertain food logs');
    });
});
