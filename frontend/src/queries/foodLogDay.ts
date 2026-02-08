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

export type FoodLogDayRangeStatus = {
    start_date: string;
    end_date: string;
    days: FoodLogDayStatus[];
};

const FOOD_LOG_DAY_RANGE_QUERY_KEY_PREFIX = ['food-day-range'] as const;

/**
 * Build the canonical React Query key for a given local-day completion status.
 */
export function foodLogDayQueryKey(dateIso: string) {
    return ['food-day', dateIso] as const;
}

/**
 * Build the canonical React Query key for completion statuses in a date range.
 */
export function foodLogDayRangeQueryKey(startDateIso: string, endDateIso: string) {
    return [...FOOD_LOG_DAY_RANGE_QUERY_KEY_PREFIX, startDateIso, endDateIso] as const;
}

/**
 * Prefix key used to invalidate all cached completion-range queries after updates.
 */
export function foodLogDayRangeQueryKeyPrefix() {
    return FOOD_LOG_DAY_RANGE_QUERY_KEY_PREFIX;
}

/**
 * Fetch completion status for the requested local date (`YYYY-MM-DD`).
 */
export async function fetchFoodLogDay(dateIso: string): Promise<FoodLogDayStatus> {
    const res = await axios.get('/api/food-days?date=' + encodeURIComponent(dateIso));
    return res.data as FoodLogDayStatus;
}

/**
 * Fetch completion statuses for an inclusive local-date range (`YYYY-MM-DD` to `YYYY-MM-DD`).
 */
export async function fetchFoodLogDayRange(startDateIso: string, endDateIso: string): Promise<FoodLogDayRangeStatus> {
    const params = new URLSearchParams({
        start: startDateIso,
        end: endDateIso
    });
    const res = await axios.get('/api/food-days/range?' + params.toString());
    return res.data as FoodLogDayRangeStatus;
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
 * Shared hook for loading completion statuses over an inclusive local-date range.
 */
export function useFoodLogDayRangeQuery(startDateIso: string, endDateIso: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: foodLogDayRangeQueryKey(startDateIso, endDateIso),
        queryFn: () => fetchFoodLogDayRange(startDateIso, endDateIso),
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
