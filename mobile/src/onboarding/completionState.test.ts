import { ACTIVITY_LEVELS, HEIGHT_UNITS, WEIGHT_UNITS } from '@calibrate/shared';
import { buildOnboardingCompleteData, type OnboardingFormState } from './completionState';

const FORM: OnboardingFormState = {
    weightUnit: WEIGHT_UNITS.KG,
    heightUnit: HEIGHT_UNITS.CM,
    timezone: ' America/Los_Angeles ',
    dateOfBirth: '1990-04-12',
    sex: 'FEMALE',
    activityLevel: ACTIVITY_LEVELS.MODERATE,
    currentWeight: '79.4',
    targetWeight: '76',
    goalMode: 'lose',
    dailyChangeAbs: '500',
    heightCm: '168',
    heightFeet: '',
    heightInches: ''
};

describe('onboarding completion state', () => {
    it('builds the one canonical payload submitted by atomic completion', () => {
        expect(buildOnboardingCompleteData(FORM)).toEqual({
            weight_unit: 'KG',
            height_unit: 'CM',
            timezone: 'America/Los_Angeles',
            date_of_birth: '1990-04-12',
            sex: 'FEMALE',
            height_mm: 1680,
            activity_level: 'MODERATE',
            current_weight_grams: 79400,
            target_weight_grams: 76000,
            daily_deficit: 500
        });
    });
});