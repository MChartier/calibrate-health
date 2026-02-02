import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';

export type FoodLogDayStatus = {
    date: string;
    is_complete: boolean;
    completed_at: string | null;
};

export type FoodLogDayUpdatePayload = {
    date: string;
    is_complete: boolean;
};

/**
 * Build the canonical React Query key for a given local-day completion status.
 */
export function foodLogDayQueryKey(dateIso: string) {
    return ['food-day', dateIso] as const;
}

/**
 * Fetch completion status for the requested local date (`YYYY-MM-DD`).
 */
export async function fetchFoodLogDay(dateIso: string): Promise<FoodLogDayStatus> {
    const res = await axios.get('/api/food-days?date=' + encodeURIComponent(dateIso));
    return res.data as FoodLogDayStatus;
}

/**
 * Shared hook for loading a day's completion status.
 */
export function useFoodLogDayQuery(dateIso: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: foodLogDayQueryKey(dateIso),
        queryFn: () => fetchFoodLogDay(dateIso),
        enabled: options?.enabled
    });
}

/**
 * Update completion status for the requested local date (`YYYY-MM-DD`).
 */
export async function updateFoodLogDayStatus(payload: FoodLogDayUpdatePayload): Promise<FoodLogDayStatus> {
    const res = await axios.patch('/api/food-days', payload);
    return res.data as FoodLogDayStatus;
}

/**
 * Shared mutation for updating a day's completion status.
 */
export function useFoodLogDayMutation() {
    return useMutation({
        mutationFn: updateFoodLogDayStatus
    });
}
