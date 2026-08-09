import type { UserProfileResponse } from '@calibrate/api-client';

/**
 * Shared by onboarding and protected tabs so reviewed historical plans stay recoverable in-app.
 */
export function isProfileSetupComplete(profile: UserProfileResponse | null | undefined): boolean {
    if (!profile) return false;
    const hasGoal = profile.goal_daily_deficit !== null && profile.goal_daily_deficit !== undefined;
    const isEligibleAdult = profile.calorieSummary.eligibility?.status === 'eligible';
    if (!hasGoal || !isEligibleAdult) return false;
    if (profile.calorieSummary.planStatus === 'requires_review') return true;
    return profile.calorieSummary.planStatus === 'available'
        && profile.calorieSummary.missing.length === 0;
}
