import { ACTIVITY_LEVELS, HEIGHT_UNITS, WEIGHT_UNITS } from '@calibrate/shared';
import type { OnboardingDraft } from '@calibrate/api-client';
import {
    buildOnboardingCompleteData,
    buildOnboardingDraftData,
    hydrateOnboardingDraft,
    type OnboardingFormState
} from './draftState';

const FORM: OnboardingFormState = {
    weightUnit: WEIGHT_UNITS.LB,
    heightUnit: HEIGHT_UNITS.FT_IN,
    timezone: 'America/Los_Angeles',
    dateOfBirth: '1985-05-12',
    sex: 'MALE',
    activityLevel: ACTIVITY_LEVELS.LIGHT,
    currentWeight: '180.0',
    targetWeight: '165.0',
    goalMode: 'lose',
    dailyChangeAbs: '500',
    heightCm: '',
    heightFeet: '5',
    heightInches: '11'
};

describe('versioned onboarding draft state', () => {
    it('persists only sections the user has validated', () => {
        expect(buildOnboardingDraftData(FORM, 'goal')).toEqual({
            weight_unit: 'LB',
            height_unit: 'FT_IN',
            current_weight_grams: 81647,
            target_weight_grams: 74843
        });
        expect(buildOnboardingDraftData(FORM, 'burn')).toEqual(expect.objectContaining({
            timezone: 'America/Los_Angeles',
            date_of_birth: '1985-05-12',
            sex: 'MALE',
            activity_level: 'LIGHT',
            height_mm: 1803
        }));
        expect(buildOnboardingDraftData(FORM, 'burn')).not.toHaveProperty('daily_deficit');
    });

    it('hydrates canonical values and resumes the server-selected step', () => {
        const draft: OnboardingDraft = {
            schema_version: 1,
            revision: 4,
            current_step: 'burn',
            data: {
                weight_unit: 'LB',
                height_unit: 'FT_IN',
                timezone: 'America/New_York',
                date_of_birth: '1985-05-12',
                sex: 'MALE',
                current_weight_grams: 81647,
                target_weight_grams: 74843
            },
            created_at: '2026-08-09T12:00:00.000Z',
            updated_at: '2026-08-09T12:02:00.000Z'
        };

        expect(hydrateOnboardingDraft(draft, {
            weightUnit: 'KG',
            heightUnit: 'CM',
            timezone: 'UTC'
        })).toEqual(expect.objectContaining({
            weightUnit: 'LB',
            heightUnit: 'FT_IN',
            timezone: 'America/New_York',
            currentWeight: '180.0',
            targetWeight: '165.0',
            goalMode: 'lose',
            resumeStep: 'burn'
        }));
    });

    it('builds the complete canonical payload used for idempotent completion', () => {
        expect(buildOnboardingCompleteData(FORM)).toEqual({
            weight_unit: 'LB',
            height_unit: 'FT_IN',
            timezone: 'America/Los_Angeles',
            date_of_birth: '1985-05-12',
            sex: 'MALE',
            activity_level: 'LIGHT',
            height_mm: 1803,
            current_weight_grams: 81647,
            target_weight_grams: 74843,
            daily_deficit: 500
        });
    });
});
