import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { addDaysToDateOnly } from '../utils/dates';

/** Warms the most likely adjacent food-log query without crossing the account's history boundary. */
export function usePrefetchPreviousFoodLog(selectedDate: string, minDate: string): void {
    const { api } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
        const previousDate = addDaysToDateOnly(selectedDate, -1);
        if (previousDate < minDate) return;

        void queryClient.prefetchQuery({
            queryKey: ['mobile-food', previousDate],
            queryFn: () => api.getFoodLog(previousDate)
        });
        void queryClient.prefetchQuery({
            queryKey: ['mobile-food-day', previousDate],
            queryFn: () => api.getFoodDay(previousDate)
        });
    }, [api, minDate, queryClient, selectedDate]);
}
