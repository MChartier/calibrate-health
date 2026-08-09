import type { UserProfileResponse } from '@calibrate/api-client';
import { isProfileSetupComplete } from './profileCompletion';

const PROFILE: UserProfileResponse = {
    profile: {
        timezone: 'America/Los_Angeles',
        date_of_birth: '1985-05-12',
        sex: 'MALE',
        height_mm: 1800,
        activity_level: 'LIGHT',
        weight_unit: 'KG',
        height_unit: 'CM'
    },
    latest_weight_grams: 88_200,
    goal_daily_deficit: 500,
    calorie_target_adjustment: 0,
    calorieSummary: {
        missing: [],
        eligibility: {
            status: 'eligible',
            reasonCode: null,
            ageYears: 41,
            localDate: '2026-08-08'
        },
        planStatus: 'available',
        planReasonCode: null
    }
};

describe('profile setup completion redirect policy', () => {
    it('keeps eligible reviewed plans inside tabs and out of onboarding', () => {
        expect(isProfileSetupComplete({
            ...PROFILE,
            calorieSummary: {
                ...PROFILE.calorieSummary,
                missing: ['latest_weight'],
                planStatus: 'requires_review',
                planReasonCode: 'LATEST_WEIGHT_REQUIRED'
            }
        })).toBe(true);
    });

    it('keeps unavailable drafts, ineligible users, and old-server responses in onboarding', () => {
        expect(isProfileSetupComplete({
            ...PROFILE,
            goal_daily_deficit: null,
            calorieSummary: {
                ...PROFILE.calorieSummary,
                missing: ['goal'],
                planStatus: 'unavailable',
                planReasonCode: 'GOAL_REQUIRED'
            }
        })).toBe(false);
        expect(isProfileSetupComplete({
            ...PROFILE,
            calorieSummary: {
                ...PROFILE.calorieSummary,
                missing: ['eligibility'],
                eligibility: {
                    status: 'ineligible',
                    reasonCode: 'AGE_UNDER_18',
                    ageYears: 16,
                    localDate: '2026-08-08'
                },
                planStatus: 'requires_review',
                planReasonCode: 'AGE_UNDER_18'
            }
        })).toBe(false);
        expect(isProfileSetupComplete({
            ...PROFILE,
            calorieSummary: { missing: [] }
        })).toBe(false);
    });
});
