import { useEffect, useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { useFoodLogQuery } from '../queries/foodLog';
import { useMetricsQuery, toDatePart } from '../queries/metrics';
import { clearAppBadge, isBadgingSupported, setAppBadge } from '../utils/badging';
import { getTodayIsoDate } from '../utils/date';

/**
 * Keep the app badge in sync with today's incomplete logging state.
 */
export const useIncompleteTodayBadge = (): void => {
    const { user } = useAuth();
    const timeZone = useMemo(
        () => user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [user?.timezone]
    );
    const todayIso = useMemo(() => getTodayIsoDate(timeZone), [timeZone]);

    const foodQuery = useFoodLogQuery(todayIso, { enabled: Boolean(user) });
    const metricsQuery = useMetricsQuery({ enabled: Boolean(user) });

    useEffect(() => {
        if (!user) {
            void clearAppBadge();
            return;
        }

        if (!isBadgingSupported()) {
            void clearAppBadge();
            return;
        }

        if (foodQuery.isLoading || metricsQuery.isLoading) {
            return;
        }

        if (foodQuery.isError || metricsQuery.isError) {
            return;
        }

        const hasFoodLogs = (foodQuery.data?.length ?? 0) > 0;
        const hasWeightLog =
            metricsQuery.data?.some((metric) => toDatePart(metric.date) === todayIso) ?? false;
        const missingCount = (hasFoodLogs ? 0 : 1) + (hasWeightLog ? 0 : 1);

        if (missingCount === 0) {
            void clearAppBadge();
        } else {
            void setAppBadge(missingCount);
        }
    }, [
        foodQuery.data,
        foodQuery.isError,
        foodQuery.isLoading,
        metricsQuery.data,
        metricsQuery.isError,
        metricsQuery.isLoading,
        todayIso,
        user
    ]);
};
