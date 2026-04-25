import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { MealPeriod } from '../types/mealPeriod';

/**
 * React Query helpers for repeat-friendly recent food suggestions.
 */
export type RecentFood = {
    id: string;
    name: string;
    meal_period: MealPeriod;
    calories: number;
    my_food_id?: number | null;
    servings_consumed?: number | null;
    serving_size_quantity_snapshot?: number | null;
    serving_unit_label_snapshot?: string | null;
    calories_per_serving_snapshot?: number | null;
    external_source?: string | null;
    external_id?: string | null;
    brand_snapshot?: string | null;
    locale_snapshot?: string | null;
    barcode_snapshot?: string | null;
    measure_label_snapshot?: string | null;
    grams_per_measure_snapshot?: number | null;
    measure_quantity_snapshot?: number | null;
    grams_total_snapshot?: number | null;
    last_logged_at: string;
    times_logged: number;
};

export type RecentFoodsQueryArgs = {
    q?: string;
    limit?: number;
};

export function recentFoodsQueryKey(args: RecentFoodsQueryArgs) {
    return ['recent-foods', args.q?.trim() || '', args.limit ?? 12] as const;
}

export async function fetchRecentFoods(args: RecentFoodsQueryArgs): Promise<RecentFood[]> {
    const res = await axios.get('/api/food/recent', {
        params: {
            ...(args.q?.trim() ? { q: args.q.trim() } : {}),
            ...(typeof args.limit === 'number' ? { limit: args.limit } : {})
        }
    });

    return Array.isArray(res.data?.items) ? (res.data.items as RecentFood[]) : [];
}

export function useRecentFoodsQuery(args: RecentFoodsQueryArgs, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: recentFoodsQueryKey(args),
        queryFn: () => fetchRecentFoods(args),
        enabled: options?.enabled
    });
}
