import type { UserProfileResponse } from '@calibrate/api-client';

/**
 * Mirror the PWA protected-route check: tabs need enough profile and goal data to compute calorie targets.
 */
export function isProfileSetupComplete(profile: UserProfileResponse | null | undefined): boolean {
    if (!profile) return false;
    const hasTimezone = typeof profile.profile.timezone === 'string' && profile.profile.timezone.trim().length > 0;
    const hasGoal = profile.goal_daily_deficit !== null && profile.goal_daily_deficit !== undefined;
    return hasTimezone && hasGoal && profile.calorieSummary.missing.length === 0;
}
