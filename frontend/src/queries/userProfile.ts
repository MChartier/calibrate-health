import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export type UserProfile = {
    timezone: string;
    date_of_birth: string | null;
    sex: 'MALE' | 'FEMALE' | null;
    height_mm: number | null;
    activity_level: 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE' | null;
    weight_unit: 'KG' | 'LB';
    height_unit: 'CM' | 'FT_IN';
};

export type CalorieSummary = {
    dailyCalorieTarget?: number;
    tdee?: number;
    bmr?: number;
    deficit?: number | null;
    missing: string[];
};

export type UserProfileResponse = {
    profile: UserProfile;
    latest_weight_grams: number | null;
    goal_daily_deficit: number | null;
    calorieSummary: CalorieSummary;
};

/**
 * Fetch the authenticated user's profile and derived calorie summary from the backend.
 */
export async function fetchUserProfile(): Promise<UserProfileResponse> {
    const res = await axios.get('/api/user/profile');
    return res.data;
}

/**
 * Shared React Query hook for the authenticated user's profile + calorie summary.
 *
 * Using a single query key keeps caching consistent across the app (dashboard, log, history, onboarding).
 */
export function useUserProfileQuery(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['user-profile'],
        queryFn: fetchUserProfile,
        enabled: options?.enabled
    });
}
