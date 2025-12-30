import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { MealPeriod } from '../types/mealPeriod';

export type FoodLogEntry = {
    id: number;
    meal_period: MealPeriod;
    name: string;
    calories: number;
    my_food_id?: number | null;
    servings_consumed?: number | null;
    serving_size_quantity_snapshot?: number | null;
    serving_unit_label_snapshot?: string | null;
    calories_per_serving_snapshot?: number | null;
};

/**
 * Build the canonical React Query key for a given local-day food log.
 */
export function foodLogQueryKey(dateIso: string) {
    return ['food', dateIso] as const;
}

/**
 * Fetch food log entries for the requested local date (`YYYY-MM-DD`).
 */
export async function fetchFoodLog(dateIso: string): Promise<FoodLogEntry[]> {
    const res = await axios.get('/api/food?date=' + encodeURIComponent(dateIso));
    return Array.isArray(res.data) ? (res.data as FoodLogEntry[]) : [];
}

/**
 * Shared hook for loading a day's food log entries.
 *
 * Keeping this centralized ensures /dashboard and /log use identical caching and fetch behavior.
 */
export function useFoodLogQuery(dateIso: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: foodLogQueryKey(dateIso),
        queryFn: () => fetchFoodLog(dateIso),
        enabled: options?.enabled
    });
}
