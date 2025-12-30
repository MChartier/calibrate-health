import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { MyFood, MyFoodType } from '../types/myFoods';

export type MyFoodsQueryArgs = {
    q?: string;
    type?: MyFoodType | 'ALL';
};

/**
 * Build the canonical React Query key for a user's My Foods search.
 */
export function myFoodsQueryKey(args: MyFoodsQueryArgs) {
    return ['my-foods', args.q?.trim() || '', args.type || 'ALL'] as const;
}

/**
 * Fetch a user's My Foods list, optionally filtered by query/type.
 */
export async function fetchMyFoods(args: MyFoodsQueryArgs): Promise<MyFood[]> {
    const q = args.q?.trim();
    const type = args.type && args.type !== 'ALL' ? args.type : undefined;
    const res = await axios.get('/api/my-foods', {
        params: {
            ...(q ? { q } : {}),
            ...(type ? { type } : {})
        }
    });

    return Array.isArray(res.data) ? (res.data as MyFood[]) : [];
}

/**
 * Shared hook for browsing/searching a user's My Foods library.
 */
export function useMyFoodsQuery(args: MyFoodsQueryArgs, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: myFoodsQueryKey(args),
        queryFn: () => fetchMyFoods(args),
        enabled: options?.enabled
    });
}

